(() => {
  const MANIFEST_URL = '/static/data/act-protocols.json';
  const SEARCH_URL = '/static/data/act-protocol-search.json';
  const ALIAS_URL = '/static/data/act-medication-aliases.json';
  const MEDICATION_MAP_URL = '/static/data/act-medication-protocol-map.json';
  const CATEGORY_ORDER = ['General', 'Medical', 'Cardiac', 'Trauma', 'Pediatric', 'Procedures', 'Infusion Guidelines'];
  const BLOOD_SEARCH_PRIORITY = {
    term: 'blood',
    category: 'Procedures',
    protocolIds: ['GUID-3203-PR025', 'GUID-3203-PR025B']
  };
  const PROTOCOL_ID_COLLATOR = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  const INSTALL_DISMISSED_KEY = 'act-protocols-install-dismissed';
  const RETURN_STATE_KEY = 'act-protocols-return-state';
  const offline = window.ACTOffline;
  const defaultFilters = { category: '', patient: '', offline: '' };
  const renderedLists = new WeakMap();
  const state = {
    protocols: [], searchIndex: new Map(), aliases: [], aliasLookup: new Map(),
    medicationMap: new Map(), protocolIdLookup: new Map(), resultMeta: new Map(),
    expandedCategory: '', query: '', filters: { ...defaultFilters },
    suggestions: [], activeSuggestionIndex: -1, searchReady: false, aliasesReady: false,
    offlineReady: false, offlineRenderKey: '', busyAction: '', deferredInstallPrompt: null
  };
  const els = {
    grid: document.getElementById('protocolGrid'), searchResults: document.getElementById('searchResults'), searchResultsSection: document.getElementById('searchResultsSection'), search: document.getElementById('protocolSearch'), clearSearch: document.getElementById('clearProtocolSearch'),
    count: document.getElementById('resultCount'), total: document.getElementById('protocolTotal'), offlineSummary: document.getElementById('offlineSummary'), suggestions: document.getElementById('protocolSearchSuggestions'),
    filters: [...document.querySelectorAll('[data-filter]')], reset: document.getElementById('resetProtocolFilters'),
    panel: document.getElementById('protocolOfflinePanel'), storage: document.getElementById('offlineStorage'),
    updateStatus: document.getElementById('offlineUpdateStatus'), queueStatus: document.getElementById('offlineQueueStatus'),
    downloadProgress: document.getElementById('offlineDownloadProgress'), currentDocument: document.getElementById('offlineCurrentDocument'),
    pageProgress: document.getElementById('offlinePageProgress'), offlineMessage: document.getElementById('offlineMessage'),
    installHelp: document.getElementById('installActHelp'), installBtn: document.getElementById('installActBtn'), dismissInstallBtn: document.getElementById('dismissInstallActBtn')
  };
  const normalize = (text) => (text || '').toString().toLowerCase().normalize('NFKD').replace(/[\u2010-\u2015]/g, '-').replace(/\s+/g, ' ').trim();
  const escapeHtml = (text) => (text || '').toString().replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  function debounce(fn, wait = 180) {
    let timer;
    return () => {
      clearTimeout(timer);
      timer = setTimeout(fn, wait);
    };
  }
  function categoryRank(category) {
    const rank = CATEGORY_ORDER.indexOf(category);
    return rank === -1 ? CATEGORY_ORDER.length : rank;
  }
  function isBloodSearchPriorityActive(query) {
    const normalizedQuery = normalize(query);
    return Boolean(normalizedQuery) && (
      BLOOD_SEARCH_PRIORITY.term.startsWith(normalizedQuery)
      || normalizedQuery.startsWith(BLOOD_SEARCH_PRIORITY.term)
    );
  }
  function bloodSearchProtocolRank(protocolId) {
    return BLOOD_SEARCH_PRIORITY.protocolIds.indexOf(protocolId);
  }
  function compareProtocolEntries(a, b, query) {
    if (isBloodSearchPriorityActive(query)) {
      const aCategoryRank = a.protocol.category === BLOOD_SEARCH_PRIORITY.category ? -1 : categoryRank(a.protocol.category);
      const bCategoryRank = b.protocol.category === BLOOD_SEARCH_PRIORITY.category ? -1 : categoryRank(b.protocol.category);
      const categoryDelta = aCategoryRank - bCategoryRank;
      if (categoryDelta) return categoryDelta;
      const aPriorityRank = bloodSearchProtocolRank(a.protocol.id);
      const bPriorityRank = bloodSearchProtocolRank(b.protocol.id);
      if (aPriorityRank !== bPriorityRank) {
        if (aPriorityRank === -1) return 1;
        if (bPriorityRank === -1) return -1;
        return aPriorityRank - bPriorityRank;
      }
    }
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
  function documentStatus(protocol) {
    return state.offlineReady ? offline.document(protocol.file) : {};
  }
  function matchesFilters(protocol) {
    const { category, patient, offline: availability } = state.filters;
    if (category && protocol.category !== category) return false;
    if (patient && !protocol.patientGroups?.includes(patient)) return false;
    if (!availability) return true;
    const status = documentStatus(protocol);
    return availability === 'available' ? status.available : status.updateStatus === 'available';
  }
  function filtered() {
    const q = normalize(state.query);
    const bloodPriorityActive = isBloodSearchPriorityActive(q);
    state.resultMeta.clear();
    const matches = [];
    for (const p of state.protocols) {
      if (!matchesFilters(p)) continue;
      if (!q) { matches.push({ protocol: p, score: 0 }); continue; }
      if (bloodPriorityActive && bloodSearchProtocolRank(p.id) !== -1) {
        const match = { score: 0, reasons: [] };
        state.resultMeta.set(p.id, match);
        matches.push({ protocol: p, score: match.score });
        continue;
      }
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
    state.protocols.filter(matchesFilters).forEach((p) => {
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
    els.suggestions.innerHTML = state.suggestions.map((suggestion, index) => `<button id="protocolSearchSuggestion-${index}" class="protocol-search-suggestion${index === state.activeSuggestionIndex ? ' active' : ''}" type="button" tabindex="-1" role="option" aria-selected="${index === state.activeSuggestionIndex}" data-index="${index}">${escapeHtml(suggestion)}</button>`).join('');
    els.suggestions.classList.remove('hidden');
    els.search.setAttribute('aria-expanded', 'true');
    if (state.activeSuggestionIndex < 0) {
      els.search.removeAttribute('aria-activedescendant');
      return;
    }
    const active = els.suggestions.children[state.activeSuggestionIndex];
    els.search.setAttribute('aria-activedescendant', active.id);
    const optionBounds = active.getBoundingClientRect();
    const listBounds = els.suggestions.getBoundingClientRect();
    if (optionBounds.bottom > listBounds.bottom) {
      els.suggestions.scrollTop += optionBounds.bottom - listBounds.bottom;
    } else if (optionBounds.top < listBounds.top) {
      els.suggestions.scrollTop -= listBounds.top - optionBounds.top;
    }
  }
  function updateSuggestions(value) {
    state.suggestions = matchingSuggestions(value);
    state.activeSuggestionIndex = -1;
    renderSuggestions();
  }
  function updateClearSearchButton() {
    els.clearSearch?.classList.toggle('hidden', !els.search.value);
  }
  function clearSearch() {
    els.search.value = '';
    state.query = '';
    closeSuggestions();
    updateClearSearchButton();
    saveListState();
    render();
    els.search.focus();
  }
  function resetFilters() {
    state.filters = { ...defaultFilters };
    for (const input of els.filters) input.value = '';
    clearSearch();
  }
  function selectSuggestion(index) {
    const suggestion = state.suggestions[index];
    if (!suggestion) return;
    els.search.value = suggestion;
    state.query = suggestion;
    updateClearSearchButton();
    saveListState();
    render();
    closeSuggestions();
    els.search.focus();
  }
  function returnState() {
    return {
      query: state.query,
      filters: state.filters,
      expandedCategory: state.expandedCategory,
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
    state.expandedCategory = typeof saved.expandedCategory === 'string'
      ? saved.expandedCategory
      : (saved.category && saved.category !== 'All' ? saved.category : '');
    els.search.value = state.query;
    for (const input of els.filters) {
      const savedValue = saved.filters?.[input.dataset.filter];
      input.value = [...input.options].some((option) => option.value === savedValue) ? savedValue : '';
      state.filters[input.dataset.filter] = input.value;
    }
    updateClearSearchButton();
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
        const openedButton = document.querySelector(`[data-action="open"][data-id="${CSS.escape(saved.openedProtocolId)}"]`);
        openedButton?.closest('.protocol-row')?.scrollIntoView({ block: 'center' });
      });
    });
  }
  function renderReasons(p) {
    const meta = state.resultMeta.get(p.id); if (!meta?.reasons?.length) return '';
    return `<div class="match-reasons">${meta.reasons.slice(0, 3).map(r => `<div class="match-reason"><strong>${escapeHtml(r.type)}:</strong> ${escapeHtml(r.text)}${r.pageRanges ? ` <span>Pages: ${escapeHtml(r.pageRanges)}</span>` : r.pages?.length ? ` <span>Pages: ${escapeHtml(r.pages.join(', '))}</span>` : ''}</div>`).join('')}</div>`;
  }
  function renderSourceMeta(p) {
    const parts = [];
    if (p.revisionDate) parts.push(`Revision: ${p.revisionDate}`);
    if (p.effectiveDate) parts.push(`Effective: ${p.effectiveDate}`);
    if (p.source) parts.push(`Source: ${p.source}`);
    return parts.length ? `<div class="protocol-source-meta">${parts.map(escapeHtml).join(' • ')}</div>` : '';
  }
  function formatUpdatedDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return '';
    const [year, month, day] = value.split('-').map(Number);
    return new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, day)));
  }
  function statusText(status) {
    const labels = [];
    if (status.available) labels.push('Available offline');
    else if (status.legacy) labels.push('Previous offline copy');
    if (status.partial) labels.push('Partial download');
    else if (status.queued) labels.push('Queued for download');
    if (status.updateStatus === 'available') labels.push('Update available');
    else if (status.updateStatus === 'current') labels.push('Up to date');
    else if (status.available || status.legacy) labels.push('Update status not checked');
    return labels.join(' • ');
  }
  function queueActive() {
    return state.offlineReady && ['downloading', 'paused'].includes(offline.queue().status);
  }
  function canSave(status) {
    return !status.available && !status.legacyReadable;
  }
  function canRemove(status) {
    return status.available || status.legacy || status.partial;
  }
  function offlineControlsLocked() {
    return queueActive() || Boolean(state.busyAction);
  }
  function renderOfflineButton(action, label, scope = '') {
    const disabled = offlineControlsLocked() || (!navigator.onLine && ['save', 'update'].includes(action));
    return `<button class="act-small-button" type="button" data-action="${action}" ${scope}${disabled ? ' disabled' : ''}>${label}</button>`;
  }
  function renderProtocolRow(p, { showCategory = false, showReasons = false } = {}) {
    const updatedDate = formatUpdatedDate(p.updatedDate);
    const secondary = [p.id, ...(showCategory ? [p.category] : [])];
    const status = documentStatus(p);
    const label = statusText(status);
    const statusClass = status.available ? 'saved' : status.partial || status.queued ? 'caching' : '';
    const scope = `data-id="${escapeHtml(p.id)}"`;
    const actions = state.offlineReady ? [
      canSave(status) ? renderOfflineButton('save', 'Save offline', scope) : '',
      status.updateable ? renderOfflineButton('update', 'Update this document', scope) : '',
      canRemove(status) ? renderOfflineButton('remove', 'Remove offline copy', scope) : ''
    ].join('') : '';
    return `<article class="protocol-row ${statusClass}" data-file="${escapeHtml(p.file)}">
      <button class="protocol-row-button" type="button" data-action="open" data-id="${escapeHtml(p.id)}" aria-label="Open PDF for ${escapeHtml(p.id)} ${escapeHtml(p.title)}, updated ${escapeHtml(updatedDate)}">
        <span class="protocol-row-copy">
          <strong class="protocol-row-title">${escapeHtml(p.title)}</strong>
          <span class="protocol-row-meta">${secondary.map(escapeHtml).join(' • ')}${label ? `<span class="protocol-row-status" data-status> • ${escapeHtml(label)}</span>` : ''}</span>
        </span>
        <span class="protocol-updated-date">Updated ${escapeHtml(updatedDate)}</span>
      </button>
      ${renderSourceMeta(p)}
      ${showReasons ? renderReasons(p) : ''}
      ${actions ? `<div class="act-offline-actions protocol-row-actions">${actions}</div>` : ''}
    </article>`;
  }
  function renderCategoryActions(category) {
    if (!state.offlineReady) return '';
    const statuses = state.protocols.filter(p => p.category === category).map(documentStatus);
    const scope = `data-category="${escapeHtml(category)}"`;
    const actions = [
      statuses.some(canSave) ? renderOfflineButton('save', 'Save category', scope) : '',
      statuses.some(status => status.updateable) ? renderOfflineButton('update', 'Update category', scope) : '',
      statuses.some(canRemove) ? renderOfflineButton('remove', 'Remove category offline copies', scope) : ''
    ].join('');
    return actions ? `<div class="act-offline-actions protocol-category-actions">${actions}</div>` : '';
  }
  function replaceList(container, html) {
    if (renderedLists.get(container) === html) return;
    const focused = container.contains(document.activeElement) ? document.activeElement : null;
    const active = focused?.dataset;
    container.innerHTML = html;
    if (active?.action) {
      const buttons = [...container.querySelectorAll('[data-action]:not(:disabled)')];
      const sameScope = ({ dataset }) => dataset.id === active.id && dataset.category === active.category;
      const replacement = buttons.find(button => sameScope(button) && button.dataset.action === active.action)
        || buttons.find(sameScope);
      replacement?.focus({ preventScroll: true });
    }
    renderedLists.set(container, html);
  }
  function renderAccordion(matches) {
    const html = CATEGORY_ORDER.map((category) => {
      const protocols = matches.filter(p => p.category === category).sort((a, b) => {
        const idDelta = PROTOCOL_ID_COLLATOR.compare(normalizeProtocolId(a.id), normalizeProtocolId(b.id));
        return idDelta || a.title.localeCompare(b.title);
      });
      if (!protocols.length) return '';
      const expanded = state.expandedCategory === category;
      const panelId = `protocol-category-${normalize(category).replace(/[^a-z0-9]+/g, '-')}`;
      return `<section class="protocol-category${expanded ? ' expanded' : ''}">
        <h3>
          <button class="protocol-category-toggle" type="button" data-action="toggle-category" data-category="${escapeHtml(category)}" aria-expanded="${expanded}" aria-controls="${panelId}">
            <span>${escapeHtml(category)}</span>
            <span class="protocol-category-summary"><span>${protocols.length} protocols</span><span class="protocol-category-chevron" aria-hidden="true">▶</span></span>
          </button>
        </h3>
        <div id="${panelId}" class="protocol-category-panel"${expanded ? '' : ' hidden'}>
          ${expanded ? renderCategoryActions(category) + protocols.map((protocol) => renderProtocolRow(protocol)).join('') : ''}
        </div>
      </section>`;
    }).join('');
    replaceList(els.grid, html);
  }
  function render() {
    const hasQuery = Boolean(normalize(state.query));
    const hasFilters = Object.values(state.filters).some(Boolean);
    const list = filtered();
    const showResults = hasQuery || (hasFilters && !list.length);
    els.reset.disabled = !state.query && !hasFilters;
    els.total.textContent = `${list.length} ${list.length === 1 ? 'protocol' : 'protocols'}`;
    els.searchResultsSection.classList.toggle('hidden', !showResults);
    if (showResults) {
      els.count.textContent = `${list.length} ${list.length === 1 ? 'protocol' : 'protocols'} found${hasQuery && !state.searchReady ? ' (metadata search)' : ''}`;
      replaceList(els.searchResults, list.length
        ? list.map((protocol) => renderProtocolRow(protocol, { showCategory: true, showReasons: true })).join('')
        : '<div class="empty-state"><p>No protocols match your search and filters.</p><button type="button" class="act-small-button" data-action="reset">Reset all</button></div>');
    } else {
      els.count.textContent = '';
      replaceList(els.searchResults, '');
    }
    renderAccordion(list);
  }
  function formatBytes(bytes) {
    if (!Number.isFinite(bytes)) return 'unavailable';
    if (bytes < 1024) return `${bytes} B`;
    const units = ['KB', 'MB', 'GB', 'TB'];
    let unit = -1;
    do {
      bytes /= 1024;
      unit += 1;
    } while (bytes >= 1024 && unit < units.length - 1);
    return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(bytes)} ${units[unit]}`;
  }
  const refreshStorage = debounce(async () => {
    if (!state.offlineReady || !els.panel.open) return;
    try {
      const { savedBytes, partialBytes, quota } = await offline.storage();
      const storage = [`Saved data: ${formatBytes(savedBytes)}`];
      if (partialBytes > 0) storage.push(`Partial data: ${formatBytes(partialBytes)}`);
      if (quota != null) storage.push(`Approximate site allowance: ${formatBytes(quota)}`);
      els.storage.textContent = storage.join(' • ');
    } catch (error) {
      console.warn('[ACT Protocols] Storage estimate unavailable', error);
      els.storage.textContent = 'Storage information is unavailable.';
    }
  });
  function renderOfflinePanel() {
    if (!state.offlineReady) {
      els.offlineSummary.textContent = 'Offline downloads unavailable';
      return;
    }
    const statuses = state.protocols.map(documentStatus);
    const saved = statuses.filter(status => status.available).length;
    const legacy = statuses.filter(status => status.legacy && !status.available).length;
    const updates = statuses.filter(status => status.updateStatus === 'available').length;
    const queue = offline.queue();
    const active = queueActive();
    const locked = offlineControlsLocked();
    const checked = offline.lastChecked();
    const online = navigator.onLine;
    const buttons = {
      'save-all': !locked && online && statuses.some(canSave),
      'check-updates': !state.busyAction && queue.status !== 'downloading' && online,
      'update-all': !locked && online && statuses.some(status => status.updateable),
      'remove-all': !locked && offline.hasSavedCopies(),
      pause: queue.status === 'downloading' && !state.busyAction,
      resume: queue.status === 'paused' && online && !state.busyAction,
      cancel: active && !state.busyAction
    };
    for (const [action, enabled] of Object.entries(buttons)) {
      els.panel.querySelector(`[data-action="${action}"]`).disabled = !enabled;
    }
    const summary = [`${saved} available offline`];
    if (legacy) summary.push(`${legacy} previous ${legacy === 1 ? 'copy' : 'copies'}`);
    if (updates) summary.push(`${updates} ${updates === 1 ? 'update' : 'updates'}`);
    if (queue.status === 'paused') summary.push('Download paused');
    else if (queue.status === 'downloading') summary.push('Downloading');
    els.offlineSummary.textContent = summary.join(' • ');
    els.updateStatus.textContent = state.busyAction === 'check-updates'
      ? 'Checking for updates…'
      : checked ? `Last successful update check: ${new Date(checked).toLocaleString()}` : 'Update status not checked.';
    els.downloadProgress.classList.toggle('hidden', queue.status === 'idle');
    els.panel.querySelector('[data-action="pause"]').classList.toggle('hidden', queue.status !== 'downloading');
    els.panel.querySelector('[data-action="resume"]').classList.toggle('hidden', queue.status !== 'paused');
    els.panel.querySelector('[data-action="cancel"]').classList.toggle('hidden', !active);
    const queueLabels = { downloading: 'Downloading', paused: 'Paused', complete: 'Completed', canceled: 'Canceled' };
    if (queue.status !== 'idle') {
      const status = `${queueLabels[queue.status]} · ${queue.completed} of ${queue.total} documents completed${queue.reason ? ` · ${queue.reason}` : ''}`;
      if (els.queueStatus.textContent !== status) els.queueStatus.textContent = status;
    }
    const showPages = active && queue.pages > 0;
    els.currentDocument.textContent = active && queue.title
      ? `${queue.title}${showPages ? ` · ${queue.page} of ${queue.pages} pages saved` : ''}` : '';
    els.pageProgress.classList.toggle('hidden', !showPages);
    if (showPages) {
      els.pageProgress.max = queue.pages;
      els.pageProgress.value = queue.page;
    }
    refreshStorage();
  }
  function onOfflineChange() {
    renderOfflinePanel();
    const key = JSON.stringify([
      navigator.onLine, offlineControlsLocked(),
      state.protocols.map(protocol => {
        const { available, partial, legacy, legacyReadable, queued, updateStatus, updateable } = documentStatus(protocol);
        return [available, partial, legacy, legacyReadable, queued, updateStatus, updateable];
      })
    ]);
    if (key === state.offlineRenderKey) return;
    state.offlineRenderKey = key;
    render();
  }
  function openProtocolViewer(protocol) {
    saveReturnState(protocol);
    const params = new URLSearchParams({ file: protocol.file, title: `${protocol.id} ${protocol.title}` });
    const status = documentStatus(protocol);
    const indexedVersion = state.searchIndex.get(protocol.id)?.pdfVersion;
    if (status.available ? status.version === indexedVersion : navigator.onLine) {
      const page = state.resultMeta.get(protocol.id)?.reasons?.find(r => r.pages?.length)?.pages?.[0];
      if (page) {
        params.set('page', page);
        if (indexedVersion) params.set('pageVersion', indexedVersion);
      }
    }
    window.location.href = `/act-protocols/viewer#${params.toString()}`;
  }
  async function runOfflineAction(action, protocols) {
    if (!state.offlineReady || state.busyAction) return;
    if (action === 'remove-all' && !window.confirm('Remove all saved ACT protocol documents from this device?')) return;
    state.busyAction = action;
    els.offlineMessage.textContent = '';
    onOfflineChange();
    try {
      switch (action) {
        case 'save':
        case 'save-all':
        case 'update':
        case 'update-all':
          await offline.start(protocols, { update: action.startsWith('update') });
          break;
        case 'pause':
          await offline.pause();
          break;
        case 'resume':
          await offline.resume();
          break;
        case 'cancel':
          await offline.cancel();
          break;
        case 'check-updates': {
          const { updates } = await offline.checkUpdates();
          els.offlineMessage.textContent = updates ? `${updates} ${updates === 1 ? 'update' : 'updates'} available.` : 'No updates found for saved documents.';
          break;
        }
        case 'remove':
        case 'remove-all':
          await offline.remove(action === 'remove-all' ? null : protocols);
          els.offlineMessage.textContent = 'Offline copies removed.';
          break;
      }
    } catch (error) {
      els.offlineMessage.textContent = error.message || 'The offline operation could not finish.';
    } finally {
      state.busyAction = '';
      onOfflineChange();
    }
  }
  function handleListAction(event) {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const { action, id, category } = button.dataset;
    if (action === 'reset') {
      resetFilters();
      return;
    }
    if (action === 'toggle-category') {
      state.expandedCategory = state.expandedCategory === category ? '' : category;
      saveListState();
      render();
      return;
    }
    const scope = state.protocols.filter(p => id ? p.id === id : p.category === category);
    if (!scope.length) return;
    if (action === 'open') {
      openProtocolViewer(scope[0]);
    } else {
      els.panel.open = true;
      const summary = els.panel.querySelector('summary');
      summary.focus({ preventScroll: true });
      summary.scrollIntoView({ block: 'nearest' });
      runOfflineAction(action, scope);
    }
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
    const refreshOffline = () => {
      if (state.offlineReady) offline.refresh().catch(error => console.warn('[ACT Protocols] Could not refresh offline status', error));
    };
    updateThemeColor();
    preferredDark?.addEventListener?.('change', updateThemeColor);
    els.search.addEventListener('input', (e) => {
      const value = e.target.value;
      updateSuggestions(value);
      state.query = value;
      updateClearSearchButton();
      saveListState();
      render();
    });
    els.clearSearch?.addEventListener('click', clearSearch);
    els.search.addEventListener('keydown', (e) => {
      if (!state.suggestions.length && ['ArrowDown', 'ArrowUp'].includes(e.key)) updateSuggestions(els.search.value);
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
        e.preventDefault();
        closeSuggestions();
      }
    });
    els.suggestions?.addEventListener('mousedown', (e) => e.preventDefault());
    els.suggestions?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-index]');
      if (!btn) return;
      selectSuggestion(Number(btn.dataset.index));
    });
    const closeWhenOutside = (e) => {
      if (e.target === els.search || els.suggestions?.contains(e.target)) return;
      closeSuggestions();
    };
    document.addEventListener('click', closeWhenOutside);
    document.addEventListener('focusin', closeWhenOutside);
    els.reset.addEventListener('click', resetFilters);
    for (const input of els.filters) {
      input.addEventListener('change', () => {
        state.filters[input.dataset.filter] = input.value;
        if (input.dataset.filter === 'category' && input.value) state.expandedCategory = input.value;
        saveListState();
        render();
      });
    }
    els.grid.addEventListener('click', handleListAction);
    els.searchResults.addEventListener('click', handleListAction);
    els.panel.addEventListener('toggle', refreshStorage);
    els.panel.addEventListener('click', (e) => {
      const action = e.target.closest('[data-action]')?.dataset.action;
      if (action) runOfflineAction(action, state.protocols);
    });
    window.addEventListener('pageshow', (event) => {
      restoreProtocolListState(loadReturnState(), { restoreScroll: Boolean(event.persisted) });
      if (event.persisted) refreshOffline();
    });
    window.addEventListener('online', onOfflineChange);
    window.addEventListener('offline', onOfflineChange);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') refreshOffline();
    });
    setupInstallGuidance();
  }
  async function loadJson(url) {
    const response = await fetch(url, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`${url}: ${response.status}`);
    return response.json();
  }
  async function init() {
    applyDisplayModeClass();
    window.matchMedia?.('(display-mode: standalone)').addEventListener?.('change', applyDisplayModeClass);
    bind();
    const savedReturnState = loadReturnState();
    try {
      const [manifest, search, aliases, medicationMap] = await Promise.allSettled(
        [MANIFEST_URL, SEARCH_URL, ALIAS_URL, MEDICATION_MAP_URL].map(loadJson)
      );
      if (manifest.status !== 'fulfilled') throw manifest.reason;
      state.protocols = manifest.value;
      buildProtocolIdLookup();
      if (search.status === 'fulfilled') {
        state.searchReady = true;
        for (const record of search.value) {
          state.searchIndex.set(record.id, record);
          state.searchIndex.set(normalizeProtocolId(record.id), record);
        }
      } else {
        console.warn('[ACT Protocols] Search index unavailable; using metadata fallback', search.reason);
      }
      if (aliases.status === 'fulfilled') {
        state.aliases = aliases.value;
        buildAliasLookup();
      } else {
        console.warn('[ACT Protocols] Medication aliases unavailable', aliases.reason);
      }
      if (medicationMap.status === 'fulfilled') buildMedicationMap(medicationMap.value);
      else console.warn('[ACT Protocols] Medication protocol map unavailable', medicationMap.reason);

      const categoryInput = els.filters.find(input => input.dataset.filter === 'category');
      for (const category of CATEGORY_ORDER) categoryInput.add(new Option(category, category));
      applyRestoredFilters(savedReturnState);
      if (offline?.supported) {
        try {
          await offline.init();
          state.offlineReady = offline.supported;
          offline.subscribe(onOfflineChange);
          if (offline.queue().status === 'paused') els.panel.open = true;
        } catch (error) {
          console.warn('[ACT Protocols] Offline downloads unavailable', error);
        }
      }
      onOfflineChange();
      restoreScrollPosition(savedReturnState);
    } catch (error) {
      console.error('[ACT Protocols] Failed to load protocol manifest', error);
      els.total.textContent = 'Unable to load protocols.';
      els.grid.innerHTML = '<div class="error-state">Unable to load ACT protocols. Please try again when the app is online.</div>';
    }
  }
  document.addEventListener('DOMContentLoaded', init);
})();
