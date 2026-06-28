(() => {
  const MANIFEST_URL = '/static/data/act-protocols.json';
  const CACHE_NAME = 'act-protocol-pdfs-v1';
  const MISSING_MESSAGE = 'PDF not found yet — add the file to the repository path listed in the manifest.';
  const state = { protocols: [], category: 'All', query: '', saved: new Set(), missing: new Set() };
  const els = {
    grid: document.getElementById('protocolGrid'), search: document.getElementById('protocolSearch'), filters: document.getElementById('categoryFilters'),
    count: document.getElementById('resultCount'), saveAll: document.getElementById('saveAllBtn'), saveAllStatus: document.getElementById('saveAllStatus')
  };
  const encoded = (url) => encodeURI(url);
  function applyDisplayModeClass() {
    const isStandalone = window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
    document.body.classList.toggle('act-pwa', Boolean(isStandalone));
  }
  const searchable = (p) => [p.id, p.title, p.category, p.folder, ...(p.tags || [])].join(' ').toLowerCase();
  async function cachePdf(protocol) {
    const url = encoded(protocol.file);
    const cache = await caches.open(CACHE_NAME);
    const response = await fetch(url, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    await cache.put(url, response.clone());
    state.saved.add(protocol.file); state.missing.delete(protocol.file);
    notifyServiceWorker([url]);
  }
  function notifyServiceWorker(urls) { if (navigator.serviceWorker?.controller) navigator.serviceWorker.controller.postMessage({ type: 'CACHE_URLS', urls }); }
  async function isCached(file) {
    if (!('caches' in window)) return false;
    const url = encoded(file);
    return Boolean(await caches.match(url));
  }
  async function refreshSaved() {
    await Promise.all(state.protocols.map(async (p) => { if (await isCached(p.file)) state.saved.add(p.file); }));
  }
  function filtered() {
    const q = state.query.trim().toLowerCase();
    return state.protocols.filter(p => (state.category === 'All' || p.category === state.category) && (!q || searchable(p).includes(q)));
  }
  function statusClass(p) { return state.saved.has(p.file) ? 'saved' : state.missing.has(p.file) ? 'error' : ''; }
  function statusText(p) { return state.saved.has(p.file) ? 'Saved offline' : state.missing.has(p.file) ? MISSING_MESSAGE : 'Not saved offline'; }
  function render() {
    const list = filtered();
    els.count.textContent = `${list.length} of ${state.protocols.length} protocols shown`;
    if (!list.length) { els.grid.innerHTML = '<div class="empty-state">No protocols match your search and filter.</div>'; return; }
    els.grid.innerHTML = list.map(p => `
      <article class="protocol-card" data-file="${p.file}">
        <div class="protocol-meta"><span class="protocol-pill protocol-id">${p.id}</span><span class="protocol-pill">${p.category}</span></div>
        <h2>${p.title}</h2>
        <div class="protocol-path">${p.file}</div>
        <div class="offline-status ${statusClass(p)}" data-status>${statusText(p)}</div>
        <div class="protocol-buttons">
          <button class="btn btn-outline" type="button" data-action="open" data-id="${p.id}">Open PDF</button>
          <button class="btn btn-secondary" type="button" data-action="save" data-id="${p.id}">${state.saved.has(p.file) ? 'Saved' : 'Save Offline'}</button>
        </div>
      </article>`).join('');
  }
  async function handleOpen(protocol) {
    const params = new URLSearchParams({ file: protocol.file, title: `${protocol.id} ${protocol.title}` });
    window.location.href = `/act-protocols/viewer#${params.toString()}`;
  }
  async function handleSave(protocol, button) {
    if (!('caches' in window)) { alert('Offline caching is not available in this browser.'); return; }
    button.disabled = true; button.textContent = 'Saving...';
    try { await cachePdf(protocol); }
    catch (err) { state.missing.add(protocol.file); console.warn(`[ACT Protocols] Missing or unavailable PDF: ${protocol.file}`, err); alert(MISSING_MESSAGE); }
    finally { button.disabled = false; render(); }
  }
  async function saveAll() {
    if (!('caches' in window)) { alert('Offline caching is not available in this browser.'); return; }
    els.saveAll.disabled = true; let saved = 0, missing = 0;
    for (const p of state.protocols) {
      els.saveAllStatus.textContent = `Saving ${saved + missing + 1} of ${state.protocols.length}...`;
      try { await cachePdf(p); saved++; }
      catch (err) { missing++; state.missing.add(p.file); console.warn(`[ACT Protocols] Could not cache ${p.file}`, err); }
      render();
    }
    els.saveAll.disabled = false; els.saveAllStatus.textContent = `Saved ${saved}; ${missing} missing.`;
  }
  function bind() {
    els.search.addEventListener('input', (e) => { state.query = e.target.value; render(); });
    els.filters.addEventListener('click', (e) => { const btn = e.target.closest('[data-category]'); if (!btn) return; state.category = btn.dataset.category; els.filters.querySelectorAll('.filter-btn').forEach(b => b.classList.toggle('active', b === btn)); render(); });
    els.grid.addEventListener('click', (e) => { const btn = e.target.closest('[data-action]'); if (!btn) return; const p = state.protocols.find(x => x.id === btn.dataset.id); if (!p) return; btn.dataset.action === 'open' ? handleOpen(p) : handleSave(p, btn); });
    els.saveAll.addEventListener('click', saveAll);
  }
  async function init() {
    applyDisplayModeClass();
    window.matchMedia?.('(display-mode: standalone)').addEventListener?.('change', applyDisplayModeClass);
    bind();
    try {
      const response = await fetch(MANIFEST_URL, { cache: 'no-cache' });
      if (!response.ok) throw new Error(`Unable to load manifest: ${response.status}`);
      state.protocols = await response.json();
      await refreshSaved(); render(); notifyServiceWorker([MANIFEST_URL]);
    } catch (err) {
      console.error('[ACT Protocols] Failed to load protocol manifest', err);
      els.count.textContent = 'Unable to load protocols.'; els.grid.innerHTML = '<div class="error-state">Unable to load ACT protocols. Please try again when the app is online.</div>';
    }
  }
  document.addEventListener('DOMContentLoaded', init);
})();
