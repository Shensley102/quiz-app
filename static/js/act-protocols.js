(() => {
  const MANIFEST_URL = '/static/data/act-protocols.json';
  const SEARCH_URL = '/static/data/act-protocol-search.json';
  const ALIAS_URL = '/static/data/act-medication-aliases.json';
  const MEDICATION_MAP_URL = '/static/data/act-medication-protocol-map.json';
  const CACHE_NAME = 'act-protocol-pdfs-v2';
  const RETURN_STATE_KEY = 'act-protocols-return-state';
  const state = { protocols: [], searchIndex: new Map(), aliases: [], aliasLookup: new Map(), medicationMap: new Map(), protocolIdLookup: new Map(), category: 'All', query: '', saved: new Set(), caching: new Set(), missing: new Set(), resultMeta: new Map(), searchReady: false, aliasesReady: false, autoCacheStarted: false };
  const els = {
    grid: document.getElementById('protocolGrid'), search: document.getElementById('protocolSearch'), filters: document.getElementById('categoryFilters'),
    count: document.getElementById('resultCount'), offlineSummary: document.getElementById('offlineSummary')
  };
  const encoded = (url) => encodeURI(url);
  const normalize = (text) => (text || '').toString().toLowerCase().normalize('NFKD').replace(/[\u2010-\u2015]/g, '-').replace(/\s+/g, ' ').trim();
  const escapeHtml = (text) => (text || '').toString().replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const debounce = (fn, wait = 180) => { let id; return (...args) => { clearTimeout(id); id = setTimeout(() => fn(...args), wait); }; };

  const THEME_COLORS = { light: '#FFFFFF', dark: '#0B0F14' };
  const preferredDark = window.matchMedia?.('(prefers-color-scheme: dark)');
  function resolvedTheme() { return preferredDark?.matches ? 'dark' : 'light'; }
  function updateThemeColor() {
    let meta = document.querySelector('meta[name="theme-color"][data-act-dynamic]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'theme-color';
      meta.dataset.actDynamic = 'true';
      document.head.appendChild(meta);
    }
    meta.content = THEME_COLORS[resolvedTheme()];
  }
  function applyDisplayModeClass() {
    const isStandalone = window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
    document.body.classList.toggle('act-pwa', Boolean(isStandalone));
  }
  function metadataText(p) { return [p.id, p.title, p.category, p.folder, ...(p.tags || [])].join(' '); }
  function normalizeProtocolId(id) { return normalize(id).replace(/^guid-/, ''); }
  function buildAliasLookup() {
    state.aliasLookup.clear();
    state.aliases.forEach((med) => {
      const terms = [med.canonical, med.canonicalKey, ...(med.aliases || []), ...(med.normalizedAliases || []), ...(med.genericNames || []), ...(med.brandNames || []), ...(med.tradeNames || []), ...(med.activeIngredientNames || []), ...(med.substanceNames || []), ...(med.shorthand || [])];
      terms.forEach((term) => {
        const key = normalize(term); if (!key) return;
        const entry = state.aliasLookup.get(key) || [];
        entry.push(med); state.aliasLookup.set(key, entry);
      });
    });
  }
  function medicationsForQuery(q) {
    const seen = new Set();
    return (state.aliasLookup.get(q) || []).filter((med) => {
      const key = normalize(med.canonicalKey || med.canonical);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  function termsForQuery(q) {
    const terms = new Set([q]);
    medicationsForQuery(q).forEach((med) => [med.canonical, med.canonicalKey, ...(med.aliases || []), ...(med.normalizedAliases || []), ...(med.genericNames || []), ...(med.brandNames || []), ...(med.tradeNames || []), ...(med.activeIngredientNames || []), ...(med.substanceNames || []), ...(med.shorthand || [])].forEach(t => terms.add(normalize(t))));
    return [...terms].filter(Boolean);
  }
  function buildMedicationMap(records) {
    state.medicationMap.clear();
    Object.values(records || {}).forEach((record) => {
      state.medicationMap.set(normalize(record.canonicalKey || record.canonical), record);
    });
  }
  function buildProtocolIdLookup() {
    state.protocolIdLookup.clear();
    state.protocols.forEach((protocol) => state.protocolIdLookup.set(normalizeProtocolId(protocol.id), protocol.id));
  }
  function protocolsForMedication(med) {
    const mapRecord = state.medicationMap.get(normalize(med.canonicalKey || med.canonical));
    const protocols = mapRecord?.protocols?.length ? mapRecord.protocols : (med.foundInProtocols || []).map(id => ({ id, pages: med.foundPagesByProtocol?.[id] || [], matchedAliases: med.matchedAliases || [] }));
    return protocols.map((entry) => ({ ...entry, manifestId: state.protocolIdLookup.get(normalizeProtocolId(entry.manifestId || entry.id)) || entry.manifestId || entry.id }));
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
    const record = state.searchIndex.get(protocol.id) || state.searchIndex.get(normalizeProtocolId(protocol.id));
    const hayMeta = normalize(metadataText(protocol));
    if (!q) return { score: 0, reasons: [] };
    const knownAlias = state.aliasLookup.has(q);
    if (q.length < 2 && !knownAlias) return null;
    const terms = termsForQuery(q);
    const reasons = []; let score = -1;
    const aliasMeds = medicationsForQuery(q);
    aliasMeds.forEach((med) => {
      const protocolMatch = protocolsForMedication(med).find((entry) => entry.manifestId === protocol.id || normalizeProtocolId(entry.id) === normalizeProtocolId(protocol.id));
      if (!protocolMatch) return;
      reasons.push({
        type: 'Medication match',
        text: `"${state.query.trim()}" → ${med.canonical}`,
        pages: (protocolMatch.pages || []).slice(0, 4),
        pageRanges: protocolMatch.pageRanges
      });
      score = Math.max(score, 110);
    });
    (record?.detectedMedications || []).forEach((med) => {
      const aliases = (med.matchedAliases || []).map(normalize);
      const canon = normalize(med.canonicalKey || med.canonical);
      const expanded = terms.includes(canon) || aliases.some(a => terms.includes(a));
      if (expanded && !reasons.some(r => r.type === 'Medication match' && normalize(r.text).includes(canon))) {
        reasons.push({ type: 'Medication match', text: `"${state.query.trim()}" → ${med.canonical}`, pages: (med.pages || []).slice(0, 4), pageRanges: med.pageRanges });
        score = Math.max(score, 100);
      }
    });
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
  function statusClass(p) { return state.saved.has(p.file) ? 'saved' : state.missing.has(p.file) ? 'error' : state.caching.has(p.file) ? 'caching' : ''; }
  function statusText(p) {
    if (state.saved.has(p.file)) return 'Saved for Offline Use';
    if (state.missing.has(p.file)) return 'Could not save offline — will retry next time the app opens.';
    if (state.caching.has(p.file)) return 'Downloading';
    return 'Queued for offline download';
  }
  function updateOfflineSummary() {
    if (!els.offlineSummary) return;
    if (!('caches' in window)) {
      els.offlineSummary.textContent = 'Offline PDF caching is not available in this browser.';
      return;
    }
    const total = state.protocols.length;
    const saved = state.saved.size;
    const caching = state.caching.size;
    const failed = state.missing.size;
    if (!total) {
      els.offlineSummary.textContent = 'Loading offline cache status...';
    } else if (saved === total) {
      els.offlineSummary.textContent = `${saved} of ${total} protocols saved offline. ACT protocols are ready for offline use.`;
    } else if (caching) {
      els.offlineSummary.textContent = `Caching protocols for offline use... ${saved} of ${total} saved offline.`;
    } else if (failed) {
      els.offlineSummary.textContent = `${saved} of ${total} protocols saved offline. ${failed} file${failed === 1 ? '' : 's'} will retry next time the app opens.`;
    } else {
      els.offlineSummary.textContent = `${saved} of ${total} protocols saved offline. Preparing offline downloads...`;
    }
  }
  function returnState() {
    return {
      query: state.query,
      category: state.category,
      scrollY: Math.max(0, Math.round(window.scrollY || window.pageYOffset || 0)),
      openedAt: Date.now()
    };
  }
  function saveReturnState(protocol) {
    try {
      sessionStorage.setItem(RETURN_STATE_KEY, JSON.stringify({ ...returnState(), openedProtocolId: protocol.id }));
    } catch (err) {
      console.warn('[ACT Protocols] Could not save return position', err);
    }
  }
  function loadReturnState() {
    try {
      const raw = sessionStorage.getItem(RETURN_STATE_KEY);
      if (!raw) return null;
      const saved = JSON.parse(raw);
      return saved && typeof saved === 'object' ? saved : null;
    } catch (err) {
      console.warn('[ACT Protocols] Could not restore return position', err);
      return null;
    }
  }
  function applyRestoredFilters(saved) {
    if (!saved) return;
    state.query = typeof saved.query === 'string' ? saved.query : '';
    state.category = typeof saved.category === 'string' && saved.category ? saved.category : 'All';
    els.search.value = state.query;
    els.filters.querySelectorAll('.filter-btn').forEach((button) => {
      button.classList.toggle('active', button.dataset.category === state.category);
    });
  }
  function restoreScrollPosition(saved) {
    if (!saved) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const scrollY = Number(saved.scrollY);
        if (Number.isFinite(scrollY) && scrollY >= 0) {
          window.scrollTo({ top: scrollY, left: 0, behavior: 'auto' });
          return;
        }
        if (!saved.openedProtocolId) return;
        const openedButton = els.grid.querySelector(`[data-action="open"][data-id="${CSS.escape(saved.openedProtocolId)}"]`);
        openedButton?.closest('.protocol-card')?.scrollIntoView({ block: 'center' });
      });
    });
  }
  function renderReasons(p) {
    const meta = state.resultMeta.get(p.id); if (!meta?.reasons?.length) return '';
    return `<div class="match-reasons">${meta.reasons.slice(0, 3).map(r => `<div class="match-reason"><strong>${escapeHtml(r.type)}:</strong> ${escapeHtml(r.text)}${r.pageRanges ? ` <span>Pages: ${escapeHtml(r.pageRanges)}</span>` : r.pages?.length ? ` <span>Pages: ${escapeHtml(r.pages.join(', '))}</span>` : ''}</div>`).join('')}</div>`;
  }
  function render() {
    const list = filtered();
    els.count.textContent = `${list.length} of ${state.protocols.length} protocols shown${state.searchReady ? '' : ' (metadata search)'}`;
    updateOfflineSummary();
    if (!list.length) { els.grid.innerHTML = '<div class="empty-state">No protocols match your search and filter.</div>'; return; }
    els.grid.innerHTML = list.map(p => `
      <article class="protocol-card" data-file="${escapeHtml(p.file)}">
        <div class="protocol-meta"><span class="protocol-pill protocol-id">${escapeHtml(p.id)}</span><span class="protocol-pill">${escapeHtml(p.category)}</span></div>
        <h2>${escapeHtml(p.title)}</h2>
        ${renderReasons(p)}
        <div class="offline-status ${statusClass(p)}" data-status>${statusText(p)}</div>
        <div class="protocol-buttons">
          <button class="btn btn-outline" type="button" data-action="open" data-id="${escapeHtml(p.id)}">Open PDF</button>
        </div>
      </article>`).join('');
  }
  async function cachePdf(protocol) {
    const url = encoded(protocol.file);
    const cache = await caches.open(CACHE_NAME);
    const response = await fetch(url, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    const pdfBytes = await response.arrayBuffer();
    await cache.put(url, new Response(pdfBytes, { status: response.status, statusText: response.statusText, headers: response.headers }));
    if (!(await isCached(protocol.file))) throw new Error('PDF was not available in cache after download.');
    state.saved.add(protocol.file);
    state.missing.delete(protocol.file);
    notifyServiceWorker([url]);
  }
  function notifyServiceWorker(urls) { if (navigator.serviceWorker?.controller) navigator.serviceWorker.controller.postMessage({ type: 'CACHE_URLS', urls }); }
  async function isCached(file) {
    if (!('caches' in window)) return false;
    const response = await caches.match(encoded(file));
    return Boolean(response?.ok);
  }
  async function refreshSaved() { await Promise.all(state.protocols.map(async (p) => { if (await isCached(p.file)) state.saved.add(p.file); })); }
  function handleOpen(protocol) {
    saveReturnState(protocol);
    const meta = state.resultMeta.get(protocol.id); const page = meta?.reasons?.find(r => r.pages?.length)?.pages?.[0];
    const params = new URLSearchParams({ file: protocol.file, title: `${protocol.id} ${protocol.title}` }); if (page) params.set('page', page);
    window.location.href = `/act-protocols/viewer#${params.toString()}`;
  }
  async function autoCacheProtocols() {
    if (state.autoCacheStarted) return;
    state.autoCacheStarted = true;
    if (!('caches' in window)) { updateOfflineSummary(); return; }
    const uncached = state.protocols.filter(p => !state.saved.has(p.file));
    uncached.forEach(p => { state.caching.add(p.file); state.missing.delete(p.file); });
    render();
    for (const protocol of uncached) {
      try {
        await cachePdf(protocol);
      } catch (err) {
        state.missing.add(protocol.file);
        console.warn(`[ACT Protocols] Could not cache ${protocol.file}`, err);
      } finally {
        state.caching.delete(protocol.file);
        render();
      }
    }
    updateOfflineSummary();
  }
  function bind() {
    const debouncedRender = debounce(render);
    updateThemeColor();
    preferredDark?.addEventListener?.('change', updateThemeColor);
    els.search.addEventListener('input', (e) => { state.query = e.target.value; debouncedRender(); });
    els.filters.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-category]');
      if (!btn) return;
      state.category = btn.dataset.category;
      els.filters.querySelectorAll('.filter-btn').forEach(b => b.classList.toggle('active', b === btn));
      render();
    });
    els.grid.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const p = state.protocols.find(x => x.id === btn.dataset.id);
      if (!p) return;
      handleOpen(p);
    });
  }
  async function loadJson(url) { const response = await fetch(url, { cache: 'no-cache' }); if (!response.ok) throw new Error(`${url}: ${response.status}`); return response.json(); }
  async function init() { applyDisplayModeClass(); window.matchMedia?.('(display-mode: standalone)').addEventListener?.('change', applyDisplayModeClass); bind(); const savedReturnState = loadReturnState(); try { const [manifest, search, aliases, medicationMap] = await Promise.allSettled([loadJson(MANIFEST_URL), loadJson(SEARCH_URL), loadJson(ALIAS_URL), loadJson(MEDICATION_MAP_URL)]); if (manifest.status !== 'fulfilled') throw manifest.reason; state.protocols = manifest.value; buildProtocolIdLookup(); if (search.status === 'fulfilled') { state.searchReady = true; search.value.forEach(r => { state.searchIndex.set(r.id, r); state.searchIndex.set(normalizeProtocolId(r.id), r); }); } else console.warn('[ACT Protocols] Search index unavailable; using metadata fallback', search.reason); if (aliases.status === 'fulfilled') { state.aliasesReady = true; state.aliases = aliases.value; buildAliasLookup(); } else console.warn('[ACT Protocols] Medication aliases unavailable', aliases.reason); if (medicationMap.status === 'fulfilled') buildMedicationMap(medicationMap.value); else console.warn('[ACT Protocols] Medication protocol map unavailable', medicationMap.reason); applyRestoredFilters(savedReturnState); await refreshSaved(); render(); restoreScrollPosition(savedReturnState); notifyServiceWorker([MANIFEST_URL, SEARCH_URL, ALIAS_URL, MEDICATION_MAP_URL]); autoCacheProtocols(); } catch (err) { console.error('[ACT Protocols] Failed to load protocol manifest', err); els.count.textContent = 'Unable to load protocols.'; els.grid.innerHTML = '<div class="error-state">Unable to load ACT protocols. Please try again when the app is online.</div>'; } }
  document.addEventListener('DOMContentLoaded', init);
})();
