(() => {
  const params = new URLSearchParams(window.location.hash.slice(1));
  const file = params.get('file') || '';
  const title = params.get('title') || 'ACT Protocol PDF';
  const requestedPage = Number(params.get('page'));
  const requestedPageVersion = params.get('pageVersion');
  const zoomSteps = ['fit', 125, 150, 175, 200, 250, 300];
  const readingKey = `act-reading:${file}`;
  const bookmarkKey = `act-bookmarks:${file}`;
  const byId = (id) => document.getElementById(id);
  const pagesEl = byId('pdfPages');
  const shell = document.querySelector('.pdf-viewer-shell');
  const toolbar = byId('readerToolbar');
  const error = byId('viewerError');
  const zoomOutBtn = byId('zoomOutBtn');
  const zoomInBtn = byId('zoomInBtn');
  const previousPage = byId('previousPage');
  const nextPage = byId('nextPage');
  const pageNumber = byId('pageNumber');
  const bookmarkPage = byId('bookmarkPage');
  const findStatus = byId('findStatus');
  const findResults = byId('findResults');
  const bookmarkStatus = byId('bookmarkStatus');
  const bookmarkList = byId('bookmarkedPages');
  const findPanel = { element: byId('readerFind'), opener: byId('openFind'), focus: byId('findQuery') };
  const bookmarkPanel = { element: byId('readerBookmarks'), opener: byId('openBookmarks'), focus: bookmarkPage };

  let activeDocument;
  let pageCount = 0;
  let currentPage = 1;
  let zoomIndex = 0;
  let pinchStartDistance = 0;
  let pinchStartZoomIndex = 0;
  let positionTimer;
  let scrollFrame;
  let lastJumpPosition;
  let activePanel;
  let pageObserver;
  let findRequest = 0;
  let textPromise;
  let discarded = false;
  const figures = [];
  const imageUrls = new Set();

  byId('viewerTitle').textContent = title;
  document.title = `${title} | ACT Protocols`;
  byId('pdfBackButton').addEventListener('click', (event) => {
    if (window.history.length <= 1) return;
    event.preventDefault();
    window.history.back();
  });

  function showError(message) {
    byId('viewerLoading').hidden = true;
    error.textContent = message;
    error.classList.remove('hidden');
    pagesEl.classList.add('hidden');
    toolbar.hidden = true;
    zoomOutBtn.disabled = true;
    zoomInBtn.disabled = true;
  }

  function readSaved(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key)) ?? fallback;
    } catch {
      return fallback;
    }
  }

  function writeSaved(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }

  function readBookmarks() {
    const entries = readSaved(bookmarkKey, []);
    if (!Array.isArray(entries)) return [];
    return entries.filter((item) => Number.isInteger(item?.page) && item.page > 0 && typeof item.version === 'string');
  }

  function topInShell(element) {
    return element.getBoundingClientRect().top - shell.getBoundingClientRect().top + shell.scrollTop;
  }

  function readingFraction() {
    const figure = figures[currentPage - 1];
    if (!figure?.offsetHeight) return 0;
    return Math.min(0.95, Math.max(0, (shell.scrollTop - topInShell(figure)) / figure.offsetHeight));
  }

  function savePosition() {
    clearTimeout(positionTimer);
    if (pageCount) {
      writeSaved(readingKey, { page: currentPage, fraction: readingFraction(), version: activeDocument.version });
    }
  }

  function queuePositionSave() {
    clearTimeout(positionTimer);
    positionTimer = setTimeout(savePosition, 250);
  }

  function updateBookmarkButton() {
    const saved = readBookmarks().some((item) => item.page === currentPage && item.version === activeDocument.version);
    bookmarkPage.textContent = saved ? `Remove bookmark for page ${currentPage}` : `Bookmark page ${currentPage}`;
    bookmarkPage.setAttribute('aria-pressed', String(saved));
  }

  function setCurrentPage(page) {
    currentPage = page;
    byId('currentPage').textContent = `Page ${page} of ${pageCount}`;
    previousPage.disabled = page === 1;
    nextPage.disabled = page === pageCount;
    if (document.activeElement !== pageNumber) pageNumber.value = page;
    if (activePanel === bookmarkPanel) updateBookmarkButton();
  }

  function jumpToPage(page, fraction = 0) {
    const target = figures[page - 1];
    if (!target) return;
    shell.scrollTop = topInShell(target) + target.offsetHeight * fraction;
    lastJumpPosition = shell.scrollTop;
    setCurrentPage(page);
    queuePositionSave();
  }

  function pageAtScrollPosition() {
    if (shell.scrollTop > 0 && shell.scrollTop >= shell.scrollHeight - shell.clientHeight - 1) return pageCount;
    const marker = shell.getBoundingClientRect().top + Math.min(80, shell.clientHeight * 0.15);
    let first = 0;
    let last = figures.length - 1;
    while (first < last) {
      const middle = Math.ceil((first + last) / 2);
      if (figures[middle].getBoundingClientRect().top <= marker) {
        first = middle;
      } else {
        last = middle - 1;
      }
    }
    return first + 1;
  }

  shell.addEventListener('scroll', () => {
    if (!pageCount || scrollFrame) return;
    scrollFrame = requestAnimationFrame(() => {
      scrollFrame = null;
      if (shell.scrollTop === lastJumpPosition) return;
      lastJumpPosition = undefined;
      const page = pageAtScrollPosition();
      if (page !== currentPage) setCurrentPage(page);
      queuePositionSave();
    });
  }, { passive: true });

  function updateZoomControls() {
    const zoom = zoomSteps[zoomIndex];
    byId('zoomLevel').textContent = zoom === 'fit' ? 'Fit' : `${zoom}%`;
    zoomOutBtn.disabled = !pageCount || zoomIndex === 0;
    zoomInBtn.disabled = !pageCount || zoomIndex === zoomSteps.length - 1;
    pagesEl.style.width = zoom === 'fit' ? '100%' : `${zoom}%`;
  }

  function changeZoom(index) {
    const nextIndex = Math.min(zoomSteps.length - 1, Math.max(0, index));
    if (!pageCount || nextIndex === zoomIndex) return;
    const fraction = readingFraction();
    zoomIndex = nextIndex;
    updateZoomControls();
    jumpToPage(currentPage, fraction);
  }

  function touchDistance([first, second]) {
    return Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY);
  }

  shell.addEventListener('touchstart', (event) => {
    if (!pageCount || event.touches.length !== 2) return;
    event.preventDefault();
    pinchStartDistance = touchDistance(event.touches);
    pinchStartZoomIndex = zoomIndex;
  }, { passive: false });

  shell.addEventListener('touchmove', (event) => {
    if (event.touches.length !== 2 || !pinchStartDistance) return;
    event.preventDefault();
    const delta = touchDistance(event.touches) - pinchStartDistance;
    changeZoom(pinchStartZoomIndex + Math.trunc(delta / 42));
  }, { passive: false });

  function stopPinch(event) {
    if (event.touches.length < 2) pinchStartDistance = 0;
  }

  shell.addEventListener('touchend', stopPinch);
  shell.addEventListener('touchcancel', stopPinch);
  zoomOutBtn.addEventListener('click', () => changeZoom(zoomIndex - 1));
  zoomInBtn.addEventListener('click', () => changeZoom(zoomIndex + 1));
  previousPage.addEventListener('click', () => jumpToPage(currentPage - 1));
  nextPage.addEventListener('click', () => jumpToPage(currentPage + 1));
  byId('goToPage').addEventListener('submit', (event) => {
    event.preventDefault();
    jumpToPage(pageNumber.valueAsNumber);
  });

  function setPanel(panel) {
    if (activePanel) {
      activePanel.element.hidden = true;
      activePanel.opener.setAttribute('aria-expanded', 'false');
      if (!panel) activePanel.opener.focus();
    }
    activePanel = panel;
    if (panel) {
      panel.element.hidden = false;
      panel.opener.setAttribute('aria-expanded', 'true');
      if (panel === bookmarkPanel) renderBookmarks();
      panel.focus.focus();
    }
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && activePanel) setPanel(null);
  });
  findPanel.opener.addEventListener('click', () => setPanel(activePanel === findPanel ? null : findPanel));
  bookmarkPanel.opener.addEventListener('click', () => setPanel(activePanel === bookmarkPanel ? null : bookmarkPanel));
  byId('closeFind').addEventListener('click', () => setPanel(null));
  byId('closeBookmarks').addEventListener('click', () => setPanel(null));

  function button(label, action) {
    const control = document.createElement('button');
    control.type = 'button';
    control.textContent = label;
    control.addEventListener('click', action);
    return control;
  }

  function updateBookmarks(entries, successMessage) {
    if (writeSaved(bookmarkKey, entries)) {
      renderBookmarks();
      bookmarkStatus.textContent = successMessage;
      bookmarkPage.focus();
      return;
    }
    bookmarkStatus.textContent = 'Bookmarks could not be saved on this device.';
  }

  function revealPage(page) {
    jumpToPage(page);
    shell.focus({ preventScroll: true });
  }

  function renderBookmarks() {
    const entries = readBookmarks();
    updateBookmarkButton();
    bookmarkStatus.textContent = entries.length ? '' : 'No bookmarks yet.';
    bookmarkList.replaceChildren();
    for (const item of entries.sort((a, b) => a.page - b.page)) {
      const oldVersion = item.version !== activeDocument.version;
      const pageLabel = `Page ${item.page}`;
      const row = document.createElement('li');
      const open = button(oldVersion ? `Review page ${item.page}` : pageLabel, () => revealPage(item.page));
      open.disabled = item.page > pageCount;
      row.append(open);
      if (oldVersion) {
        const notice = document.createElement('span');
        notice.className = 'reader-bookmark-warning';
        notice.textContent = item.page > pageCount ? `${pageLabel} is missing in this version` : 'From an older version';
        row.append(notice);
        if (item.page <= pageCount) {
          row.append(button('Keep on this version', () => {
            const other = readBookmarks().filter((entry) => entry.page !== item.page ||
              (entry.version !== item.version && entry.version !== activeDocument.version));
            other.push({ page: item.page, version: activeDocument.version });
            updateBookmarks(other, `${pageLabel} bookmark reviewed.`);
          }));
        }
      }
      const remove = button('Remove', () => {
        const kept = readBookmarks().filter((entry) => entry.page !== item.page || entry.version !== item.version);
        updateBookmarks(kept, `${pageLabel} bookmark removed.`);
      });
      remove.setAttribute('aria-label', `Remove page ${item.page} bookmark${oldVersion ? ' from older version' : ''}`);
      row.append(remove);
      bookmarkList.append(row);
    }
  }

  bookmarkPage.addEventListener('click', () => {
    const entries = readBookmarks();
    const index = entries.findIndex((item) => item.page === currentPage && item.version === activeDocument.version);
    if (index >= 0) {
      entries.splice(index, 1);
      updateBookmarks(entries, `Page ${currentPage} bookmark removed.`);
    } else {
      entries.push({ page: currentPage, version: activeDocument.version });
      updateBookmarks(entries, `Page ${currentPage} bookmarked.`);
    }
  });

  function normalizeText(text) {
    return text.normalize('NFKC').replace(/\s+/g, ' ').trim();
  }

  function loadPageText() {
    if (!textPromise) {
      textPromise = activeDocument.getText().then((pages) => pages
        .filter((page) => page.page >= 1 && page.page <= pageCount && typeof page.text === 'string')
        .map((page) => ({ page: page.page, text: normalizeText(page.text) }))
        .filter((page) => page.text));
      textPromise.catch(() => { textPromise = null; });
    }
    return textPromise;
  }

  byId('findForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const request = ++findRequest;
    const query = normalizeText(findPanel.focus.value).toLowerCase();
    findResults.replaceChildren();
    if (!query) {
      findStatus.textContent = 'Enter a word or phrase to find.';
      return;
    }
    findStatus.textContent = 'Searching…';
    let pages;
    try {
      pages = await loadPageText();
    } catch {
      if (request === findRequest) findStatus.textContent = 'Document text could not be loaded. Try again.';
      return;
    }
    if (request !== findRequest) return;
    if (!pages.length) {
      findStatus.textContent = 'Text search is unavailable for this copy.';
      return;
    }
    for (const { page, text } of pages) {
      const index = text.toLowerCase().indexOf(query);
      if (index < 0) continue;
      const start = Math.max(0, index - 48);
      const end = index + query.length + 64;
      const excerpt = document.createElement('span');
      excerpt.textContent = `${start ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`;
      const result = button(`Page ${page}`, () => revealPage(page));
      result.className = 'reader-snippet';
      result.append(excerpt);
      const row = document.createElement('li');
      row.append(result);
      findResults.append(row);
    }
    const matches = findResults.childElementCount;
    findStatus.textContent = matches ? `${matches} matching ${matches === 1 ? 'page' : 'pages'}` : 'No matching pages.';
  });

  function releaseImageUrl(url) {
    if (imageUrls.delete(url)) URL.revokeObjectURL(url);
  }

  async function renderPageImage(frame, page) {
    let url;
    try {
      url = await activeDocument.getPageUrl(page);
      if (url.startsWith('blob:')) imageUrls.add(url);
      if (discarded) {
        releaseImageUrl(url);
        return;
      }
      const image = document.createElement('img');
      image.className = 'pdf-page-image';
      image.alt = `${title} page ${page} of ${pageCount}`;
      image.decoding = 'async';
      await new Promise((resolve, reject) => {
        image.addEventListener('load', resolve, { once: true });
        image.addEventListener('error', reject, { once: true });
        frame.replaceChildren(image);
        image.src = url;
      });
      if (!frame.style.getPropertyValue('--page-ratio') && image.naturalHeight) {
        frame.style.setProperty('--page-ratio', image.naturalWidth / image.naturalHeight);
      }
    } catch {
      if (discarded) return;
      const message = document.createElement('div');
      message.className = 'reader-page-error';
      const text = document.createElement('p');
      text.textContent = `Page ${page} could not load. Retry or reopen the document.`;
      const retry = button(`Retry page ${page}`, () => {
        message.remove();
        renderPageImage(frame, page);
      });
      message.append(text, retry);
      frame.replaceChildren(message);
    } finally {
      releaseImageUrl(url);
    }
  }

  function renderPages(dimensions) {
    const fragment = document.createDocumentFragment();
    if ('IntersectionObserver' in window) {
      pageObserver = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const frame = entry.target;
          pageObserver.unobserve(frame);
          renderPageImage(frame, Number(frame.dataset.page));
        }
      }, { root: shell, rootMargin: '320px 0px' });
    }
    for (let page = 1; page <= pageCount; page += 1) {
      const figure = document.createElement('figure');
      figure.className = 'pdf-page-wrap';
      const frame = document.createElement('div');
      frame.className = 'reader-page-frame';
      frame.dataset.page = page;
      const size = dimensions?.[page - 1];
      if (size?.width > 0 && size?.height > 0) frame.style.setProperty('--page-ratio', size.width / size.height);
      const caption = document.createElement('figcaption');
      caption.className = 'pdf-page-caption';
      caption.textContent = `Page ${page} of ${pageCount}`;
      figure.append(frame, caption);
      fragment.append(figure);
      figures.push(figure);
      if (pageObserver) pageObserver.observe(frame);
      else renderPageImage(frame, page);
    }
    pagesEl.replaceChildren(fragment);
  }

  window.addEventListener('pagehide', () => {
    savePosition();
    discarded = true;
    activeDocument?.close();
    pageObserver?.disconnect();
    imageUrls.forEach(releaseImageUrl);
  });

  window.addEventListener('pageshow', (event) => {
    if (event.persisted && discarded) window.location.reload();
  });

  function updateOfflineIndicator() {
    byId('offlineIndicator').classList.toggle('hidden', navigator.onLine);
  }
  window.addEventListener('online', updateOfflineIndicator);
  window.addEventListener('offline', updateOfflineIndicator);
  updateOfflineIndicator();

  async function openReader() {
    if (!/^\/static\/protocols\/act\/.+\.pdf$/i.test(file)) {
      showError('Invalid ACT protocol link. Return to the protocol list to choose a document.');
      return;
    }

    updateZoomControls();
    try {
      activeDocument = await window.ACTOffline.openDocument(file);
      if (discarded) {
        activeDocument.close();
        return;
      }
      const count = Number(activeDocument.info.pageCount);
      if (!Number.isSafeInteger(count) || count <= 0) throw new Error('PDF has no pages.');
      pageCount = count;
      pageNumber.max = pageCount;
      byId('viewerLoading').hidden = true;
      renderPages(activeDocument.info.pageSizes || activeDocument.info.dimensions);
      toolbar.hidden = false;
      updateZoomControls();

      const position = readSaved(readingKey, {});
      const isReload = window.performance.getEntriesByType('navigation')[0]?.type === 'reload';
      const versionMatches = !requestedPageVersion || requestedPageVersion === activeDocument.version;
      const explicitPage = versionMatches && Number.isSafeInteger(requestedPage) &&
        requestedPage > 0 && (!isReload || !position.page);
      const savedPage = Number.isSafeInteger(position.page) && position.page > 0 ? position.page : 1;
      const startPage = Math.min(pageCount, explicitPage ? requestedPage : savedPage);
      const fraction = !explicitPage && position.version === activeDocument.version ? Number(position.fraction) : 0;
      jumpToPage(startPage, fraction >= 0 && fraction <= 0.95 ? fraction : 0);
    } catch (err) {
      console.error('[ACT Protocol Viewer] Failed to open the document', err);
      showError('Unable to load this PDF. Reconnect or choose a document available offline.');
    }
  }

  openReader();
})();
