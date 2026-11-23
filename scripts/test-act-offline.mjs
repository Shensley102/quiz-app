import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../static/js/act-offline.js', import.meta.url), 'utf8');
const origin = 'https://act.test';
const pngHeader = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10);
const protocols = ['Assessments', 'Adult Infusion', 'Pediatric Infusion'].map(title => ({
  title,
  file: `/static/protocols/act/${title}.pdf`
}));
const [first, second, third] = protocols;

function mockCacheStorage() {
  const caches = new Map();
  const key = request => new URL(request, origin).href;
  return {
    async open(name) {
      if (!caches.has(name)) {
        const entries = new Map();
        caches.set(name, {
          async match(request) { return entries.get(key(request))?.clone(); },
          async put(request, response) { entries.set(key(request), response); },
          async delete(request) { return entries.delete(key(request)); },
          async keys() { return [...entries.keys()].map(url => new Request(url)); }
        });
      }
      return caches.get(name);
    },
    async keys() { return [...caches.keys()]; },
    async has(name) { return caches.has(name); },
    async delete(name) { return caches.delete(name); }
  };
}

function mockLocks() {
  const held = new Map();
  return {
    async request(name, options, callback) {
      if (held.has(name)) {
        assert.equal(options.ifAvailable, true, `Unexpected wait for lock ${name}`);
        return callback(null);
      }
      const lock = { name, mode: options.mode || 'exclusive' };
      held.set(name, lock);
      try {
        return await callback(lock);
      } finally {
        held.delete(name);
      }
    },
    async query() { return { held: [...held.values()], pending: [] }; }
  };
}

function mockBrowser() {
  const caches = mockCacheStorage();
  const locks = mockLocks();
  const storage = new Map();
  const tabs = new Set();
  const documents = new Map();
  const requests = [];
  const failures = [];
  let blockedRequest;

  function serve(protocol, revision = 1) {
    const bytes = Buffer.from(`%PDF-1.7\n${protocol.title}: revision ${revision}\n%%EOF`);
    const version = createHash('sha256').update(bytes).digest('hex');
    documents.set(protocol.file, { file: protocol.file, version, size: bytes.length, bytes });
    return version;
  }

  function blockPage(protocol) {
    blockedRequest = { kind: 'pdf-page', file: protocol.file };
  }

  function blockListing() {
    blockedRequest = { kind: 'versions', file: null };
  }

  function writeStorage(owner, key, value) {
    if (storage.get(key) === value) return;
    storage.set(key, value);
    for (const tab of tabs) {
      if (tab === owner) continue;
      const event = Object.assign(new Event('storage'), { key, newValue: value });
      setImmediate(() => tab.dispatchEvent(event));
    }
  }

  function mockFetch(navigator) {
    return async (request, { signal } = {}) => {
      signal?.throwIfAborted();
      if (!navigator.onLine) throw new TypeError('Offline');

      const url = new URL(request, origin);
      const file = url.searchParams.get('file');
      const kind = url.pathname.replace('/act-protocols/', '');
      const version = url.searchParams.get('version');
      requests.push({ kind, file, version });
      if (kind === blockedRequest?.kind && file === blockedRequest.file) {
        blockedRequest = null;
        await new Promise((_, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), { once: true });
        });
      }
      if (kind === 'versions') {
        const listing = [...documents.values()].map(({ file, version, size }) => ({ file, version, size }));
        return Response.json({ documents: listing });
      }

      const document = documents.get(file);
      assert(document, `Unexpected document ${file}`);
      if (version !== document.version) return new Response(null, { status: 409 });

      const headers = { 'X-ACT-PDF-Version': version };
      switch (kind) {
        case 'pdf-file':
          return new Response(document.bytes, { headers });
        case 'pdf-info':
          return Response.json({ success: true, version, pageCount: 1 }, { headers });
        case 'pdf-text':
          return Response.json({ success: true, version, pages: [{ page: 1, text: 'Example text' }] }, { headers });
        case 'pdf-page':
          return new Response(pngHeader, { headers });
        default:
          assert.fail(`Unexpected request ${url.href}`);
      }
    };
  }

  async function open({ online = true, automatic = true } = {}) {
    const navigator = { onLine: online, locks };
    const events = new EventTarget();
    tabs.add(events);
    const window = { caches, crypto: webcrypto, addEventListener: events.addEventListener.bind(events) };
    runInNewContext(source, {
      window, navigator, caches, crypto: webcrypto, AbortController, Response, URL, URLSearchParams, setTimeout, clearTimeout,
      localStorage: {
        getItem: name => storage.get(name) || null,
        setItem: (name, value) => writeStorage(events, name, value)
      },
      console: { warn: (...args) => failures.push(args), error: (...args) => failures.push(args) },
      fetch: mockFetch(navigator),
      // Network errors must use the same constructor as the downloader.
      TypeError
    });
    const api = window.ACTOffline;
    await api.init();
    if (automatic) api.enableAutomatic(protocols);
    return {
      api,
      offline() {
        navigator.onLine = false;
        events.dispatchEvent(new Event('offline'));
      },
      online() {
        navigator.onLine = true;
        events.dispatchEvent(new Event('online'));
      },
      close() {
        events.dispatchEvent(new Event('pagehide'));
        tabs.delete(events);
      }
    };
  }

  protocols.forEach(protocol => serve(protocol));
  return { open, serve, blockPage, blockListing, requests, failures };
}

async function until(check, description) {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    if (check()) return;
    await delay(10);
  }
  assert.fail(`Timed out waiting for ${description}`);
}

function available(api, protocol) {
  return api.document(protocol.file).available;
}

function downloads(browser, protocol) {
  return browser.requests.filter(request => request.kind === 'pdf-file' && (!protocol || request.file === protocol.file));
}

function waitForPage(browser, protocol) {
  return until(() => browser.requests.some(request => request.kind === 'pdf-page' && request.file === protocol.file),
    `a page download for ${protocol.title}`);
}

async function checkIdle(browser, check) {
  // Allow listing and cache lookups to settle after the simulated browser event.
  await delay(60);
  check();
  assert.deepEqual(browser.failures, []);
}

test('first visit saves missing documents and only replaces an older copy after an explicit update', async () => {
  const browser = mockBrowser();
  const original = await browser.open({ automatic: false });
  await original.api.start([first]);
  await until(() => original.api.queue().status === 'complete', 'original saved copy');
  const savedVersion = original.api.document(first.file).version;
  const latestVersion = browser.serve(first, 2);
  browser.requests.length = 0;

  const reopened = await browser.open();
  await until(() => reopened.api.queue().status === 'complete' && protocols.every(protocol => available(reopened.api, protocol)), 'automatic saves');
  assert.equal(reopened.api.document(first.file).version, savedVersion);
  assert.equal(reopened.api.document(first.file).updateStatus, 'available');
  assert.deepEqual(downloads(browser).map(request => request.file), [second.file, third.file]);

  await reopened.api.start([first], { update: true });
  await until(() => reopened.api.queue().status === 'complete' && reopened.api.document(first.file).version === latestVersion, 'explicit update');
  assert.equal(reopened.api.document(first.file).updateStatus, 'current');
  assert.equal(downloads(browser, first).length, 1);
  assert.deepEqual(browser.failures, []);
});

test('opening a second tab during automatic downloading does not duplicate the job', async () => {
  const browser = mockBrowser();
  browser.blockPage(first);
  const tab = await browser.open();
  await waitForPage(browser, first);
  const otherTab = await browser.open();
  await checkIdle(browser, () => {
    assert.equal(downloads(browser, first).length, 1);
    assert.equal(downloads(browser).length, 1);
    assert.equal(otherTab.api.queue().status, 'downloading');
  });

  tab.offline();
  await until(() => tab.api.queue().status === 'paused', 'interrupted download');
  otherTab.offline();
  otherTab.online();
  await until(() => otherTab.api.queue().status === 'complete', 'automatic continuation in the other tab');
  assert(protocols.every(protocol => available(otherTab.api, protocol)));
  assert.equal(downloads(browser, first).length, 1);
  assert.deepEqual(browser.failures, []);
});

test('reconnect resumes a connection interruption without restarting completed documents', async () => {
  const browser = mockBrowser();
  browser.blockPage(second);
  const tab = await browser.open({ online: false });
  assert.equal(downloads(browser).length, 0);

  tab.online();
  await waitForPage(browser, second);
  assert(available(tab.api, first));
  tab.offline();
  await until(() => tab.api.queue().status === 'paused', 'connection pause');
  assert(tab.api.document(second.file).partial);
  tab.online();
  await until(() => tab.api.queue().status === 'complete', 'automatic reconnect');
  assert(protocols.every(protocol => available(tab.api, protocol)));
  assert.equal(downloads(browser, first).length, 1);
  assert.equal(downloads(browser, second).length, 1);
  assert.deepEqual(browser.failures, []);
});

test('a rapid reconnect while the listing request aborts still starts automatic downloads', async () => {
  const browser = mockBrowser();
  browser.blockListing();
  const tab = await browser.open();
  await until(() => browser.requests.some(request => request.kind === 'versions'), 'automatic listing');
  tab.offline();
  tab.online();
  await until(() => tab.api.queue().status === 'complete', 'automatic download following rapid reconnect');
  assert(protocols.every(protocol => available(tab.api, protocol)));
  assert.deepEqual(browser.failures, []);
});

test('reopening resumes a download interrupted by closing the library', async () => {
  const browser = mockBrowser();
  browser.blockPage(second);
  const tab = await browser.open();
  await waitForPage(browser, second);
  tab.close();
  await until(() => tab.api.queue().status === 'paused', 'close pause');

  const reopened = await browser.open();
  await until(() => reopened.api.queue().status === 'complete', 'reopened download');
  assert(protocols.every(protocol => available(reopened.api, protocol)));
  assert.equal(downloads(browser, first).length, 1);
  assert.equal(downloads(browser, second).length, 1);
  assert.deepEqual(browser.failures, []);
});

test('an explicit pause survives reconnect and reopening until the user resumes', async () => {
  const browser = mockBrowser();
  browser.blockPage(first);
  const tab = await browser.open();
  await waitForPage(browser, first);
  await tab.api.pause();
  assert.equal(tab.api.queue().status, 'paused');

  tab.offline();
  tab.online();
  const reopened = await browser.open();
  await checkIdle(browser, () => {
    assert.equal(reopened.api.queue().status, 'paused');
    assert.equal(downloads(browser).length, 1);
    assert(!available(reopened.api, first));
  });

  await reopened.api.resume();
  await until(() => reopened.api.queue().status === 'complete', 'explicit resume');
  assert(protocols.every(protocol => available(reopened.api, protocol)));
  assert.deepEqual(browser.failures, []);
});

test('cancel preserves completed copies and prevents silent requeueing', async () => {
  const browser = mockBrowser();
  browser.blockPage(second);
  const tab = await browser.open();
  await waitForPage(browser, second);
  await tab.api.cancel();
  assert(available(tab.api, first));
  assert(!available(tab.api, second));
  assert(!tab.api.document(second.file).partial);

  tab.offline();
  tab.online();
  const reopened = await browser.open();
  await checkIdle(browser, () => assert(!available(reopened.api, second)));
  assert.equal(downloads(browser, second).length, 1);
  assert.equal(downloads(browser, third).length, 0);

  await reopened.api.start([second]);
  await until(() => available(reopened.api, second), 'explicit save after cancel');
  assert.deepEqual(browser.failures, []);
});

test('document, category, and library removals stay removed until an explicit save', async () => {
  const browser = mockBrowser();
  let tab = await browser.open();
  await until(() => tab.api.queue().status === 'complete', 'initial library save');
  await tab.api.remove([first]);

  tab = await browser.open();
  tab.offline();
  tab.online();
  await checkIdle(browser, () => {
    assert(!available(tab.api, first));
    assert.equal(downloads(browser, first).length, 1);
  });
  await tab.api.start([first]);
  await until(() => tab.api.queue().status === 'complete' && available(tab.api, first), 'explicit document save');
  assert.equal(downloads(browser, first).length, 2);

  await tab.api.remove([second, third]);
  tab = await browser.open();
  await checkIdle(browser, () => {
    assert(available(tab.api, first));
    assert(!available(tab.api, second));
    assert(!available(tab.api, third));
    assert.equal(downloads(browser, second).length, 1);
    assert.equal(downloads(browser, third).length, 1);
  });
  await tab.api.start([second, third]);
  await until(() => tab.api.queue().status === 'complete' && available(tab.api, second) && available(tab.api, third), 'explicit category save');

  await tab.api.remove(null);
  tab = await browser.open();
  tab.offline();
  tab.online();
  await checkIdle(browser, () => {
    assert(protocols.every(protocol => !available(tab.api, protocol)));
    assert.equal(downloads(browser).length, 6);
  });

  await tab.api.start(protocols, { all: true });
  await until(() => tab.api.queue().status === 'complete' && protocols.every(protocol => available(tab.api, protocol)), 'explicit library save');
  assert.equal(downloads(browser).length, 9);
  assert.deepEqual(browser.failures, []);
});
