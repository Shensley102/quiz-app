(() => {
  const MANIFEST_URL = '/static/data/act-protocols.json';
  const SEARCH_URL = '/static/data/act-protocol-search.json';
  const ALIAS_URL = '/static/data/act-medication-aliases.json';
  const CACHE_NAME = 'act-protocol-pdfs-v1';
  const MISSING_MESSAGE = 'PDF not found yet — add the file to the repository path listed in the manifest.';
  const STORAGE_WARNING = 'Saving all PDFs may use significant device storage. Mobile browsers may clear offline data if storage is low. Continue?';
  const state = { protocols: [], searchIndex: new Map(), aliases: [], aliasLookup: new Map(), category: 'All', query: '', saved: new Set(), missing: new Set(), resultMeta: new Map(), searchReady: false, aliasesReady: false };
  const els = {
    grid: document.getElementById('protocolGrid'), search: document.getElementById('protocolSearch'), filters: document.getElementById('categoryFilters'),
    count: document.getElementById('resultCount'), saveAll: document.getElementById('saveAllBtn'), saveAllStatus: document.getElementById('saveAllStatus')
  };
  const encoded = (url) => encodeURI(url);
  const normalize = (text) => (text || '').toString().toLowerCase().normalize('NFKD').replace(/[\u2010-\u2015]/g, '-').replace(/\s+/g, ' ').trim();
  const escapeHtml = (text) => (text || '').toString().replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const debounce = (fn, wait = 180) => { let id; return (...args) => { clearTimeout(id); id = setTimeout(() => fn(...args), wait); }; };
  function applyDisplayModeClass() {
    const isStandalone = window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
    document.body.classList.toggle('act-pwa', Boolean(isStandalone));
  }
  function metadataText(p) { return [p.id, p.title, p.category, p.folder, ...(p.tags || [])].join(' '); }
  function buildAliasLookup() {
    state.aliasLookup.clear();
    state.aliases.forEach((med) => {
      const terms = [med.canonical, ...(med.aliases || []), ...(med.genericNames || []), ...(med.brandNames || []), ...(med.tradeNames || []), ...(med.activeIngredientNames || []), ...(med.substanceNames || []), ...(med.shorthand || [])];
      terms.forEach((term) => {
        const key = normalize(term); if (!key) return;
        const entry = state.aliasLookup.get(key) || [];
        entry.push(med); state.aliasLookup.set(key, entry);
      });
    });
  }
  function termsForQuery(q) {
    const terms = new Set([q]);
    (state.aliasLookup.get(q) || []).forEach((med) => [med.canonical, ...(med.aliases || []), ...(med.genericNames || []), ...(med.brandNames || []), ...(med.tradeNames || []), ...(med.activeIngredientNames || []), ...(med.substanceNames || []), ...(med.shorthand || [])].forEach(t => terms.add(normalize(t))));
    return [...terms].filter(Boolean);
  }
  function firstSnippet(record, terms) {
    const pages = record?.pages || [];
    for (const page of pages) {
      const text = page.text || ''; const idx = terms.map(t => text.indexOf(t)).filter(i => i >= 0).sort((a, b) => a - b)[0];
      if (idx >= 0) return { page: page.page, snippet: `… ${text.slice(Math.max(0, idx - 55), idx + 95)} …` };
    }
    return null;
  }
  function matchProtocol(protocol, q) {
    const record = state.searchIndex.get(protocol.id);
    const hayMeta = normalize(metadataText(protocol));
    if (!q) return { score: 0, reasons: [] };
    const knownAlias = state.aliasLookup.has(q);
    if (q.length < 2 && !knownAlias) return null;
    const terms = termsForQuery(q);
    const reasons = []; let score = -1;
    const medicationMatches = [];
    (record?.detectedMedications || []).forEach((med) => {
      const aliases = (med.matchedAliases || []).map(normalize);
      const canon = normalize(med.canonical);
      const exactAlias = aliases.includes(q);
      const expanded = terms.includes(canon) || aliases.some(a => terms.includes(a));
      if (exactAlias || expanded) {
        medicationMatches.push(med);
        reasons.push({ type: exactAlias ? 'Medication match' : 'Medication match', text: `${q} → ${med.canonical}`, pages: (med.pages || []).slice(0, 3) });
        score = Math.max(score, exactAlias ? 100 : 92);
      }
    });
    const aliasMeds = state.aliasLookup.get(q) || [];
    if (!medicationMatches.length && aliasMeds.length) {
      const medIds = new Set(aliasMeds.flatMap(m => m.foundInProtocols || []));
      if (medIds.has(protocol.id)) {
        const med = aliasMeds.find(m => (m.foundInProtocols || []).includes(protocol.id));
        const pages = med?.foundPagesByProtocol?.[protocol.id] || [];
        reasons.push({ type: 'Brand/trade match', text: `${q} → ${med.canonical}`, pages: pages.slice(0, 3) });
        score = Math.max(score, 95);
      }
    }
    if (normalize(protocol.title).includes(q)) { reasons.push({ type: 'Title match', text: protocol.title }); score = Math.max(score, 80); }
    if ((protocol.tags || []).some(t => normalize(t).includes(q))) { reasons.push({ type: 'Tag match', text: q }); score = Math.max(score, 70); }
    if (hayMeta.includes(q)) score = Math.max(score, 55);
    const pdfText = record?.normalizedText || '';
    if (pdfText) {
      const exact = terms.some(t => new RegExp(`(^|[^a-z0-9])${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`).test(pdfText));
      const partial = !exact && terms.some(t => t.length >= 3 && pdfText.includes(t));
      if (exact || partial) {
        const snippet = firstSnippet(record, terms);
        reasons.push({ type: 'PDF text match', text: snippet?.snippet || q, pages: snippet?.page ? [snippet.page] : [] });
        score = Math.max(score, exact ? 60 : 45);
      }
    }
    if (score < 0) return null;
    return { score, reasons };
  }
  function filtered() {
    const q = normalize(state.query);
    state.resultMeta.clear();
    const matches = [];
    for (const p of state.protocols) {
      if (state.category !== 'All' && p.category !== state.category) continue;
      if (!q) { matches.push({ protocol: p, score: 0 }); continue; }
      const match = matchProtocol(p, q);
      if (match) { state.resultMeta.set(p.id, match); matches.push({ protocol: p, score: match.score }); }
    }
    return matches.sort((a, b) => b.score - a.score || a.protocol.title.localeCompare(b.protocol.title)).map(x => x.protocol);
  }
  function statusClass(p) { return state.saved.has(p.file) ? 'saved' : state.missing.has(p.file) ? 'error' : ''; }
  function statusText(p) { return state.saved.has(p.file) ? 'Saved offline' : state.missing.has(p.file) ? MISSING_MESSAGE : 'Not saved offline'; }
  function renderReasons(p) {
    const meta = state.resultMeta.get(p.id); if (!meta?.reasons?.length) return '';
    return `<div class="match-reasons">${meta.reasons.slice(0, 3).map(r => `<div class="match-reason"><strong>${escapeHtml(r.type)}:</strong> ${escapeHtml(r.text)}${r.pages?.length ? ` <span>Page: ${escapeHtml(r.pages.join(', '))}</span>` : ''}</div>`).join('')}</div>`;
  }
  function render() {
    const list = filtered();
    els.count.textContent = `${list.length} of ${state.protocols.length} protocols shown${state.searchReady ? '' : ' (metadata search)'}`;
    if (!list.length) { els.grid.innerHTML = '<div class="empty-state">No protocols match your search and filter.</div>'; return; }
    els.grid.innerHTML = list.map(p => `
      <article class="protocol-card" data-file="${escapeHtml(p.file)}">
        <div class="protocol-meta"><span class="protocol-pill protocol-id">${escapeHtml(p.id)}</span><span class="protocol-pill">${escapeHtml(p.category)}</span></div>
        <h2>${escapeHtml(p.title)}</h2>
        <div class="protocol-path">${escapeHtml(p.file)}</div>
        ${renderReasons(p)}
        <div class="offline-status ${statusClass(p)}" data-status>${statusText(p)}</div>
        <div class="protocol-buttons">
          <button class="btn btn-outline" type="button" data-action="open" data-id="${escapeHtml(p.id)}">Open PDF</button>
          <button class="btn btn-secondary" type="button" data-action="save" data-id="${escapeHtml(p.id)}">${state.saved.has(p.file) ? 'Saved' : 'Save Offline'}</button>
        </div>
      </article>`).join('');
  }
  async function cachePdf(protocol) {
    const url = encoded(protocol.file); const cache = await caches.open(CACHE_NAME); const response = await fetch(url, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    await cache.put(url, response.clone()); state.saved.add(protocol.file); state.missing.delete(protocol.file); notifyServiceWorker([url]);
  }
  function notifyServiceWorker(urls) { if (navigator.serviceWorker?.controller) navigator.serviceWorker.controller.postMessage({ type: 'CACHE_URLS', urls }); }
  async function isCached(file) { if (!('caches' in window)) return false; return Boolean(await caches.match(encoded(file))); }
  async function refreshSaved() { await Promise.all(state.protocols.map(async (p) => { if (await isCached(p.file)) state.saved.add(p.file); })); }
  function handleOpen(protocol) {
    const meta = state.resultMeta.get(protocol.id); const page = meta?.reasons?.find(r => r.pages?.length)?.pages?.[0];
    const params = new URLSearchParams({ file: protocol.file, title: `${protocol.id} ${protocol.title}` }); if (page) params.set('page', page);
    window.location.href = `/act-protocols/viewer#${params.toString()}`;
  }
  async function handleSave(protocol, button) { if (!('caches' in window)) { alert('Offline caching is not available in this browser.'); return; } button.disabled = true; button.textContent = 'Saving...'; try { await cachePdf(protocol); } catch (err) { state.missing.add(protocol.file); console.warn(`[ACT Protocols] Missing or unavailable PDF: ${protocol.file}`, err); alert(MISSING_MESSAGE); } finally { button.disabled = false; render(); } }
  async function confirmStorageForSaveAll() {
    if (!navigator.storage?.estimate) return confirm(STORAGE_WARNING);
    try { const { quota = 0, usage = 0 } = await navigator.storage.estimate(); const available = quota - usage; if (!quota || available < 150 * 1024 * 1024) return confirm(STORAGE_WARNING); return confirm(STORAGE_WARNING); } catch { return confirm(STORAGE_WARNING); }
  }
  async function saveAll() { if (!('caches' in window)) { alert('Offline caching is not available in this browser.'); return; } if (!(await confirmStorageForSaveAll())) return; els.saveAll.disabled = true; let saved = 0, missing = 0; for (const p of state.protocols) { els.saveAllStatus.textContent = `Saving ${saved + missing + 1} of ${state.protocols.length}...`; try { await cachePdf(p); saved++; } catch (err) { missing++; state.missing.add(p.file); console.warn(`[ACT Protocols] Could not cache ${p.file}`, err); } render(); } els.saveAll.disabled = false; els.saveAllStatus.textContent = `Saved ${saved}; ${missing} missing.`; }
  function bind() { const debouncedRender = debounce(render); els.search.addEventListener('input', (e) => { state.query = e.target.value; debouncedRender(); }); els.filters.addEventListener('click', (e) => { const btn = e.target.closest('[data-category]'); if (!btn) return; state.category = btn.dataset.category; els.filters.querySelectorAll('.filter-btn').forEach(b => b.classList.toggle('active', b === btn)); render(); }); els.grid.addEventListener('click', (e) => { const btn = e.target.closest('[data-action]'); if (!btn) return; const p = state.protocols.find(x => x.id === btn.dataset.id); if (!p) return; btn.dataset.action === 'open' ? handleOpen(p) : handleSave(p, btn); }); els.saveAll.addEventListener('click', saveAll); }
  async function loadJson(url) { const response = await fetch(url, { cache: 'no-cache' }); if (!response.ok) throw new Error(`${url}: ${response.status}`); return response.json(); }
  async function init() { applyDisplayModeClass(); window.matchMedia?.('(display-mode: standalone)').addEventListener?.('change', applyDisplayModeClass); bind(); try { const [manifest, search, aliases] = await Promise.allSettled([loadJson(MANIFEST_URL), loadJson(SEARCH_URL), loadJson(ALIAS_URL)]); if (manifest.status !== 'fulfilled') throw manifest.reason; state.protocols = manifest.value; if (search.status === 'fulfilled') { state.searchReady = true; search.value.forEach(r => state.searchIndex.set(r.id, r)); } else console.warn('[ACT Protocols] Search index unavailable; using metadata fallback', search.reason); if (aliases.status === 'fulfilled') { state.aliasesReady = true; state.aliases = aliases.value; buildAliasLookup(); } else console.warn('[ACT Protocols] Medication aliases unavailable', aliases.reason); await refreshSaved(); render(); notifyServiceWorker([MANIFEST_URL, SEARCH_URL, ALIAS_URL]); } catch (err) { console.error('[ACT Protocols] Failed to load protocol manifest', err); els.count.textContent = 'Unable to load protocols.'; els.grid.innerHTML = '<div class="error-state">Unable to load ACT protocols. Please try again when the app is online.</div>'; } }
  document.addEventListener('DOMContentLoaded', init);
})();
