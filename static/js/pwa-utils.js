/* ============================================================
   PWA Utilities - Nurse Success Study Hub
   
   Features:
   - Motivational quotes rotation
   - Service Worker registration with proper scope
   - Update notification system
   - Offline/online status detection
   
   QUOTES LOCATION: Edit the QUOTES array below to change/add quotes
   ============================================================ */

// Motivational quotes array - edit this to change quotes
const QUOTES = [
  {
    text: "Develop a passion for learning. If you do, you will never cease to grow.",
    author: "Anthony J. D'Angelo"
  },
  {
    text: "The mind is not a vessel to be filled but a fire to be ignited.",
    author: "Plutarch"
  },
  {
    text: "The illiterate of the 21st century will not be those who cannot read and write, but those who cannot learn, unlearn, and relearn.",
    author: "Alvin Toffler"
  },
  {
    text: "The great aim of education is not knowledge but action.",
    author: "Herbert Spencer"
  },
  {
    text: "There are no shortcuts to any place worth going.",
    author: "Beverly Sills"
  },
  {
    text: "Motivation is what gets you started. Habit is what keeps you going.",
    author: "Jim Ryun"
  },
  {
    text: "The beautiful thing about learning is that no one can take it away from you.",
    author: "B.B. King"
  },
  {
    text: "Education is hanging around until you've caught on.",
    author: "Robert Frost"
  }
];

// Storage key for tracking last shown quote
const LAST_QUOTE_KEY = 'nurse-study-last-quote-index';

/**
 * Get a random quote, avoiding the last shown one
 * @returns {Object} Quote object with text and author
 */
function getRandomQuote() {
  const lastIndex = parseInt(localStorage.getItem(LAST_QUOTE_KEY) || '-1', 10);
  let newIndex;
  
  // Pick a random index different from the last one
  do {
    newIndex = Math.floor(Math.random() * QUOTES.length);
  } while (newIndex === lastIndex && QUOTES.length > 1);
  
  // Save the new index
  localStorage.setItem(LAST_QUOTE_KEY, newIndex.toString());
  
  return QUOTES[newIndex];
}

/**
 * Display a quote in the specified container
 * @param {string} containerId - ID of the container element
 */
function displayQuote(containerId = 'quote-container') {
  const container = document.getElementById(containerId);
  if (!container) return;
  
  const quote = getRandomQuote();
  
  container.innerHTML = `
    <div class="quote-wrapper">
      <div class="quote-icon">💡</div>
      <blockquote class="quote-text">"${quote.text}"</blockquote>
      <cite class="quote-author">— ${quote.author}</cite>
    </div>
  `;
}

/**
 * Register Service Worker with proper scope
 * @returns {Promise} Registration promise
 */
function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    console.log('[PWA] Service Workers not supported');
    return Promise.resolve(null);
  }
  
  return navigator.serviceWorker.register('/service-worker.js', { scope: '/' })
    .then((registration) => {
      console.log('[PWA] Service Worker registered:', registration.scope);
      
      // Check for updates
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        console.log('[PWA] New Service Worker found');
        
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed') {
            if (navigator.serviceWorker.controller) {
              // New version available
              console.log('[PWA] New version available');
              showUpdateBanner(true);
            } else {
              // First install
              console.log('[PWA] Content cached for offline use');
            }
          }
        });
      });
      
      return registration;
    })
    .catch((error) => {
      console.warn('[PWA] Service Worker registration failed:', error);
      return null;
    });
}

/**
 * Show/hide the update notification banner
 * @param {boolean} show - Whether to show the banner
 */
function showUpdateBanner(show) {
  let banner = document.getElementById('update-banner');
  
  if (show) {
    if (!banner) {
      banner = createUpdateBanner();
      document.body.appendChild(banner);
    }
    
    // Update message based on online status
    const messageEl = banner.querySelector('.update-message');
    if (messageEl) {
      if (navigator.onLine) {
        messageEl.textContent = 'New version available – refresh to update.';
        banner.querySelector('.update-btn').style.display = 'inline-block';
      } else {
        messageEl.textContent = 'New version available – connect to network to update.';
        banner.querySelector('.update-btn').style.display = 'none';
      }
    }
    
    banner.classList.remove('hidden');
    banner.classList.add('show');
  } else if (banner) {
    banner.classList.add('hidden');
    banner.classList.remove('show');
  }
}

/**
 * Create the update banner element
 * @returns {HTMLElement} The banner element
 */
function createUpdateBanner() {
  const banner = document.createElement('div');
  banner.id = 'update-banner';
  banner.className = 'update-banner hidden';
  banner.innerHTML = `
    <span class="update-icon">🔄</span>
    <span class="update-message">New version available – refresh to update.</span>
    <button class="update-btn" onclick="window.updateApp()">Update Now</button>
    <button class="update-dismiss" onclick="window.dismissUpdate()">✕</button>
  `;
  return banner;
}

/**
 * Update the app by refreshing after new SW takes over
 */
window.updateApp = function() {
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    // Tell the waiting SW to skip waiting
    navigator.serviceWorker.controller.postMessage({ type: 'SKIP_WAITING' });
  }
  // Reload the page
  window.location.reload(true);
};

/**
 * Dismiss the update banner
 */
window.dismissUpdate = function() {
  showUpdateBanner(false);
  // Store dismissal in session (will show again on next visit)
  sessionStorage.setItem('update-dismissed', 'true');
};

/**
 * Update offline indicator visibility
 */
function updateOnlineStatus() {
  const indicator = document.getElementById('offlineIndicator');
  if (!indicator) return;
  
  if (!navigator.onLine) {
    indicator.classList.remove('hidden');
    // Also check if there's a pending update
    if (sessionStorage.getItem('update-available') === 'true') {
      showUpdateBanner(true);
    }
  } else {
    indicator.classList.add('hidden');
  }
}

/**
 * Listen for messages from Service Worker
 */
function setupServiceWorkerListener() {
  if (!('serviceWorker' in navigator)) return;
  
  navigator.serviceWorker.addEventListener('message', (event) => {
    const { type, version } = event.data || {};
    
    if (type === 'UPDATE_AVAILABLE') {
      console.log('[PWA] Update available, version:', version);
      sessionStorage.setItem('update-available', 'true');
      if (!sessionStorage.getItem('update-dismissed')) {
        showUpdateBanner(true);
      }
    }
  });
  
  // Listen for controller change (new SW activated)
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    console.log('[PWA] New Service Worker activated');
    // Reload to get new content
    window.location.reload();
  });
}

/**
 * Initialize all PWA features
 * Call this on DOMContentLoaded
 */
function initPWA() {
  // Register Service Worker
  registerServiceWorker();
  
  // Setup SW message listener
  setupServiceWorkerListener();
  
  // Setup online/offline detection
  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);
  updateOnlineStatus();
  
  // Display quote if container exists
  displayQuote('quote-container');
  
  console.log('[PWA] PWA utilities initialized');
}

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPWA);
} else {
  initPWA();
}

// Export functions for manual use
window.PWAUtils = {
  displayQuote,
  registerServiceWorker,
  showUpdateBanner,
  updateOnlineStatus,
  getRandomQuote,
  QUOTES
};
