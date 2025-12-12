// Service Worker for Nurse Success Study Hub PWA
const CACHE_VERSION = 'v1.0.3';
const CACHE_NAME = `nurse-success-${CACHE_VERSION}`;

// Core files that should always be cached
const CORE_ASSETS = [
  '/',
  '/static/manifest.json',
  '/static/style.css',
  '/static/home-style.css',
  '/static/catagory-style.css',
  '/static/js/pwa-utils.js',
  '/static/quiz-script.js',
  '/static/quiz-fill-blank.js',
  '/static/fishbone-utils.js',
  '/static/quiz-fishbone-mcq.js',
  '/static/quiz-fishbone-fill.js',
  '/static/icons/icon-72.png',
  '/static/icons/icon-96.png',
  '/static/icons/icon-128.png',
  '/static/icons/icon-144.png',
  '/static/icons/icon-152.png',
  '/static/icons/icon-192.png',
  '/static/icons/icon-384.png',
  '/static/icons/icon-512.png',
  '/static/icons/icon-120.png',
  '/static/icons/icon-167.png',
  '/static/icons/icon-180.png',
];

// HTML pages to cache for offline access
const HTML_PAGES = [
  '/category/HESI',
  '/category/Lab_Values',
  '/category/Patient_Care_Management',
  '/category/Pharmacology',
  '/category/Pharmacology/Comprehensive',
  '/category/Pharmacology/Categories',
  '/category/Nursing_Certifications',
  '/category/Nursing_Certifications/CCRN',
  '/quiz-fishbone-mcq',
  '/quiz-fishbone-fill',
];

// Quiz data files (JSON) - these will be cached on first access
const QUIZ_DATA_FILES = [
  // HESI
  '/modules/HESI/Comprehensive_Quiz_1.json',
  '/modules/HESI/Comprehensive_Quiz_2.json',
  '/modules/HESI/Comprehensive_Quiz_3.json',
  '/modules/HESI/Leadership_Management.json',
  '/modules/HESI/Maternity.json',
  '/modules/HESI/Adult_Health.json',
  '/modules/HESI/Clinical_Judgment_Test.json',
  
  // Lab Values
  '/modules/Lab_Values/Lab_Values_Multiple_Choice.json',
  '/modules/Lab_Values/Lab_Values_Fill_In_The_Blank.json',
  
  // Patient Care Management
  '/modules/Patient_Care_Management/Leadership.json',
  
  // Pharmacology - Comprehensive
  '/modules/Pharmacology/Pharm_Quiz_1.json',
  '/modules/Pharmacology/Pharm_Quiz_2.json',
  '/modules/Pharmacology/Pharm_Quiz_3.json',
  '/modules/Pharmacology/Pharm_Quiz_4.json',
  
  // Pharmacology - By Category
  '/modules/Pharmacology/Cardiovascular_Pharm.json',
  '/modules/Pharmacology/CNS_Psychiatric_Pharm.json',
  '/modules/Pharmacology/Anti_Infectives_Pharm.json',
  '/modules/Pharmacology/Endocrine_Metabolic_Pharm.json',
  '/modules/Pharmacology/Respiratory_Pharm.json',
  '/modules/Pharmacology/Gastrointestinal_Pharm.json',
  '/modules/Pharmacology/Pain_Management_Pharm.json',
  '/modules/Pharmacology/Hematologic_Oncology_Pharm.json',
  '/modules/Pharmacology/Renal_Electrolytes_Pharm.json',
  '/modules/Pharmacology/Musculoskeletal_Pharm.json',
  '/modules/Pharmacology/Immunologic_Biologics_Pharm.json',
  '/modules/Pharmacology/High_Alert_Medications_Pharm.json',
  
  // Nursing Certifications
  '/modules/Nursing_Certifications/CCRN_Test_1.json',
  '/modules/Nursing_Certifications/CCRN_Test_2.json',
  '/modules/Nursing_Certifications/CCRN_Test_3.json',
];

// Install event - cache core assets
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installing version', CACHE_VERSION);
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[Service Worker] Caching core assets');
        return cache.addAll(CORE_ASSETS);
      })
      .then(() => {
        console.log('[Service Worker] Core assets cached');
        return self.skipWaiting(); // Activate immediately
      })
      .catch((error) => {
        console.error('[Service Worker] Install failed:', error);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating version', CACHE_VERSION);
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((cacheName) => cacheName.startsWith('nurse-success-') && cacheName !== CACHE_NAME)
            .map((cacheName) => {
              console.log('[Service Worker] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            })
        );
      })
      .then(() => {
        console.log('[Service Worker] Claiming clients');
        return self.clients.claim(); // Take control immediately
      })
  );
});

// Fetch event - serve from cache with network fallback
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip Chrome extensions and other non-http(s) requests
  if (!url.protocol.startsWith('http')) {
    return;
  }

  event.respondWith(
    caches.match(request)
      .then((cachedResponse) => {
        // Strategy depends on resource type
        
        // For HTML pages and API calls - network first, fall back to cache
        if (request.mode === 'navigate' || url.pathname.startsWith('/api/') || HTML_PAGES.includes(url.pathname)) {
          return fetch(request)
            .then((networkResponse) => {
              // Cache the new version
              if (networkResponse && networkResponse.status === 200) {
                const responseToCache = networkResponse.clone();
                caches.open(CACHE_NAME).then((cache) => {
                  cache.put(request, responseToCache);
                });
              }
              return networkResponse;
            })
            .catch(() => {
              // Network failed, return cached version
              return cachedResponse || caches.match('/');
            });
        }
        
        // For static assets - cache first, fall back to network
        if (url.pathname.startsWith('/static/') || url.pathname.startsWith('/images/')) {
          return cachedResponse || fetch(request)
            .then((networkResponse) => {
              if (networkResponse && networkResponse.status === 200) {
                const responseToCache = networkResponse.clone();
                caches.open(CACHE_NAME).then((cache) => {
                  cache.put(request, responseToCache);
                });
              }
              return networkResponse;
            });
        }
        
        // For quiz data (JSON files) - stale-while-revalidate
        if (url.pathname.endsWith('.json') || url.pathname.startsWith('/modules/') || QUIZ_DATA_FILES.includes(url.pathname)) {
          // Return cached version immediately
          if (cachedResponse) {
            // But also fetch new version in background
            fetch(request).then((networkResponse) => {
              if (networkResponse && networkResponse.status === 200) {
                caches.open(CACHE_NAME).then((cache) => {
                  cache.put(request, networkResponse);
                });
              }
            }).catch(() => {
              // Ignore network errors for background updates
            });
            return cachedResponse;
          }
          
          // No cache, fetch from network
          return fetch(request)
            .then((networkResponse) => {
              if (networkResponse && networkResponse.status === 200) {
                const responseToCache = networkResponse.clone();
                caches.open(CACHE_NAME).then((cache) => {
                  cache.put(request, responseToCache);
                });
              }
              return networkResponse;
            })
            .catch((error) => {
              console.error('[Service Worker] Fetch failed for:', url.pathname, error);
              throw error;
            });
        }
        
        // Default: try cache first, then network
        return cachedResponse || fetch(request);
      })
  );
});

// Handle messages from clients
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CACHE_URLS') {
    event.waitUntil(
      caches.open(CACHE_NAME)
        .then((cache) => cache.addAll(event.data.urls))
    );
  }
});

// Periodic background sync (if supported)
self.addEventListener('sync', (event) => {
  if (event.tag === 'update-cache') {
    event.waitUntil(updateCache());
  }
});

async function updateCache() {
  const cache = await caches.open(CACHE_NAME);
  const requests = [...CORE_ASSETS, ...HTML_PAGES, ...QUIZ_DATA_FILES];
  
  for (const request of requests) {
    try {
      const response = await fetch(request);
      if (response && response.status === 200) {
        await cache.put(request, response);
      }
    } catch (error) {
      console.error(`[Service Worker] Failed to update cache for ${request}:`, error);
    }
  }
}

console.log('[Service Worker] Script loaded - version', CACHE_VERSION);
