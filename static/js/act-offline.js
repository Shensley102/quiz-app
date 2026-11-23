(() => {
  const storageKey = 'act-offline-library-v1';
  const mutationLock = 'act-offline-library';
  const cachePrefix = 'act-offline-copy-';
  const legacyPrefix = 'act-protocol-pdfs-';
  const versionPattern = /^[a-f0-9]{64}$/;
  const listeners = new Set();
  const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel(mutationLock) : null;
  const legacyCopies = new Map();
  const legacyFiles = new Set();
  const missingCaches = new Set();
  let supported = Boolean(window.caches && navigator.locks && window.crypto?.subtle);
  let library = readLibrary();
  let controller = null;
  let runner = null;
  let inMutation = false;
  let otherTabRunning = false;
  let measuredLegacy = null;
  let refreshGeneration = 0;

  function readLibrary() {
    const empty = { copies: {}, retired: [], listing: {}, legacyVersions: {}, lastChecked: null, job: null };
    try {
      return { ...empty, ...JSON.parse(localStorage.getItem(storageKey)) };
    } catch {
      supported = false;
      return empty;
    }
  }

  function emit() {
    for (const listener of listeners) {
      try {
        listener();
      } catch (error) {
        console.error('[ACT Offline] Could not refresh download controls', error);
      }
    }
  }

  function saveLibrary() {
    localStorage.setItem(storageKey, JSON.stringify(library));
    emit();
  }

  function resourceUrl(kind, file, version, page) {
    const query = new URLSearchParams({ file });
    if (page) {
      query.set('page', page);
      query.set('scale', '2');
    }
    if (version) query.set('version', version);
    return `/act-protocols/pdf-${kind}?${query}`;
  }

  function isValidVersion(version) {
    return typeof version === 'string' && versionPattern.test(version);
  }

  async function versionOf(bytes) {
    const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    return Array.from(hash, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  function pageCount(info) {
    const count = Number(info?.pageCount || info?.page_count);
    return Number.isSafeInteger(count) && count > 0 ? count : 0;
  }

  function pageUrls(file, version, count) {
    return Array.from({ length: count }, (_, index) => resourceUrl('page', file, version, index + 1));
  }

  function readerInfo(info) {
    return { ...info, pageCount: pageCount(info), pageSizes: info.dimensions };
  }

  async function getLegacyCaches() {
    const names = await caches.keys();
    return Promise.all(names.filter(name => name.startsWith(legacyPrefix)).reverse()
      .map(async name => ({ name, cache: await caches.open(name) })));
  }

  async function legacyResources(sources) {
    const byFile = new Map();
    for (const { cache } of sources) {
      for (const request of await cache.keys()) {
        const url = new URL(request.url);
        const file = url.searchParams.get('file') || decodeURIComponent(url.pathname);
        if (!/^\/static\/protocols\/act\/.+\.pdf$/i.test(file)) continue;
        if (!byFile.has(file)) byFile.set(file, []);
        byFile.get(file).push({ cache, request });
      }
    }
    return byFile;
  }

  async function inspectLegacy(file, sources) {
    let partial = null;
    for (const { name, cache } of sources) {
      const pdf = await cache.match(encodeURI(file));
      if (!pdf?.ok) continue;
      partial ||= { name, count: 0 };
      const metadata = await cache.match(resourceUrl('info', file));
      const info = metadata?.ok ? await metadata.json().catch(() => null) : null;
      const count = pageCount(info);
      if (!count) continue;
      const pages = await Promise.all(pageUrls(file, null, count).map(url => cache.match(url)));
      if (pages.every(page => page?.ok)) return { name, count, info };
      partial = { name, count: 0, seenPages: count };
    }
    return partial;
  }

  async function refresh() {
    const generation = ++refreshGeneration;
    if (!window.caches) return emit();
    const copyCandidates = Object.values(readLibrary().copies);
    const [sources, names, locks] = await Promise.all([
      getLegacyCaches(),
      caches.keys(),
      navigator.locks?.query().catch(() => null)
    ]);
    const resources = await legacyResources(sources);
    const oldCopies = await Promise.all([...resources.keys()].map(async file =>
      [file, await inspectLegacy(file, sources)]));
    if (generation !== refreshGeneration) return;
    if (!inMutation) library = readLibrary();
    otherTabRunning = Boolean(locks?.held.some(lock => lock.name === mutationLock));
    legacyCopies.clear();
    legacyFiles.clear();
    for (const [file, copy] of oldCopies) {
      legacyFiles.add(file);
      if (copy) legacyCopies.set(file, copy);
    }
    // The browser can evict Cache Storage while retaining the document catalog.
    missingCaches.clear();
    for (const copy of copyCandidates) {
      if (!names.includes(copy.cache)) missingCaches.add(copy.cache);
    }
    emit();
  }

  function activeJob() {
    const job = library.job;
    return job && job.index < job.items.length && ['downloading', 'paused'].includes(job.status) ? job : null;
  }

  function documentStatus(file) {
    const saved = library.copies[file];
    const copy = saved && !missingCaches.has(saved.cache) ? saved : null;
    const old = legacyCopies.get(file);
    const remote = library.listing[file];
    const job = activeJob();
    const pending = job?.items.slice(job.index).find(item => item.file === file);
    const oldVersion = old && library.legacyVersions[file];
    let updateStatus = 'unchecked';
    if (copy && remote) updateStatus = copy.version === remote.version ? 'current' : 'available';
    else if (oldVersion && remote && oldVersion !== remote.version) updateStatus = 'available';
    return {
      available: Boolean(copy),
      partial: Boolean(pending?.bytes || (!copy && legacyFiles.has(file) && !old?.count)),
      legacy: Boolean(old?.count),
      legacyReadable: Boolean(old?.count),
      queued: Boolean(pending),
      version: copy?.version || null,
      updateStatus,
      updateable: updateStatus === 'available' || Boolean(old?.count && !copy),
      lastChecked: library.lastChecked,
      estimatedPdfBytes: remote?.size || null,
      bytes: copy?.bytes || 0
    };
  }

  function queueStatus() {
    const job = library.job;
    if (!job) return { status: 'idle', reason: '', title: '', page: 0, pages: 0, completed: 0, total: 0, files: [] };
    const item = job.items[job.index];
    let status = job.status;
    let reason = job.reason;
    if (!item && !runner && !otherTabRunning) {
      status = 'complete';
      reason = '';
    } else if (job.status === 'downloading' && !runner && !inMutation && !otherTabRunning) {
      status = 'paused';
      reason = 'Downloads paused when the app closed.';
    }
    return {
      status,
      reason,
      title: item?.title || '',
      page: item?.page || 0,
      pages: item?.pages || 0,
      completed: job.index,
      total: job.items.length,
      files: activeJob() ? job.items.slice(job.index).map(entry => entry.file) : []
    };
  }

  async function exclusively(callback) {
    if (!supported) throw new Error('Offline downloads are unavailable in this browser.');
    return navigator.locks.request(mutationLock, { ifAvailable: true }, async lock => {
      if (!lock) throw new Error('An offline operation is already running in another tab.');
      inMutation = true;
      try {
        library = readLibrary();
        return await callback();
      } finally {
        inMutation = false;
      }
    });
  }

  async function fetchListing(signal, compareLegacy = false) {
    if (!navigator.onLine) throw new Error('Reconnect to check document versions.');
    const response = await fetch('/act-protocols/versions', { cache: 'no-store', signal });
    if (!response.ok) throw new Error('Unable to check document versions. Try again when connected.');
    const result = await response.json();
    if (!Array.isArray(result.documents)) throw new Error('Document versions could not be read.');
    const entries = result.documents.map(document => {
      if (!isValidVersion(document.version) || typeof document.file !== 'string' ||
          !Number.isSafeInteger(document.size) || document.size <= 0) {
        throw new Error('The server returned an invalid document version.');
      }
      return [document.file, { version: document.version, size: document.size }];
    });
    if (compareLegacy) {
      for (const [file, copy] of legacyCopies) {
        if (library.copies[file] || !copy.count) continue;
        const cache = await caches.open(copy.name);
        const pdf = await cache.match(encodeURI(file));
        if (pdf?.ok) library.legacyVersions[file] = await versionOf(await pdf.arrayBuffer());
      }
    }
    library.listing = Object.fromEntries(entries);
    library.lastChecked = new Date().toISOString();
    saveLibrary();
    return {
      lastChecked: library.lastChecked,
      updates: result.documents.filter(({ file }) => documentStatus(file).updateStatus === 'available').length
    };
  }

  function resourceError(response) {
    if (response.status === 409) {
      const error = new Error('The document changed during download. Resume to download its current version.');
      error.name = 'StaleDocumentError';
      return error;
    }
    return new Error(`The document server returned HTTP ${response.status}. Try resuming the download.`);
  }

  function verifyPageImage(bytes) {
    const png = [137, 80, 78, 71, 13, 10, 26, 10];
    const header = new Uint8Array(bytes, 0, Math.min(bytes.byteLength, png.length));
    return png.every((byte, index) => header[index] === byte);
  }

  async function checkedResource(url, kind, item, bytes, signal) {
    const response = await fetch(url, { cache: 'no-store', signal });
    if (!response.ok) throw resourceError(response);
    if (response.headers.get('X-ACT-PDF-Version') !== item.version) {
      throw new Error('The server returned resources from different document versions.');
    }
    const data = await response.arrayBuffer();
    signal.throwIfAborted();
    if (!data.byteLength) throw new Error('The server returned an empty document resource.');
    if (kind === 'file' && (data.byteLength !== bytes || await versionOf(data) !== item.version)) {
      throw new Error('The downloaded PDF did not match the checked document version.');
    }
    if (kind === 'page' && !verifyPageImage(data)) throw new Error('A downloaded page is not a valid PNG image.');
    return new Response(data, {
      headers: {
        'Content-Type': response.headers.get('Content-Type') || 'application/octet-stream',
        'Content-Length': String(data.byteLength),
        'X-ACT-PDF-Version': item.version
      }
    });
  }

  async function stageResource(cache, kind, item, signal, page) {
    signal.throwIfAborted();
    const url = resourceUrl(kind, item.file, item.version, page);
    let response = await cache.match(url);
    if (!response?.ok || response.headers.get('X-ACT-PDF-Version') !== item.version) {
      response = await checkedResource(url, kind, item, item.size, signal);
      signal.throwIfAborted();
      await cache.put(url, response.clone());
    }
    item.bytes += Number(response.headers.get('Content-Length')) || 0;
    return response;
  }

  function textPages(result, count, version) {
    if (!result?.success || result.version !== version || !Array.isArray(result.pages) ||
        result.pages.some(entry => !Number.isSafeInteger(entry.page) ||
          entry.page < 1 || entry.page > count || typeof entry.text !== 'string')) {
      throw new Error('Document search text could not be verified.');
    }
    return result.pages;
  }

  async function download(item, signal) {
    const cache = await caches.open(item.cache);
    item.bytes = 0;
    item.page = 0;
    await stageResource(cache, 'file', item, signal);
    saveLibrary();
    const metadata = await stageResource(cache, 'info', item, signal);
    const info = await metadata.json().catch(() => null);
    const count = pageCount(info);
    if (!info?.success || info.version !== item.version || !count) {
      await cache.delete(resourceUrl('info', item.file, item.version));
      throw new Error('Document metadata could not be verified.');
    }
    item.pages = count;
    saveLibrary();
    const text = await stageResource(cache, 'text', item, signal);
    try {
      textPages(await text.json(), count, item.version);
    } catch (error) {
      await cache.delete(resourceUrl('text', item.file, item.version));
      throw error;
    }
    for (let page = 1; page <= count; page += 1) {
      await stageResource(cache, 'page', item, signal, page);
      item.page = page;
      saveLibrary();
    }

    signal.throwIfAborted();
    const previous = library.copies[item.file];
    const completed = { cache: item.cache, version: item.version, bytes: item.bytes, pages: count };
    const job = library.job;
    // A single catalog write publishes the verified copy and advances the job.
    // If publication fails, the old pointer still names the previous complete copy.
    const next = {
      ...library,
      copies: { ...library.copies, [item.file]: completed },
      retired: previous ? [...library.retired, previous.cache] : library.retired,
      job: { ...job, index: job.index + 1 }
    };
    localStorage.setItem(storageKey, JSON.stringify(next));
    library = next;
    emit();
  }

  async function cleanupRetired() {
    const originalCount = library.retired.length;
    for (const name of [...library.retired]) {
      const deleted = await navigator.locks.request(name, { ifAvailable: true }, async lock => {
        if (!lock) return false;
        await caches.delete(name);
        return true;
      });
      if (deleted) library.retired = library.retired.filter(entry => entry !== name);
    }
    if (library.retired.length !== originalCount) saveLibrary();
  }

  function pauseReason(error, signal) {
    if (signal.aborted) return String(signal.reason);
    if (error.name === 'QuotaExceededError') return 'Storage is full. Free space or cancel this download.';
    if (!navigator.onLine || error instanceof TypeError) return 'Connection interrupted. Reconnect and resume.';
    return error.message || 'Download interrupted. Try resuming.';
  }

  function run() {
    if (runner) return;
    controller = new AbortController();
    const { signal } = controller;
    runner = exclusively(async () => {
      const job = library.job;
      if (!job || !['downloading', 'paused'].includes(job.status)) return;
      job.status = 'downloading';
      job.reason = '';
      saveLibrary();
      try {
        if (!navigator.onLine) throw new TypeError('Offline');
        if (job.stale) {
          await fetchListing(signal);
          const item = job.items[job.index];
          const fresh = library.listing[item.file];
          if (!fresh) throw new Error('This document is no longer listed for download. Cancel to keep completed copies.');
          if (fresh.version !== item.version) {
            await caches.delete(item.cache);
            Object.assign(item, fresh, { bytes: 0, page: 0, pages: 0 });
          }
          job.stale = false;
          saveLibrary();
        }
        while (library.job.index < library.job.items.length) {
          signal.throwIfAborted();
          await download(library.job.items[library.job.index], signal);
        }
        await cleanupRetired().catch(error => console.warn('[ACT Offline] Could not clean up retired document copies', error));
        library.job.status = 'complete';
        saveLibrary();
      } catch (error) {
        library = readLibrary();
        library.job.status = 'paused';
        library.job.reason = pauseReason(error, signal);
        library.job.stale ||= error.name === 'StaleDocumentError';
        saveLibrary();
      }
    }).catch(error => {
      console.warn('[ACT Offline] Download operation interrupted', error);
    }).finally(() => {
      controller = null;
      runner = null;
      library = readLibrary();
      emit();
    });
    emit();
  }

  async function start(protocols, { update = false } = {}) {
    await exclusively(async () => {
      if (['downloading', 'paused'].includes(queueStatus().status)) {
        throw new Error('Resume or cancel the current download before starting another.');
      }
      await fetchListing();
      const unique = [...new Map(protocols.map(protocol => [protocol.file, protocol])).values()];
      const requested = unique.filter(({ file }) => {
        const status = documentStatus(file);
        return update ? status.updateable : !status.available && !status.legacyReadable;
      });
      if (!requested.length) {
        throw new Error(update ? 'No updates are available for these documents.' : 'These documents are already saved offline.');
      }
      const items = requested.map(protocol => {
        const remote = library.listing[protocol.file];
        if (!remote) throw new Error(`No download version is available for ${protocol.title || protocol.file}.`);
        return {
          file: protocol.file,
          title: protocol.title || protocol.file,
          ...remote,
          cache: cachePrefix + crypto.randomUUID(),
          bytes: 0, page: 0, pages: 0
        };
      });
      library.job = { status: 'downloading', reason: '', items, index: 0 };
      saveLibrary();
    });
    run();
  }

  async function pause(reason = 'Downloads paused.', forward = true) {
    if (controller) {
      controller.abort(reason);
      await runner;
    } else if (forward && otherTabRunning) {
      if (!channel) throw new Error('Pause downloads from the tab that started them.');
      channel.postMessage({ action: 'pause', reason });
    }
  }

  async function cancel(forward = true) {
    if (!runner && otherTabRunning && forward && channel) {
      channel.postMessage({ action: 'cancel' });
      return;
    }
    await pause('Download canceled.', false);
    return exclusively(async () => {
      const job = library.job;
      if (!job || !['downloading', 'paused'].includes(job.status)) return;
      const unfinished = job.items.slice(job.index);
      for (const item of unfinished) await caches.delete(item.cache);
      job.status = 'canceled';
      job.reason = 'Unfinished downloads discarded.';
      job.items = job.items.map(item => ({ ...item, bytes: 0, page: 0, pages: 0 }));
      saveLibrary();
    });
  }

  async function remove(protocols) {
    return exclusively(async () => {
      const oldResources = await legacyResources(await getLegacyCaches());
      const files = new Set(protocols
        ? protocols.map(protocol => protocol.file)
        : [...Object.keys(library.copies), ...oldResources.keys()]);
      const queue = queueStatus();
      if (['downloading', 'paused'].includes(queue.status) && queue.files.some(file => files.has(file))) {
        throw new Error('Cancel the current download before removing these documents.');
      }
      for (const file of files) {
        const resources = oldResources.get(file);
        if (resources) {
          await navigator.locks.request(`act-offline-legacy:${file}`, { ifAvailable: true }, async lock => {
            if (!lock) throw new Error('Close the document reader before removing its older offline copy.');
            await Promise.all(resources.map(({ cache, request }) => cache.delete(request)));
          });
          legacyCopies.delete(file);
          legacyFiles.delete(file);
          delete library.legacyVersions[file];
          measuredLegacy = null;
        }
        const active = library.copies[file];
        if (active) {
          delete library.copies[file];
          library.retired.push(active.cache);
        }
        saveLibrary();
      }
      await cleanupRetired();
    });
  }

  async function measureLegacyStorage() {
    let savedBytes = 0;
    let partialBytes = 0;
    const groups = new Map();
    for (const [file, copy] of legacyCopies) {
      if (!groups.has(copy.name)) groups.set(copy.name, []);
      groups.get(copy.name).push({ file, copy });
    }
    for (const [name, entries] of groups) {
      const cache = await caches.open(name);
      for (const { file, copy } of entries) {
        const urls = [encodeURI(file), resourceUrl('info', file), ...pageUrls(file, null, copy.count || copy.seenPages || 0)];
        let bytes = 0;
        for (const url of urls) {
          const response = await cache.match(url);
          if (response?.ok) bytes += (await response.blob()).size;
        }
        if (copy.count) savedBytes += bytes;
        else partialBytes += bytes;
      }
    }
    return { savedBytes, partialBytes };
  }

  async function storage() {
    if (!window.caches) return { savedBytes: 0, partialBytes: 0, quota: null };
    measuredLegacy ||= measureLegacyStorage().catch(() => ({ savedBytes: 0, partialBytes: 0 }));
    const [old, estimate] = await Promise.all([
      measuredLegacy,
      navigator.storage?.estimate?.().catch(() => null)
    ]);
    const savedBytes = Object.values(library.copies)
      .filter(copy => !missingCaches.has(copy.cache))
      .reduce((total, copy) => total + copy.bytes, old.savedBytes);
    const job = activeJob();
    const partialBytes = job?.items.slice(job.index).reduce((total, item) => total + item.bytes, old.partialBytes)
      ?? old.partialBytes;
    return { savedBytes, partialBytes, quota: estimate?.quota ?? null };
  }

  async function holdReaderLock(name) {
    if (!navigator.locks) return () => {};
    let release;
    const held = new Promise(resolve => { release = resolve; });
    return new Promise((resolve, reject) => {
      navigator.locks.request(name, { mode: 'shared' }, () => {
        resolve(release);
        return held;
      }).catch(reject);
    });
  }

  async function cachedDocument(file, copy, legacy = false) {
    const name = legacy ? copy.name : copy.cache;
    const lock = legacy ? `act-offline-legacy:${file}` : name;
    const release = await holdReaderLock(lock);
    try {
      if (!(await caches.has(name))) throw new Error('The offline copy is no longer saved.');
      const cache = await caches.open(name);
      const info = copy.info || await (await cache.match(resourceUrl('info', file, copy.version)))?.json();
      if (!pageCount(info)) throw new Error('The saved document metadata is missing.');
      const version = legacy
        ? (crypto.subtle ? await versionOf(await (await cache.match(encodeURI(file))).arrayBuffer()) : 'legacy')
        : copy.version;
      const resourceVersion = legacy ? null : version;
      return {
        version,
        info: readerInfo(info),
        async getPageUrl(page) {
          const response = await cache.match(resourceUrl('page', file, resourceVersion, page));
          if (!response?.ok) throw new Error('The saved page is missing.');
          return URL.createObjectURL(await response.blob());
        },
        async getText() {
          if (legacy) {
            // Old copies had no versioned text asset. Reuse the local index only
            // if it was generated from these exact PDF bytes.
            const cachedIndex = await caches.match('/static/data/act-protocol-search.json');
            if (!cachedIndex?.ok) return [];
            const index = await cachedIndex.json().catch(() => null);
            const record = Array.isArray(index) && index.find(entry => entry.file === file && entry.pdfVersion === version);
            return record ? textPages({ success: true, version, pages: record.pages }, pageCount(info), version) : [];
          }
          const response = await cache.match(resourceUrl('text', file, version));
          if (!response?.ok) throw new Error('The saved search text is missing.');
          return textPages(await response.json(), pageCount(info), version);
        },
        close() {
          release();
          if (!legacy && supported && !runner) {
            exclusively(cleanupRetired).catch(() => {});
          }
        }
      };
    } catch (error) {
      release();
      throw error;
    }
  }

  async function onlineDocument(file) {
    const response = await fetch(resourceUrl('info', file), { cache: 'no-store' });
    if (!response.ok) throw resourceError(response);
    const info = await response.json();
    const version = response.headers.get('X-ACT-PDF-Version');
    if (!info.success || !pageCount(info) || !isValidVersion(version) || info.version !== version) {
      throw new Error('Document information is unavailable.');
    }
    return {
      version,
      info: readerInfo(info),
      async getPageUrl(page) {
        return resourceUrl('page', file, version, page);
      },
      async getText() {
        const response = await fetch(resourceUrl('text', file, version), { cache: 'no-store' });
        if (!response.ok) throw resourceError(response);
        return textPages(await response.json(), pageCount(info), version);
      },
      close() {}
    };
  }

  async function openDocument(file) {
    if (window.caches) {
      const copy = readLibrary().copies[file];
      if (copy) {
        try {
          return await cachedDocument(file, copy);
        } catch (error) {
          const latest = readLibrary().copies[file];
          if (latest && latest.cache !== copy.cache) return cachedDocument(file, latest);
          console.warn('[ACT Offline] Saved copy unavailable', error);
        }
      }
    }
    try {
      if (navigator.onLine) return await onlineDocument(file);
    } catch (error) {
      const legacy = window.caches && await inspectLegacy(file, await getLegacyCaches());
      if (legacy?.count) return cachedDocument(file, legacy, true);
      throw error;
    }
    const legacy = window.caches && await inspectLegacy(file, await getLegacyCaches());
    if (legacy?.count) return cachedDocument(file, legacy, true);
    throw new Error('This document is not saved for offline reading.');
  }

  window.addEventListener('offline', () => {
    if (controller) pause('Connection interrupted. Reconnect and resume.').catch(console.warn);
  });
  window.addEventListener('pagehide', () => {
    if (controller) pause('Downloads paused when the app closed.').catch(console.warn);
  });
  window.addEventListener('storage', ({ key }) => {
    if (key === storageKey && !inMutation) {
      library = readLibrary();
      measuredLegacy = null;
      if (library.job?.status === 'downloading') otherTabRunning = true;
      emit();
    }
  });
  channel?.addEventListener('message', ({ data }) => {
    if (!runner) return;
    if (data?.action === 'pause') pause(data.reason, false).catch(console.warn);
    if (data?.action === 'cancel') cancel(false).catch(console.warn);
  });

  window.ACTOffline = {
    get supported() { return supported; },
    async init() {
      await refresh();
      if (supported) await exclusively(cleanupRetired).catch(() => {});
    },
    refresh,
    document: documentStatus,
    queue: queueStatus,
    lastChecked: () => library.lastChecked,
    hasSavedCopies: () => legacyFiles.size > 0 || Object.values(library.copies).some(copy => !missingCaches.has(copy.cache)),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    start,
    pause,
    async resume() {
      if (!navigator.onLine) throw new Error('Reconnect before resuming downloads.');
      if (queueStatus().status !== 'paused') return;
      run();
    },
    cancel,
    remove,
    checkUpdates: () => exclusively(() => fetchListing(undefined, true)),
    storage,
    openDocument
  };
})();
