/* ============================================================
   PWA Utilities for Nurse Success Study Hub
   
   Features:
   - Service Worker registration and updates
   - Automatic cache refresh on startup
   - Periodic update checks
   - Offline detection
   - Update notifications
   - Motivational quotes for home page
   - Content protection (copy/paste prevention)
   ============================================================ */

(function() {
  'use strict';

  const CONFIG = {
    UPDATE_CHECK_INTERVAL: 30 * 60 * 1000,
    CACHE_REFRESH_ON_START: true,
    SHOW_UPDATE_BANNER: true,
    DEBUG: false
  };

  function log(...args) {
    if (CONFIG.DEBUG) {
      console.log('[PWA Utils]', ...args);
    }
  }

  // ============================================================
  // CONTENT PROTECTION
  // ============================================================

  function setupContentProtection() {
    document.addEventListener('contextmenu', function(e) {
      e.preventDefault();
      return false;
    });

    document.addEventListener('selectstart', function(e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        return true;
      }
      e.preventDefault();
      return false;
    });

    document.addEventListener('copy', function(e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        return true;
      }
      e.preventDefault();
      return false;
    });

    document.addEventListener('cut', function(e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        return true;
      }
      e.preventDefault();
      return false;
    });

    document.addEventListener('dragstart', function(e) {
      e.preventDefault();
      return false;
    });

    document.addEventListener('keydown', function(e) {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key.toLowerCase()) {
          case 'c':
          case 'x':
          case 'a':
          case 'p':
          case 's':
            if ((e.key.toLowerCase() === 'c' || e.key.toLowerCase() === 'x' || e.key.toLowerCase() === 'a') &&
                (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) {
              return true;
            }
            e.preventDefault();
            return false;
          case 'u':
            e.preventDefault();
            return false;
        }
      }
      if (e.key === 'PrintScreen') {
        e.preventDefault();
        return false;
      }
    });

    log('Content protection enabled');
  }

  // ============================================================
  // SERVICE WORKER MANAGEMENT
  // ============================================================

  let swRegistration = null;
  let updateCheckInterval = null;
  let refreshing = false;

  async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) {
      log('Service workers not supported');
      return null;
    }

    try {
      swRegistration = await navigator.serviceWorker.register('/service-worker.js', {
        scope: '/'
      });

      log('Service Worker registered:', swRegistration.scope);

      swRegistration.addEventListener('updatefound', () => {
        log('Service Worker update found');
        const newWorker = swRegistration.installing;
        
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            log('New Service Worker installed, prompting user');
            if (window.confirm('A new version is available. Reload to update?')) {
              newWorker.postMessage({ type: 'SKIP_WAITING' });
            }
          }
        });
      });

      navigator.serviceWorker.addEventListener('message', handleSWMessage);

      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (refreshing) return;
        refreshing = true;
        log('Controller changed, reloading page');
        window.location.reload();
      });

      startPeriodicUpdateChecks();

      if (CONFIG.CACHE_REFRESH_ON_START) {
        setTimeout(() => {
          refreshCacheOnStartup();
        }, 2000);
      }

      return swRegistration;
    } catch (error) {
      console.error('Service Worker registration failed:', error);
      return null;
    }
  }

  function handleSWMessage(event) {
    const { data } = event;
    log('Message from SW:', data);

    switch (data.type) {
      case 'SW_ACTIVATED':
        log('Service Worker activated, version:', data.version);
        updatePWAStatus(`PWA v${data.version} active`);
        setTimeout(refreshCacheOnStartup, 1000);
        break;

      case 'UPDATE_AVAILABLE':
        log('Update available:', data.newVersion);
        showUpdateBanner(data.newVersion);
        break;

      case 'CACHE_UPDATED':
        log('Cache updated:', data.stats);
        if (data.stats && data.stats.updated > 0) {
          updatePWAStatus(`Cache updated: ${data.stats.updated} files`);
        } else {
          updatePWAStatus('Cache is up to date');
        }
        hideRefreshingIndicator();
        break;

      default:
        log('Unknown message type:', data.type);
    }
  }

  async function refreshCacheOnStartup() {
    if (!navigator.serviceWorker.controller) {
      log('No active service worker, skipping cache refresh');
      return;
    }

    log('Requesting cache refresh on startup');
    showRefreshingIndicator();

    try {
      navigator.serviceWorker.controller.postMessage({
        type: 'FORCE_UPDATE'
      });
    } catch (error) {
      log('Cache refresh request failed:', error);
      updatePWAStatus('Cache refresh could not be started');
      hideRefreshingIndicator();
    }
  }

  function startPeriodicUpdateChecks() {
    if (updateCheckInterval) {
      clearInterval(updateCheckInterval);
    }

    updateCheckInterval = setInterval(() => {
      checkForUpdates();
    }, CONFIG.UPDATE_CHECK_INTERVAL);

    log('Periodic update checks started');
  }

  async function checkForUpdates() {
    if (!swRegistration) return;

    try {
      log('Checking for updates...');
      await swRegistration.update();
      
      if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: 'CHECK_UPDATE'
        });
      }
    } catch (error) {
      log('Update check failed:', error);
    }
  }

  function forceUpdate() {
    if (!swRegistration || !swRegistration.waiting) {
      window.location.reload();
      return;
    }

    log('Forcing service worker update');
    swRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
  }

  // ============================================================
  // UI ELEMENTS
  // ============================================================

  function showUpdateBanner(newVersion) {
    if (!CONFIG.SHOW_UPDATE_BANNER) return;

    const existingBanner = document.querySelector('.update-banner');
    if (existingBanner) {
      existingBanner.remove();
    }

    const banner = document.createElement('div');
    banner.className = 'update-banner';
    banner.innerHTML = `
      <span class="update-icon">🔄</span>
      <span class="update-message">A new version${newVersion ? ' (' + newVersion + ')' : ''} is available!</span>
      <button class="update-btn" onclick="window.PWAUtils.forceUpdate()">Update Now</button>
      <button class="update-dismiss" onclick="this.parentElement.classList.add('hidden')">×</button>
    `;

    document.body.appendChild(banner);

    requestAnimationFrame(() => {
      banner.classList.add('show');
    });
  }

  function showRefreshingIndicator() {
    const status = document.getElementById('pwaStatus');
    if (status) {
      status.textContent = 'Updating cache...';
      status.style.opacity = '1';
    }
  }

  function hideRefreshingIndicator() {
    const status = document.getElementById('pwaStatus');
    if (status) {
      status.style.opacity = '1';
      setTimeout(() => {
        status.style.opacity = '0.7';
      }, 2000);
    }
  }

  function updatePWAStatus(text) {
    const status = document.getElementById('pwaStatus');
    if (status) {
      status.textContent = text;
    }
  }

  // ============================================================
  // OFFLINE DETECTION
  // ============================================================

  function setupOfflineDetection() {
    const offlineIndicator = document.getElementById('offlineIndicator');
    
    function updateOnlineStatus() {
      if (navigator.onLine) {
        if (offlineIndicator) {
          offlineIndicator.classList.add('hidden');
        }
        log('Online');
        
        if (CONFIG.CACHE_REFRESH_ON_START && navigator.serviceWorker.controller) {
          setTimeout(refreshCacheOnStartup, 1000);
        }
      } else {
        if (offlineIndicator) {
          offlineIndicator.classList.remove('hidden');
        }
        log('Offline');
      }
    }

    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);

    updateOnlineStatus();
  }

  // ============================================================
  // MOTIVATIONAL QUOTES (for home page)
  // ============================================================

  const NURSING_QUOTES = [
    { text: "Nurses dispense comfort, compassion, and caring without even a prescription.", author: "Val Saintsbury" },
    { text: "To do what nobody else will do, in a way that nobody else can, in spite of all we go through; that is to be a nurse.", author: "Rawsi Williams" },
    { text: "Nursing is not for everyone. It takes a very strong, intelligent, and compassionate person to take on the ills of the world with passion and purpose.", author: "Donna Wilk Cardillo" },
    { text: "The trained nurse has become one of the great blessings of humanity.", author: "William Osler" },
    { text: "When you're a nurse, you know that every day you will touch a life or a life will touch yours.", author: "Unknown" },
    { text: "Nursing is an art, and if it is to be made an art, it requires as exclusive a devotion, as hard a preparation, as any painter's or sculptor's work.", author: "Florence Nightingale" },
    { text: "Save one life, you're a hero. Save a hundred lives, you're a nurse.", author: "Unknown" },
    { text: "Caring is the essence of nursing.", author: "Jean Watson" },
    { text: "Every nurse was drawn to nursing because of a desire to care, to serve, or to help.", author: "Christina Feist-Heilmeier" },
    { text: "A nurse is not what you do. It is what you are.", author: "Unknown" },
    { text: "Nurses are the heart of healthcare.", author: "Donna Wilk Cardillo" },
    { text: "Be the nurse you would want as a patient.", author: "Unknown" },
    { text: "The character of a nurse is as important as the knowledge they possess.", author: "Carolyn Jarvis" },
    { text: "Hardships often prepare ordinary people for an extraordinary destiny.", author: "C.S. Lewis" },
    { text: "Success is not final, failure is not fatal: it is the courage to continue that counts.", author: "Winston Churchill" }
  ];

  function displayRandomQuote() {
    const container = document.getElementById('quote-container');
    if (!container) return;

    const quote = NURSING_QUOTES[Math.floor(Math.random() * NURSING_QUOTES.length)];
    
    container.innerHTML = `
      <div class="quote-wrapper">
        <div class="quote-icon">💬</div>
        <p class="quote-text">"${quote.text}"</p>
        <span class="quote-author">— ${quote.author}</span>
      </div>
    `;
  }

  // ============================================================
  // INITIALIZATION
  // ============================================================

  function init() {
    log('Initializing PWA Utils');

    setupContentProtection();
    registerServiceWorker();
    setupOfflineDetection();

    if (document.getElementById('quote-container')) {
      displayRandomQuote();
    }

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        log('Page visible, checking for updates');
        checkForUpdates();
      }
    });

    window.addEventListener('pageshow', (event) => {
      if (event.persisted) {
        log('Page restored from cache, refreshing');
        checkForUpdates();
      }
    });

    log('PWA Utils initialized');
  }

  window.PWAUtils = {
    forceUpdate,
    checkForUpdates,
    refreshCache: refreshCacheOnStartup,
    getRegistration: () => swRegistration
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
