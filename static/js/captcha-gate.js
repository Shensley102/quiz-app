/* ============================================================
   Site-Wide Captcha Gate for Nurse Success Study Hub

   Behavior:
   - Reads the Turnstile site key from <meta name="turnstile-site-key">
   - If no site key configured → silently disabled (safe pre-deploy)
   - If navigator.onLine === false → skipped (offline users pass)
   - If localStorage flag 'sg:captcha-verified-at' < 24h old → skipped
   - Otherwise: injects an overlay covering the whole page, loads the
     Turnstile widget, and blocks all interaction until verified.

   The flag is cleared by pwa-utils.js when the service worker
   activates a new version (PWA install/update triggers re-verify).
   ============================================================ */

(function() {
  'use strict';

  var GATE_KEY     = 'sg:captcha-verified-at';
  var EXPIRY_MS    = 24 * 60 * 60 * 1000; // 24 hours

  // ----- Locate the site key -----------------------------------
  var meta    = document.querySelector('meta[name="turnstile-site-key"]');
  var siteKey = meta ? (meta.getAttribute('content') || '').trim() : '';

  // No key configured → gate is disabled. Bail silently.
  if (!siteKey) return;

  // ----- Verification status check ------------------------------
  function isVerified() {
    try {
      var ts = localStorage.getItem(GATE_KEY);
      if (!ts) return false;
      var verifiedAt = Date.parse(ts);
      if (isNaN(verifiedAt)) return false;
      return (Date.now() - verifiedAt) < EXPIRY_MS;
    } catch (e) {
      return false;
    }
  }

  function markVerified() {
    try {
      localStorage.setItem(GATE_KEY, new Date().toISOString());
    } catch (e) {
      console.warn('[CaptchaGate] localStorage write failed:', e);
    }
  }

  // Offline → no challenge needed.
  if (!navigator.onLine) {
    console.log('[CaptchaGate] Offline — skipping gate.');
    return;
  }

  // Already verified within 24h → done.
  if (isVerified()) {
    console.log('[CaptchaGate] Already verified within 24h — skipping gate.');
    return;
  }

  // ----- Inject CSS --------------------------------------------
  var STYLE_TEXT =
    '.captcha-gate{position:fixed;inset:0;background:rgba(15,23,42,0.78);' +
      '-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);' +
      'z-index:2147483647;display:flex;align-items:center;justify-content:center;' +
      'padding:20px;opacity:0;transition:opacity .25s ease;font-family:' +
      '"Open Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}' +
    '.captcha-gate.show{opacity:1}' +
    '.captcha-gate.hidden{display:none!important}' +
    '.captcha-card{background:#fff;border-radius:16px;padding:32px 28px;' +
      'max-width:400px;width:100%;text-align:center;' +
      'box-shadow:0 20px 60px rgba(0,0,0,.4);animation:captchaPop .3s ease}' +
    '@keyframes captchaPop{from{transform:scale(.92);opacity:0}' +
      'to{transform:scale(1);opacity:1}}' +
    '.captcha-card .captcha-logo{font-size:48px;margin-bottom:12px;line-height:1}' +
    '.captcha-card h2{margin:0 0 8px;color:#1a1a1a;font-size:22px;font-weight:800}' +
    '.captcha-card p{margin:0 0 24px;color:#666;font-size:14px;line-height:1.5}' +
    '.captcha-widget-container{display:flex;justify-content:center;' +
      'min-height:65px;margin-bottom:16px}' +
    '.captcha-status{font-size:13px;min-height:20px;color:#888;font-weight:500}' +
    '.captcha-status.error{color:#c62828}' +
    '.captcha-status.success{color:#2e7d32}' +
    '.captcha-status .spinner{display:inline-block;width:12px;height:12px;' +
      'border:2px solid #ddd;border-top-color:#2f61f3;border-radius:50%;' +
      'animation:captchaSpin .8s linear infinite;vertical-align:middle;margin-right:6px}' +
    '@keyframes captchaSpin{to{transform:rotate(360deg)}}' +
    'body.captcha-locked{overflow:hidden!important}';

  var styleEl = document.createElement('style');
  styleEl.setAttribute('data-captcha-gate', 'true');
  styleEl.textContent = STYLE_TEXT;
  (document.head || document.documentElement).appendChild(styleEl);

  // ----- Load Turnstile script if not present -------------------
  if (!document.querySelector('script[src*="challenges.cloudflare.com/turnstile"]')) {
    var s = document.createElement('script');
    s.src   = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
    s.async = true;
    s.defer = true;
    (document.head || document.documentElement).appendChild(s);
  }

  // ----- Build overlay element ---------------------------------
  var overlayEl = null;
  var statusEl  = null;

  function buildOverlay() {
    var overlay = document.createElement('div');
    overlay.id  = 'captchaGate';
    overlay.className = 'captcha-gate hidden';
    overlay.setAttribute('aria-hidden', 'true');

    var html = '' +
      '<div class="captcha-card" role="dialog" aria-label="Verification required">' +
        '<div class="captcha-logo">🩺</div>' +
        '<h2>Quick verification</h2>' +
        '<p>Please confirm you\'re not a bot to access the study hub. ' +
        'This only takes a moment.</p>' +
        '<div class="captcha-widget-container">' +
          '<div class="cf-turnstile" ' +
               'data-sitekey="' + siteKey.replace(/"/g, '&quot;') + '" ' +
               'data-callback="onCaptchaSuccess" ' +
               'data-error-callback="onCaptchaError" ' +
               'data-expired-callback="onCaptchaExpired" ' +
               'data-theme="light"></div>' +
        '</div>' +
        '<div class="captcha-status" id="captchaStatus">Waiting for verification…</div>' +
      '</div>';
    overlay.innerHTML = html;
    return overlay;
  }

  function showOverlay() {
    document.body.classList.add('captcha-locked');
    overlayEl.classList.remove('hidden');
    overlayEl.setAttribute('aria-hidden', 'false');
    // Force reflow so the opacity transition runs
    void overlayEl.offsetWidth;
    overlayEl.classList.add('show');
  }

  function hideOverlay() {
    if (!overlayEl) return;
    overlayEl.classList.remove('show');
    overlayEl.setAttribute('aria-hidden', 'true');
    setTimeout(function() {
      overlayEl.classList.add('hidden');
      document.body.classList.remove('captcha-locked');
    }, 250);
  }

  function setStatus(text, type, withSpinner) {
    if (!statusEl) return;
    statusEl.classList.remove('error', 'success');
    if (type) statusEl.classList.add(type);
    if (withSpinner) {
      statusEl.innerHTML = '<span class="spinner"></span>' + text;
    } else {
      statusEl.textContent = text;
    }
  }

  // ----- Turnstile callbacks (must be global) ------------------
  window.onCaptchaSuccess = function(token) {
    setStatus('Verifying…', null, true);

    fetch('/api/verify-captcha', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: token })
    })
    .then(function(r) {
      return r.json().then(function(j) { return { ok: r.ok, body: j }; });
    })
    .then(function(res) {
      if (res.ok && res.body && res.body.success) {
        setStatus('✓ Verified', 'success', false);
        markVerified();
        setTimeout(hideOverlay, 350);
      } else {
        var err = (res.body && res.body.error) ? res.body.error : 'verification failed';
        setStatus('Verification failed: ' + err + '. Please try again.', 'error', false);
        if (window.turnstile && typeof window.turnstile.reset === 'function') {
          try { window.turnstile.reset(); } catch (e) {}
        }
      }
    })
    .catch(function(err) {
      console.error('[CaptchaGate] Network error:', err);
      setStatus('Network error. Please check your connection and try again.', 'error', false);
      if (window.turnstile && typeof window.turnstile.reset === 'function') {
        try { window.turnstile.reset(); } catch (e) {}
      }
    });
  };

  window.onCaptchaError = function(errorCode) {
    console.warn('[CaptchaGate] Turnstile error:', errorCode);
    setStatus('Verification widget error. Please refresh the page.', 'error', false);
  };

  window.onCaptchaExpired = function() {
    setStatus('Verification expired — please complete it again.', null, false);
  };

  // ----- Insert overlay when DOM ready --------------------------
  function init() {
    overlayEl = buildOverlay();
    document.body.appendChild(overlayEl);
    statusEl = document.getElementById('captchaStatus');
    showOverlay();
    console.log('[CaptchaGate] Gate shown.');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
