(() => {
  const storageKey = 'act-offline-library-v1';
  const mutationLock = 'act-offline-library';
  const cachePrefix = 'act-offline-copy-';
  const legacyPrefix = 'act-protocol-pdfs-';
  const versionPattern = /^[a-f0-9]{64}$/;
  const pauseMessages = {
    manual: 'Downloads paused.',
    offline: 'Connection interrupted. Downloads will resume when you reconnect.',
    closed: 'Downloads paused when the app closed.',
    operation: 'Downloads paused while offline copies are removed.'
  };
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
  let automaticProtocols = [];
  let automaticController = null;
  let automaticDeferred = false;
  let foregroundActions = 0;
  let pageActive = true;

  function readLibrary() {
    const empty = { copies: {}, retired: [], listing: {}, legacyVersions: {}, lastChecked: null, job: null };
    const preferences = { disabled: false, excluded: [] };
    try {
      const saved = { ...empty, ...JSON.parse(localStorage.getItem(storageKey)) };
      if (!saved.automatic && saved.job?.status === 'canceled') {
        preferences.excluded = saved.job.items.slice(saved.job.index).map(item => item.file);
      }
      saved.automatic = { ...preferences, ...saved.automatic };
      return saved;
    } catch {
      supported = false;
      return { ...empty, automatic: preferences };
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
    otherTabRunning = !inMutation && !runner && Boolean(locks?.held.some(lock => lock.name === mutationLock));
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

  function canResumeAutomatically(job) {
    return job.status === 'downloading' || ['offline', 'closed', 'operation'].includes(job.pauseKind) ||
      (!job.pauseKind && [pauseMessages.closed, 'Connection interrupted. Reconnect and resume.'].includes(job.reason));
  }

  function jobIdentity(job) {
    return job?.items[0]?.cache;
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
    if (!job) return { status: 'idle', reason: '', title: '', page: 0, pages: 0, completed: 0, total: 0,
      files: [], automatic: false, external: false };
    const item = job.items[job.index];
    let status = job.status;
    let reason = job.reason;
    if (!item && activeStatus(status) && !runner && !otherTabRunning) {
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
      automatic: Boolean(job.automatic),
      external: status === 'downloading' && !runner && !inMutation && otherTabRunning,
      files: activeJob() ? job.items.slice(job.index).map(entry => entry.file) : []
    };
  }

  function activeStatus(status) {
    return status === 'downloading' || status === 'paused';
  }

  async function exclusively(callback, skipBusy = false, signal) {
    if (!supported) throw new Error('Offline downloads are unavailable in this browser.');
    const options = signal ? { signal } : { ifAvailable: true };
    return navigator.locks.request(mutationLock, options, async lock => {
      if (!lock && skipBusy) return;
      if (!lock) throw new Error('An offline operation is already running in another tab.');
      inMutation = true;
      try {
        otherTabRunning = false;
        library = readLibrary();
        return await callback();
      } finally {
        inMutation = false;
      }
    });
  }

  async function downloadResponse(url, options) {
    try {
      return await fetch(url, options);
    } catch (error) {
      if (options.signal?.aborted) throw error;
      const failure = new Error(pauseMessages.offline);
      failure.name = 'ACTConnectionError';
      throw failure;
    }
  }

  async function requestListing(signal) {
    if (!navigator.onLine) throw new Error('Reconnect to check document versions.');
    const response = await downloadResponse('/act-protocols/versions', { cache: 'no-store', signal });
    if (!response.ok) throw new Error('Unable to check document versions. Try again when connected.');
    const result = await response.json();
    if (!Array.isArray(result.documents)) throw new Error('Document versions could not be read.');
    return Object.fromEntries(result.documents.map(document => {
      if (!isValidVersion(document.version) || typeof document.file !== 'string' ||
          !Number.isSafeInteger(document.size) || document.size <= 0) {
        throw new Error('The server returned an invalid document version.');
      }
      return [document.file, { version: document.version, size: document.size }];
    }));
  }

  function recordListing(listing) {
    library.listing = listing;
    library.lastChecked = new Date().toISOString();
  }

  async function fetchListing(signal, compareLegacy = false) {
    const listing = await requestListing(signal);
    if (compareLegacy) {
      for (const [file, copy] of legacyCopies) {
        if (library.copies[file] || !copy.count) continue;
        const cache = await caches.open(copy.name);
        const pdf = await cache.match(encodeURI(file));
        if (pdf?.ok) library.legacyVersions[file] = await versionOf(await pdf.arrayBuffer());
      }
    }
    recordListing(listing);
    saveLibrary();
    return {
      lastChecked: library.lastChecked,
      updates: Object.keys(listing).filter(file => documentStatus(file).updateStatus === 'available').length
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
    const response = await downloadResponse(url, { cache: 'no-store', signal });
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

  function pauseDetails(error, signal) {
    if (signal.aborted) return signal.reason;
    if (!navigator.onLine || error?.name === 'ACTConnectionError') {
      return { kind: 'offline', message: pauseMessages.offline };
    }
    const message = error?.name === 'QuotaExceededError'
      ? 'Storage is full. Free space or cancel this download.'
      : error?.message || 'Download interrupted. Try resuming.';
    return { kind: 'error', message };
  }

  function run({ recoverOnly = false, waitForLock = false, expectedJob = jobIdentity(library.job) } = {}) {
    if (runner) return;
    controller = new AbortController();
    const { signal } = controller;
    runner = exclusively(async () => {
      const job = activeJob();
      if (!job || jobIdentity(job) !== expectedJob) return;
      if (recoverOnly && (!canResumeAutomatically(job) || foregroundActions || !pageActive)) return;
      job.status = 'downloading';
      job.reason = '';
      job.pauseKind = null;
      saveLibrary();
      try {
        signal.throwIfAborted();
        if (!navigator.onLine) throw new Error('Offline');
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
        const details = pauseDetails(error, signal);
        library.job.status = 'paused';
        library.job.reason = details.message;
        library.job.pauseKind = details.kind;
        library.job.stale ||= error?.name === 'StaleDocumentError';
        saveLibrary();
      }
    }, recoverOnly, waitForLock ? signal : undefined).catch(error => {
      if (!signal.aborted) console.warn('[ACT Offline] Download operation interrupted', error);
    }).finally(() => {
      controller = null;
      runner = null;
      library = readLibrary();
      emit();
      drainAutomaticRequest();
    });
    emit();
  }

  async function foreground(callback) {
    foregroundActions += 1;
    if (automaticController) {
      automaticDeferred = true;
      automaticController.abort();
    }
    try {
      return await callback();
    } finally {
      foregroundActions -= 1;
      drainAutomaticRequest();
    }
  }

  function installJob(protocols, automatic = false) {
    const items = protocols.map(protocol => {
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
    library.job = { automatic, status: 'downloading', reason: '', items, index: 0 };
    saveLibrary();
  }

  async function start(protocols, { update = false, all = false } = {}) {
    return foreground(async () => {
      const queued = await exclusively(async () => {
        if (activeJob()) throw new Error('Resume or cancel the current download before starting another.');
        if (update) await fetchListing();
        const unique = [...new Map(protocols.map(protocol => [protocol.file, protocol])).values()];
        const requested = unique.filter(({ file }) => {
          const status = documentStatus(file);
          return update ? status.updateable : !status.available && !status.legacyReadable;
        });
        if (!requested.length && all && !update) {
          library.automatic = { disabled: false, excluded: [] };
          saveLibrary();
          return false;
        }
        if (!requested.length) {
          throw new Error(update ? 'No updates are available for these documents.' : 'These documents are already saved offline.');
        }
        if (!update) {
          await fetchListing();
          const files = new Set(requested.map(protocol => protocol.file));
          if (all) library.automatic = { disabled: false, excluded: [] };
          else library.automatic.excluded = library.automatic.excluded.filter(file => !files.has(file));
        }
        installJob(requested);
        return true;
      });
      if (queued) run();
    });
  }

  function missingForAutomatic() {
    if (library.automatic.disabled) return [];
    const excluded = new Set(library.automatic.excluded);
    return automaticProtocols.filter(({ file }) => {
      const status = documentStatus(file);
      return !excluded.has(file) && !status.available && !status.legacyReadable;
    });
  }

  function drainAutomaticRequest() {
    if (!automaticDeferred || automaticController || foregroundActions || runner) return;
    automaticDeferred = false;
    scheduleAutomatic();
  }

  async function scheduleAutomatic() {
    if (!supported || !automaticProtocols.length || !pageActive || !navigator.onLine) return;
    if (foregroundActions || controller?.signal.aborted || automaticController?.signal.aborted) {
      automaticDeferred = true;
      return;
    }
    if (runner || automaticController) return;
    library = readLibrary();
    const pending = activeJob();
    if (pending) {
      if (canResumeAutomatically(pending)) {
        // A second tab can observe a persisted pause just before the current
        // downloader releases the lock. Wait for that handoff and recheck.
        run({ recoverOnly: true, waitForLock: pending.status === 'paused' });
      }
      return;
    }
    if (!missingForAutomatic().length) return;

    automaticController = new AbortController();
    const { signal } = automaticController;
    let queued;
    try {
      // Leave the mutation lock free while fetching the small listing so manual
      // controls can take priority even if the request is slow.
      const listing = await requestListing(signal);
      queued = await exclusively(() => {
        if (signal.aborted || foregroundActions || !pageActive || !navigator.onLine || activeJob()) return false;
        const needed = missingForAutomatic().filter(({ file }) => Object.hasOwn(listing, file));
        if (!needed.length) return false;
        recordListing(listing);
        installJob(needed, true);
        return true;
      }, true);
    } catch (error) {
      if (!signal.aborted) console.warn('[ACT Offline] Could not start automatic downloads', error);
    } finally {
      automaticController = null;
    }
    if (queued && !foregroundActions) run({ recoverOnly: true, waitForLock: true });
    drainAutomaticRequest();
  }

  async function suspend(kind) {
    if (!controller) return false;
    controller.abort({ kind, message: pauseMessages[kind] });
    await runner;
    return true;
  }

  async function pause(forward = true, expectedJob = jobIdentity(library.job)) {
    return foreground(async () => {
      if (jobIdentity(library.job) !== expectedJob) return;
      await suspend('manual');
      // An automatic suspension may already have aborted the controller. The
      // explicit pause still takes precedence over automatic resume.
      const settled = await exclusively(() => {
        const job = activeJob();
        if (job && jobIdentity(job) === expectedJob) {
          job.status = 'paused';
          job.pauseKind = 'manual';
          job.reason = pauseMessages.manual;
          saveLibrary();
        }
        return true;
      }, true);
      if (!settled && forward) {
        if (!channel) throw new Error('Pause downloads from the tab that started them.');
        channel.postMessage({ action: 'pause', expectedJob });
      }
    });
  }

  function excludeFromAutomatic(files) {
    library.automatic.excluded = [...new Set([...library.automatic.excluded, ...files])];
  }

  async function cancel(forward = true, expectedJob = jobIdentity(library.job)) {
    return foreground(async () => {
      if (jobIdentity(library.job) !== expectedJob) return;
      await suspend('manual');
      const settled = await exclusively(async () => {
        const job = activeJob();
        if (!job || jobIdentity(job) !== expectedJob) return true;
        const unfinished = job.items.slice(job.index);
        excludeFromAutomatic(unfinished.map(item => item.file));
        library.retired.push(...unfinished.map(item => item.cache));
        job.status = 'canceled';
        job.reason = 'Unfinished downloads discarded.';
        saveLibrary();
        await cleanupRetired();
        return true;
      }, true);
      if (!settled && forward) {
        if (!channel) throw new Error('Cancel downloads from the tab that started them.');
        channel.postMessage({ action: 'cancel', expectedJob });
      }
    });
  }

  function removeQueuedFiles(files) {
    const job = activeJob();
    if (!job) return;
    const unfinished = job.items.slice(job.index);
    const keep = unfinished.filter(item => !files.has(item.file));
    library.retired.push(...unfinished.filter(item => files.has(item.file)).map(item => item.cache));
    job.items = [...job.items.slice(0, job.index), ...keep];
    if (!keep.length) {
      job.status = 'canceled';
      job.reason = 'Unfinished downloads discarded.';
    }
  }

  async function remove(protocols) {
    return foreground(async () => {
      if (await suspend('operation')) automaticDeferred = true;
      return exclusively(async () => {
        const oldResources = await legacyResources(await getLegacyCaches());
        const unfinished = activeJob();
        const files = new Set(protocols
          ? protocols.map(protocol => protocol.file)
          : [...Object.keys(library.copies), ...oldResources.keys(),
            ...(unfinished?.items.slice(unfinished.index).map(item => item.file) || [])]);
        if (!protocols) library.automatic.disabled = true;
        excludeFromAutomatic(files);
        removeQueuedFiles(files);
        saveLibrary();
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
    automaticController?.abort();
    suspend('offline').catch(console.warn);
  });
  window.addEventListener('online', () => {
    scheduleAutomatic();
  });
  window.addEventListener('pagehide', () => {
    pageActive = false;
    automaticController?.abort();
    suspend('closed').catch(console.warn);
  });
  window.addEventListener('pageshow', event => {
    if (!event.persisted) return;
    pageActive = true;
    scheduleAutomatic();
  });
  window.addEventListener('storage', ({ key }) => {
    if (key === storageKey && !inMutation) {
      library = readLibrary();
      measuredLegacy = null;
      otherTabRunning = library.job?.status === 'downloading';
      emit();
    }
  });
  channel?.addEventListener('message', ({ data }) => {
    if (!data?.expectedJob) return;
    if (data.action === 'pause') pause(false, data.expectedJob).catch(console.warn);
    if (data.action === 'cancel') cancel(false, data.expectedJob).catch(console.warn);
  });

  window.ACTOffline = {
    get supported() { return supported; },
    async init() {
      await refresh();
      if (supported) await exclusively(cleanupRetired).catch(() => {});
    },
    enableAutomatic(protocols) {
      automaticProtocols = [...new Map(protocols.map(protocol => [protocol.file, protocol])).values()];
      return scheduleAutomatic();
    },
    isAutomaticSuppressed: () => library.automatic.disabled,
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
    resume() {
      return foreground(async () => {
        if (!navigator.onLine) throw new Error('Reconnect before resuming downloads.');
        if (queueStatus().status !== 'paused') return;
        await runner;
        run({ waitForLock: true });
      });
    },
    cancel,
    remove,
    checkUpdates: () => foreground(async () => {
      if (queueStatus().status === 'paused') await runner;
      return exclusively(() => fetchListing(undefined, true));
    }),
    storage,
    openDocument
  };
})();
