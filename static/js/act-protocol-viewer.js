(() => {
  const params = new URLSearchParams(window.location.hash.slice(1));
  const file = params.get('file');
  const title = params.get('title') || 'ACT Protocol PDF';
  const safeFilePattern = /^\/static\/protocols\/act\/.+\.pdf$/i;

  const titleEl = document.getElementById('viewerTitle');
  const frame = document.getElementById('pdfFrame');
  const error = document.getElementById('viewerError');
  const openNativeLink = document.getElementById('openNativeLink');

  titleEl.textContent = title;

  if (!file || !safeFilePattern.test(file)) {
    error.classList.remove('hidden');
    frame.classList.add('hidden');
    openNativeLink.href = '/act-protocols';
    return;
  }

  const pdfUrl = encodeURI(file);
  frame.src = pdfUrl;
  openNativeLink.href = pdfUrl;

  if (navigator.serviceWorker?.controller) {
    navigator.serviceWorker.controller.postMessage({ type: 'CACHE_URLS', urls: [pdfUrl] });
  }
})();
