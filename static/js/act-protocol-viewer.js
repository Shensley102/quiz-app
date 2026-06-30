(() => {
  const params = new URLSearchParams(window.location.hash.slice(1));
  const file = params.get('file');
  const title = params.get('title') || 'ACT Protocol PDF';
  const page = Number.parseInt(params.get('page') || '1', 10);
  const safeFilePattern = /^\/static\/protocols\/act\/.+\.pdf$/i;
  const zoomSteps = ['fit', 125, 150, 175, 200, 250, 300];

  const titleEl = document.getElementById('viewerTitle');
  const pagesEl = document.getElementById('pdfPages');
  const shell = document.querySelector('.pdf-viewer-shell');
  const error = document.getElementById('viewerError');
  const zoomOutBtn = document.getElementById('zoomOutBtn');
  const zoomInBtn = document.getElementById('zoomInBtn');
  const zoomLevel = document.getElementById('zoomLevel');
  let zoomIndex = 0;
  let pdfUrl = '';
  let pinchStartDistance = 0;
  let pinchStartZoomIndex = 0;
  const PINCH_STEP_PX = 42;

  titleEl.textContent = title;

  function showError(message = 'Unable to load this PDF. Return to the protocol list and try saving it offline again.') {
    error.textContent = message;
    error.classList.remove('hidden');
    pagesEl.classList.add('hidden');
    zoomOutBtn.disabled = true;
    zoomInBtn.disabled = true;
  }

  function updateZoomControls() {
    const zoom = zoomSteps[zoomIndex];
    zoomLevel.textContent = zoom === 'fit' ? 'Fit' : `${zoom}%`;
    zoomOutBtn.disabled = zoomIndex === 0;
    zoomInBtn.disabled = zoomIndex === zoomSteps.length - 1;
    pagesEl.style.width = zoom === 'fit' ? '100%' : `${zoom}%`;
  }

  function pageImageUrl(pageNumber) {
    const query = new URLSearchParams({ file, page: String(pageNumber), scale: '2' });
    return `/act-protocols/pdf-page?${query.toString()}`;
  }


  function touchDistance(touches) {
    const [first, second] = touches;
    return Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY);
  }

  function bindPinchZoom() {
    shell.addEventListener('touchstart', (event) => {
      if (event.touches.length !== 2) return;
      event.preventDefault();
      pinchStartDistance = touchDistance(event.touches);
      pinchStartZoomIndex = zoomIndex;
    }, { passive: false });

    shell.addEventListener('touchmove', (event) => {
      if (event.touches.length !== 2 || !pinchStartDistance) return;
      event.preventDefault();
      const delta = touchDistance(event.touches) - pinchStartDistance;
      const stepDelta = Math.trunc(delta / PINCH_STEP_PX);
      const nextZoomIndex = Math.min(zoomSteps.length - 1, Math.max(0, pinchStartZoomIndex + stepDelta));
      if (nextZoomIndex !== zoomIndex) {
        zoomIndex = nextZoomIndex;
        updateZoomControls();
      }
    }, { passive: false });

    shell.addEventListener('touchend', (event) => {
      if (event.touches.length < 2) {
        pinchStartDistance = 0;
        pinchStartZoomIndex = zoomIndex;
      }
    });
  }

  function scrollToRequestedPage() {
    const targetPage = Number.isFinite(page) && page > 0 ? page : 1;
    const target = pagesEl.querySelector(`[data-page="${targetPage}"]`);
    if (target) target.scrollIntoView({ block: 'start' });
  }

  async function renderPages() {
    const infoQuery = new URLSearchParams({ file });
    const response = await fetch(`/act-protocols/pdf-info?${infoQuery.toString()}`);
    if (!response.ok) throw new Error(`PDF info failed: ${response.status}`);
    const info = await response.json();
    const pageCount = Number(info.pageCount || 0);
    if (!pageCount) throw new Error('PDF has no pages.');

    pagesEl.innerHTML = '';
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      const pageWrap = document.createElement('figure');
      pageWrap.className = 'pdf-page-wrap';
      pageWrap.dataset.page = String(pageNumber);

      const img = document.createElement('img');
      img.className = 'pdf-page-image';
      img.src = pageImageUrl(pageNumber);
      img.alt = `${title} page ${pageNumber} of ${pageCount}`;
      img.loading = pageNumber === 1 ? 'eager' : 'lazy';
      img.decoding = 'async';

      const caption = document.createElement('figcaption');
      caption.className = 'pdf-page-caption';
      caption.textContent = `Page ${pageNumber} of ${pageCount}`;

      pageWrap.append(img, caption);
      pagesEl.append(pageWrap);
    }

    updateZoomControls();
    requestAnimationFrame(scrollToRequestedPage);
  }

  if (!file || !safeFilePattern.test(file)) {
    showError('Invalid ACT protocol PDF link. Return to the protocol list and try again.');
    return;
  }

  pdfUrl = encodeURI(file);

  bindPinchZoom();

  zoomOutBtn.addEventListener('click', () => {
    zoomIndex = Math.max(0, zoomIndex - 1);
    updateZoomControls();
  });

  zoomInBtn.addEventListener('click', () => {
    zoomIndex = Math.min(zoomSteps.length - 1, zoomIndex + 1);
    updateZoomControls();
  });

  renderPages().catch((err) => {
    console.error('[ACT Protocol Viewer] Failed to render PDF pages', err);
    showError();
  });

  if (navigator.serviceWorker?.controller) {
    navigator.serviceWorker.controller.postMessage({ type: 'CACHE_URLS', urls: [pdfUrl] });
  }
})();
