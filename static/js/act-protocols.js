(() => {
  const MANIFEST_URL = '/static/data/act-protocols.json';
  const SEARCH_URL = '/static/data/act-protocol-search.json';
  const ALIAS_URL = '/static/data/act-medication-aliases.json';
  const MEDICATION_MAP_URL = '/static/data/act-medication-protocol-map.json';
  const CACHE_NAME = 'act-protocol-pdfs-v5';
  const CACHE_PREFIX = 'act-protocol-pdfs-';
  const CATEGORY_ORDER = ['General', 'Medical', 'Cardiac', 'Trauma', 'Pediatric', 'Procedures'];
  const PROTOCOL_ID_COLLATOR = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  const INSTALL_DISMISSED_KEY = 'act-protocols-install-dismissed';
  const RETURN_STATE_KEY = 'act-protocols-return-state';
  const state = { protocols: [], searchIndex: new Map(), aliases: [], aliasLookup: new Map(), medicationMap: new Map(), protocolIdLookup: new Map(), category: 'All', query: '', suggestions: [], activeSuggestionIndex: -1, saved: new Set(), caching: new Set(), missing: new Set(), resultMeta: new Map(), searchReady: false, aliasesReady: false, autoCacheStarted: false, refreshInProgress: false, currentDownloadTitle: '', deferredInstallPrompt: null };
  const els = {
    grid: document.getElementById('protocolGrid'), search: document.getElementById('protocolSearch'), filters: document.getElementById('categoryFilters'),
    count: document.getElementById('resultCount'), offlineSummary: document.getElementById('offlineSummary'), suggestions: document.getElementById('protocolSearchSuggestions'),
    retryBtn: document.getElementById('retryFailedBtn'),
    installHelp: document.getElementById('installActHelp'), installBtn: document.getElementById('installActBtn'), dismissInstallBtn: document.getElementById('dismissInstallActBtn')
  };
  const encoded = (url) => encodeURI(url);
  const normalize = (text) => (text || '').toString().toLowerCase().normalize('NFKD').replace(/[\u2010-\u2015]/g, '-').replace(/\s+/g, ' ').trim();
  const escapeHtml = (text) => (text || '').toString().replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const debounce = (fn, wait = 180) => { let id; return (...args) => { clearTimeout(id); id = setTimeout(() => fn(...args), wait); }; };
  function categoryRank(category) {
    const rank = CATEGORY_ORDER.indexOf(category);
    return rank === -1 ? CATEGORY_ORDER.length : rank;
  }
  function compareProtocolEntries(a, b, query) {
    const categoryDelta = categoryRank(a.protocol.category) - categoryRank(b.protocol.category);
    if (categoryDelta) return categoryDelta;
    if (query) {
      const scoreDelta = b.score - a.score;
      if (scoreDelta) return scoreDelta;
    }
    const protocolIdDelta = PROTOCOL_ID_COLLATOR.compare(normalizeProtocolId(a.protocol.id), normalizeProtocolId(b.protocol.id));
    if (protocolIdDelta) return protocolIdDelta;
    return a.protocol.title.localeCompare(b.protocol.title) || a.protocol.id.localeCompare(b.protocol.id);
  }

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
  function escapeRegExp(text) { return (text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function hasToken(text, term) {
    const normalizedTerm = normalize(term);
    if (!normalizedTerm) return false;
    return new RegExp(`(^|[^a-z0-9])${escapeRegExp(normalizedTerm)}([^a-z0-9]|$)`).test(normalize(text));
  }
  function exactProtocolIdMatch(protocol, q) {
    const id = normalize(protocol.id);
    const normalizedId = normalizeProtocolId(protocol.id);
    const queryId = normalize(q);
    return id === queryId || normalizedId === normalizeProtocolId(q);
  }
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
    const isShortQuery = q.length <= 4;
    const reasons = []; let score = -1;
    if (exactProtocolIdMatch(protocol, q)) {
      reasons.push({ type: 'Protocol ID match', text: protocol.id });
      score = Math.max(score, 150);
    }
    if (normalize(protocol.title) === q) {
      reasons.push({ type: 'Title match', text: protocol.title });
      score = Math.max(score, 135);
    }
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
      score = Math.max(score, 120);
    });
    (record?.detectedMedications || []).forEach((med) => {
      const aliases = (med.matchedAliases || []).map(normalize);
      const canon = normalize(med.canonicalKey || med.canonical);
      const expanded = terms.includes(canon) || aliases.some(a => terms.includes(a));
      if (expanded && !reasons.some(r => r.type === 'Medication match' && normalize(r.text).includes(canon))) {
        reasons.push({ type: 'Medication match', text: `"${state.query.trim()}" → ${med.canonical}`, pages: (med.pages || []).slice(0, 4), pageRanges: med.pageRanges });
        score = Math.max(score, 115);
      }
    });
    if (normalize(protocol.title).includes(q) && (!isShortQuery || hasToken(protocol.title, q))) { reasons.push({ type: 'Title match', text: protocol.title }); score = Math.max(score, 100); }
    if ((protocol.tags || []).some(t => normalize(t) === q || (!isShortQuery && normalize(t).includes(q)))) { reasons.push({ type: 'Tag match', text: q }); score = Math.max(score, 95); }
    if (!isShortQuery && hayMeta.includes(q)) score = Math.max(score, 55);
    const pdfText = record?.normalizedText || '';
    if (pdfText) {
      const exact = terms.some(t => new RegExp(`(^|[^a-z0-9])${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`).test(pdfText));
      const partial = !exact && !isShortQuery && terms.some(t => t.length >= 3 && pdfText.includes(t));
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
    return matches.sort((a, b) => compareProtocolEntries(a, b, q)).map(x => x.protocol);
  }
  function suggestionTerms() {
    const terms = new Map();
    const addTerm = (term) => {
      const key = normalize(term);
      if (key && !terms.has(key)) terms.set(key, term);
    };
    state.protocols.forEach((p) => {
      [p.id, normalizeProtocolId(p.id), p.title, ...(p.tags || [])].forEach(addTerm);
    });
    state.aliases.forEach((med) => {
      [med.canonical, med.canonicalKey, ...(med.aliases || []), ...(med.normalizedAliases || []), ...(med.genericNames || []), ...(med.brandNames || []), ...(med.tradeNames || []), ...(med.activeIngredientNames || []), ...(med.substanceNames || []), ...(med.shorthand || [])].forEach(addTerm);
    });
    return [...terms.values()];
  }
  function matchingSuggestions(query) {
    const q = normalize(query);
    if (q.length < 2) return [];
    return suggestionTerms()
      .map(term => ({ term, normalized: normalize(term) }))
      .filter(({ normalized }) => normalized.includes(q))
      .sort((a, b) => {
        const aStarts = a.normalized.startsWith(q);
        const bStarts = b.normalized.startsWith(q);
        if (aStarts !== bStarts) return aStarts ? -1 : 1;
        return a.term.localeCompare(b.term, undefined, { numeric: true, sensitivity: 'base' });
      })
      .slice(0, 8)
      .map(({ term }) => term);
  }
  function closeSuggestions() {
    state.suggestions = [];
    state.activeSuggestionIndex = -1;
    els.suggestions?.classList.add('hidden');
    if (els.suggestions) els.suggestions.innerHTML = '';
    els.search?.setAttribute('aria-expanded', 'false');
    els.search?.removeAttribute('aria-activedescendant');
  }
  function renderSuggestions() {
    if (!els.suggestions) return;
    if (!state.suggestions.length) { closeSuggestions(); return; }
    els.suggestions.innerHTML = state.suggestions.map((suggestion, index) => `<button id="protocolSearchSuggestion-${index}" class="protocol-search-suggestion${index === state.activeSuggestionIndex ? ' active' : ''}" type="button" role="option" aria-selected="${index === state.activeSuggestionIndex}" data-index="${index}">${escapeHtml(suggestion)}</button>`).join('');
    els.suggestions.classList.remove('hidden');
    els.search.setAttribute('aria-expanded', 'true');
    if (state.activeSuggestionIndex >= 0) els.search.setAttribute('aria-activedescendant', `protocolSearchSuggestion-${state.activeSuggestionIndex}`);
    else els.search.removeAttribute('aria-activedescendant');
  }
  function updateSuggestions() {
    state.suggestions = matchingSuggestions(state.query);
    state.activeSuggestionIndex = -1;
    renderSuggestions();
  }
  function selectSuggestion(index) {
    const suggestion = state.suggestions[index];
    if (!suggestion) return;
    els.search.value = suggestion;
    state.query = suggestion;
    saveListState();
    render();
    closeSuggestions();
  }
  function statusClass(p) { return state.saved.has(p.file) ? 'saved' : state.missing.has(p.file) ? 'error' : state.caching.has(p.file) ? 'caching' : ''; }
  function statusText(p) {
    if (state.saved.has(p.file)) return 'Saved for Offline Use';
    if (state.missing.has(p.file)) return 'Could not save offline — will retry next time the app opens.';
    if (state.caching.has(p.file)) return 'Downloading';
    return 'Queued for offline download';
  }
  function setOfflineSummary(text, status, detail = '') {
    if (!els.offlineSummary) return;
    els.offlineSummary.dataset.status = status;
    els.offlineSummary.replaceChildren();

    const label = document.createElement('span');
    label.className = 'offline-download-status-label';
    label.textContent = text;
    els.offlineSummary.appendChild(label);

    if (detail) {
      const detailLine = document.createElement('span');
      detailLine.className = 'offline-download-status-detail';
      detailLine.textContent = detail;
      els.offlineSummary.appendChild(detailLine);
    }
  }
  function updateOfflineSummary() {
    if (!els.offlineSummary) return;
    if (!('caches' in window)) {
      setOfflineSummary('Offline PDF caching is not available in this browser.', 'error');
      els.retryBtn?.classList.add('hidden');
      return;
    }
    const total = state.protocols.length;
    const saved = state.saved.size;
    const caching = state.caching.size;
    const failed = state.missing.size;
    els.retryBtn?.classList.toggle('hidden', failed === 0);
    if (!total) {
      setOfflineSummary('Checking Protocol Downloads', 'downloading');
    } else if (caching || saved + failed < total) {
      const activeProgress = Math.min(total, saved + (caching ? 1 : 0));
      setOfflineSummary('Downloading Protocols', 'downloading', `${activeProgress} out of ${total}`);
    } else if (failed) {
      setOfflineSummary('Failed to Download', 'error', `${failed} failed`);
    } else if (saved === total) {
      setOfflineSummary('Offline Protocols Saved', 'saved', `${saved} out of ${total}`);
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
  function saveListState(extra = {}) {
    try {
      sessionStorage.setItem(RETURN_STATE_KEY, JSON.stringify({ ...returnState(), ...extra }));
    } catch (err) {
      console.warn('[ACT Protocols] Could not save return position', err);
    }
  }
  function saveReturnState(protocol) {
    saveListState({ openedProtocolId: protocol.id });
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
  function restoreProtocolListState(saved, { restoreScroll = false } = {}) {
    if (!saved || !state.protocols.length) return;
    applyRestoredFilters(saved);
    render();
    if (restoreScroll) restoreScrollPosition(saved);
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
    let currentCategory = '';
    els.grid.innerHTML = list.map((p) => {
      const heading = p.category !== currentCategory
        ? `<div class="protocol-group-heading" role="heading" aria-level="2">${escapeHtml(p.category)}</div>`
        : '';
      currentCategory = p.category;
      return `${heading}
      <article class="protocol-card" data-file="${escapeHtml(p.file)}">
        <div class="protocol-meta"><span class="protocol-pill protocol-id">${escapeHtml(p.id)}</span><span class="protocol-pill">${escapeHtml(p.category)}</span></div>
        <h2>${escapeHtml(p.title)}</h2>
        ${renderReasons(p)}
        <div class="offline-status ${statusClass(p)}" data-status>${statusText(p)}</div>
        <div class="protocol-buttons">
          <button class="btn btn-outline" type="button" data-action="open" data-id="${escapeHtml(p.id)}">Open PDF</button>
        </div>
      </article>`;
    }).join('');
  }
  function pdfInfoUrl(file) {
    return `/act-protocols/pdf-info?${new URLSearchParams({ file }).toString()}`;
  }
  function pdfPageUrl(file, pageNumber) {
    return `/act-protocols/pdf-page?${new URLSearchParams({ file, page: String(pageNumber), scale: '2' }).toString()}`;
  }
  async function cacheUrl(cache, url) {
    const response = await fetch(url, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`${url}: ${response.status} ${response.statusText}`);
    const body = await response.arrayBuffer();
    if (!body.byteLength) throw new Error(`${url}: empty response`);
    await cache.put(url, new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers }));
    const cached = await cache.match(url);
    if (!cached?.ok) throw new Error(`${url}: not available in ACT cache after download`);
    return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
  }
  async function getCachedPageCount(file) {
    const cache = await caches.open(CACHE_NAME);
    const response = await cache.match(pdfInfoUrl(file));
    if (!response?.ok) return 0;
    try {
      const info = await response.json();
      return Number(info.pageCount || 0);
    } catch (err) {
      console.warn('[ACT Protocols] Cached PDF info could not be read', err);
      return 0;
    }
  }
  async function hasCachedViewerResources(file) {
    if (!(await isCached(file))) return false;
    const pageCount = await getCachedPageCount(file);
    if (!pageCount) return false;
    const checks = [];
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      checks.push(caches.open(CACHE_NAME).then((cache) => cache.match(pdfPageUrl(file, pageNumber))).then((response) => Boolean(response?.ok)));
    }
    return (await Promise.all(checks)).every(Boolean);
  }
  function pdfInfoUrl(file) {
    return `/act-protocols/pdf-info?${new URLSearchParams({ file }).toString()}`;
  }
  function pdfPageUrl(file, pageNumber) {
    return `/act-protocols/pdf-page?${new URLSearchParams({ file, page: String(pageNumber), scale: '2' }).toString()}`;
  }
  async function cacheUrl(cache, url) {
    const response = await fetch(url, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`${url}: ${response.status} ${response.statusText}`);
    const body = await response.arrayBuffer();
    if (!body.byteLength) throw new Error(`${url}: empty response`);
    await cache.put(url, new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers }));
    const cached = await cache.match(url);
    if (!cached?.ok) throw new Error(`${url}: not available in ACT cache after download`);
    return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
  }
  async function getCachedPageCount(file) {
    const cache = await caches.open(CACHE_NAME);
    const response = await cache.match(pdfInfoUrl(file));
    if (!response?.ok) return 0;
    try {
      const info = await response.json();
      return Number(info.pageCount || 0);
    } catch (err) {
      console.warn('[ACT Protocols] Cached PDF info could not be read', err);
      return 0;
    }
  }
  async function hasCachedViewerResources(file) {
    if (!(await isCached(file))) return false;
    const pageCount = await getCachedPageCount(file);
    if (!pageCount) return false;
    const checks = [];
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      checks.push(caches.open(CACHE_NAME).then((cache) => cache.match(pdfPageUrl(file, pageNumber))).then((response) => Boolean(response?.ok)));
    }
    return (await Promise.all(checks)).every(Boolean);
  }
  async function cachePdf(protocol) {
    const url = encoded(protocol.file);
    const cache = await caches.open(CACHE_NAME);
    await cacheUrl(cache, url);

    const infoResponse = await cacheUrl(cache, pdfInfoUrl(protocol.file));
    const info = await infoResponse.json();
    const pageCount = Number(info.page_count || info.pageCount || 0);
    if (!pageCount) throw new Error('PDF has no pages to cache for offline viewing.');

    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      await cacheUrl(cache, pdfPageUrl(protocol.file, pageNumber));
    }

    if (!(await hasCachedViewerResources(protocol.file))) throw new Error('PDF viewer resources were not available in cache after download.');
    state.saved.add(protocol.file);
    state.missing.delete(protocol.file);
  }
  function notifyServiceWorker(urls) { if (navigator.serviceWorker?.controller) navigator.serviceWorker.controller.postMessage({ type: 'CACHE_URLS', urls }); }
  async function isCached(file) {
    if (!('caches' in window)) return false;
    const cache = await caches.open(CACHE_NAME);
    const response = await cache.match(encoded(file));
    return Boolean(response?.ok);
  }
  async function refreshSaved() {
    await Promise.all(state.protocols.map(async (p) => {
      if (await hasCachedViewerResources(p.file)) {
        state.saved.add(p.file);
        state.missing.delete(p.file);
      } else {
        state.saved.delete(p.file);
      }
    }));
  }
  async function reverifyCachedStatuses() {
    if (state.refreshInProgress || !state.protocols.length || !('caches' in window)) return;
    state.refreshInProgress = true;
    try {
      await refreshSaved();
      render();
    } finally {
      state.refreshInProgress = false;
    }
  }
  function openProtocolViewer(protocol) {
    saveReturnState(protocol);
    const meta = state.resultMeta.get(protocol.id); const page = meta?.reasons?.find(r => r.pages?.length)?.pages?.[0];
    const params = new URLSearchParams({ file: protocol.file, title: `${protocol.id} ${protocol.title}` }); if (page) params.set('page', page);
    window.location.href = `/act-protocols/viewer#${params.toString()}`;
  }
  async function handleOpen(protocol) {
    if (!('caches' in window)) {
      openProtocolViewer(protocol);
      return;
    }
    if (await hasCachedViewerResources(protocol.file)) {
      state.saved.add(protocol.file);
      state.missing.delete(protocol.file);
      openProtocolViewer(protocol);
      return;
    }
    state.saved.delete(protocol.file);
    if (!navigator.onLine) {
      state.missing.add(protocol.file);
      render();
      return;
    }
    state.caching.add(protocol.file);
    state.missing.delete(protocol.file);
    render();
    try {
      await cachePdf(protocol);
      openProtocolViewer(protocol);
    } catch (err) {
      state.missing.add(protocol.file);
      console.warn(`[ACT Protocols] Could not verify ${protocol.file} for offline viewing before opening`, err);
      openProtocolViewer(protocol);
    } finally {
      state.caching.delete(protocol.file);
      render();
    }
  }
  async function cacheProtocols(protocols) {
    if (!('caches' in window) || !protocols.length) { updateOfflineSummary(); return; }
    protocols.forEach(p => { state.caching.add(p.file); state.missing.delete(p.file); });
    render();
    for (const protocol of protocols) {
      state.currentDownloadTitle = protocol.title;
      render();
      try {
        await cachePdf(protocol);
      } catch (err) {
        state.missing.add(protocol.file);
        console.warn(`[ACT Protocols] Could not cache ${protocol.file}`, err);
      } finally {
        state.caching.delete(protocol.file);
        state.currentDownloadTitle = '';
        render();
      }
    }
    updateOfflineSummary();
  }
  async function clearActOfflineCache() {
    if (!('caches' in window)) return;
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith(CACHE_PREFIX)).map(name => caches.delete(name)));
    state.saved.clear();
    state.caching.clear();
    state.missing.clear();
    state.currentDownloadTitle = '';
    render();
  }
  async function autoCacheProtocols() {
    if (state.autoCacheStarted) return;
    state.autoCacheStarted = true;
    if (!('caches' in window)) { updateOfflineSummary(); return; }
    await cacheProtocols(state.protocols.filter(p => !state.saved.has(p.file)));
  }
  function setupInstallGuidance() {
    const isStandalone = window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
    let dismissed = false;
    try { dismissed = localStorage.getItem(INSTALL_DISMISSED_KEY) === 'true'; } catch {}
    if (!els.installHelp || isStandalone || dismissed) return;
    els.installHelp.classList.remove('hidden');
    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      state.deferredInstallPrompt = event;
      els.installBtn?.classList.remove('hidden');
    });
    els.installBtn?.addEventListener('click', async () => {
      if (!state.deferredInstallPrompt) return;
      state.deferredInstallPrompt.prompt();
      const choice = await state.deferredInstallPrompt.userChoice;
      state.deferredInstallPrompt = null;
      if (choice?.outcome === 'accepted') els.installHelp.classList.add('hidden');
    });
    els.dismissInstallBtn?.addEventListener('click', () => {
      try { localStorage.setItem(INSTALL_DISMISSED_KEY, 'true'); } catch {}
      els.installHelp.classList.add('hidden');
    });
  }
  function bind() {
    const debouncedRender = debounce(render);
    const debouncedReverify = debounce(reverifyCachedStatuses, 500);
    updateThemeColor();
    preferredDark?.addEventListener?.('change', updateThemeColor);
    els.search.addEventListener('input', (e) => {
      state.query = e.target.value;
      saveListState();
      updateSuggestions();
      if (!normalize(state.query)) render();
      else debouncedRender();
    });
    els.search.addEventListener('keydown', (e) => {
      if (!state.suggestions.length) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        state.activeSuggestionIndex = (state.activeSuggestionIndex + 1) % state.suggestions.length;
        renderSuggestions();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        state.activeSuggestionIndex = state.activeSuggestionIndex <= 0 ? state.suggestions.length - 1 : state.activeSuggestionIndex - 1;
        renderSuggestions();
      } else if (e.key === 'Enter' && state.activeSuggestionIndex >= 0) {
        e.preventDefault();
        selectSuggestion(state.activeSuggestionIndex);
      } else if (e.key === 'Escape') {
        closeSuggestions();
      }
    });
    els.suggestions?.addEventListener('mousedown', (e) => e.preventDefault());
    els.suggestions?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-index]');
      if (!btn) return;
      selectSuggestion(Number(btn.dataset.index));
    });
    document.addEventListener('click', (e) => {
      if (e.target === els.search || els.suggestions?.contains(e.target)) return;
      closeSuggestions();
    });
    els.filters.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-category]');
      if (!btn) return;
      state.category = btn.dataset.category;
      els.filters.querySelectorAll('.filter-btn').forEach(b => b.classList.toggle('active', b === btn));
      saveListState();
      render();
    });
    els.grid.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const p = state.protocols.find(x => x.id === btn.dataset.id);
      if (!p) return;
      handleOpen(p);
    });
    window.addEventListener('pageshow', (event) => {
      restoreProtocolListState(loadReturnState(), { restoreScroll: Boolean(event.persisted) });
      debouncedReverify();
    });
    els.retryBtn?.addEventListener('click', () => cacheProtocols(state.protocols.filter(p => state.missing.has(p.file))));
    window.addEventListener('online', debouncedReverify);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') debouncedReverify();
    });
    setupInstallGuidance();
  }
  async function loadJson(url) { const response = await fetch(url, { cache: 'no-cache' }); if (!response.ok) throw new Error(`${url}: ${response.status}`); return response.json(); }
  async function init() { applyDisplayModeClass(); window.matchMedia?.('(display-mode: standalone)').addEventListener?.('change', applyDisplayModeClass); bind(); const savedReturnState = loadReturnState(); try { const [manifest, search, aliases, medicationMap] = await Promise.allSettled([loadJson(MANIFEST_URL), loadJson(SEARCH_URL), loadJson(ALIAS_URL), loadJson(MEDICATION_MAP_URL)]); if (manifest.status !== 'fulfilled') throw manifest.reason; state.protocols = manifest.value; buildProtocolIdLookup(); if (search.status === 'fulfilled') { state.searchReady = true; search.value.forEach(r => { state.searchIndex.set(r.id, r); state.searchIndex.set(normalizeProtocolId(r.id), r); }); } else console.warn('[ACT Protocols] Search index unavailable; using metadata fallback', search.reason); if (aliases.status === 'fulfilled') { state.aliasesReady = true; state.aliases = aliases.value; buildAliasLookup(); } else console.warn('[ACT Protocols] Medication aliases unavailable', aliases.reason); if (medicationMap.status === 'fulfilled') buildMedicationMap(medicationMap.value); else console.warn('[ACT Protocols] Medication protocol map unavailable', medicationMap.reason); applyRestoredFilters(savedReturnState); await refreshSaved(); render(); restoreScrollPosition(savedReturnState); notifyServiceWorker([MANIFEST_URL, SEARCH_URL, ALIAS_URL, MEDICATION_MAP_URL]); autoCacheProtocols(); } catch (err) { console.error('[ACT Protocols] Failed to load protocol manifest', err); els.count.textContent = 'Unable to load protocols.'; els.grid.innerHTML = '<div class="error-state">Unable to load ACT protocols. Please try again when the app is online.</div>'; } }
  document.addEventListener('DOMContentLoaded', init);
})();
