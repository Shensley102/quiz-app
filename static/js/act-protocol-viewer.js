(() => {
  const params = new URLSearchParams(window.location.hash.slice(1));
  const file = params.get('file');
  const title = params.get('title') || 'ACT Protocol PDF';
  const page = params.get('page');
  const safeFilePattern = /^\/static\/protocols\/act\/.+\.pdf$/i;
  const zoomSteps = ['page-width', 125, 150, 175, 200, 250, 300];

  const titleEl = document.getElementById('viewerTitle');
  const frame = document.getElementById('pdfFrame');
  const error = document.getElementById('viewerError');
  const zoomOutBtn = document.getElementById('zoomOutBtn');
  const zoomInBtn = document.getElementById('zoomInBtn');
  const zoomLevel = document.getElementById('zoomLevel');
  let zoomIndex = 0;
  let pdfUrl = '';

  titleEl.textContent = title;

  function pageFragment() {
    return page ? `page=${encodeURIComponent(page)}` : '';
  }

  function zoomFragment() {
    const zoom = zoomSteps[zoomIndex];
    return zoom === 'page-width' ? 'zoom=page-width' : `zoom=${zoom}`;
  }

  function updateZoomControls() {
    const zoom = zoomSteps[zoomIndex];
    zoomLevel.textContent = zoom === 'page-width' ? 'Fit' : `${zoom}%`;
    zoomOutBtn.disabled = zoomIndex === 0;
    zoomInBtn.disabled = zoomIndex === zoomSteps.length - 1;
  }

  function renderPdf() {
    const parts = [pageFragment(), zoomFragment(), 'view=FitH', 'toolbar=0', 'navpanes=0'].filter(Boolean);
    frame.src = `${pdfUrl}#${parts.join('&')}`;
    updateZoomControls();
  }

  if (!file || !safeFilePattern.test(file)) {
    error.classList.remove('hidden');
    frame.classList.add('hidden');
    zoomOutBtn.disabled = true;
    zoomInBtn.disabled = true;
    return;
  }

  pdfUrl = encodeURI(file);
  renderPdf();

  zoomOutBtn.addEventListener('click', () => {
    zoomIndex = Math.max(0, zoomIndex - 1);
    renderPdf();
  });

  zoomInBtn.addEventListener('click', () => {
    zoomIndex = Math.min(zoomSteps.length - 1, zoomIndex + 1);
    renderPdf();
  });

  if (navigator.serviceWorker?.controller) {
    navigator.serviceWorker.controller.postMessage({ type: 'CACHE_URLS', urls: [pdfUrl] });
  }
})();
