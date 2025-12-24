/* -----------------------------------------------------------
   Nurse Success Study Hub - Service Worker
   - PWA offline support
   - Cache-first strategy for static assets
   - Network-first for API/dynamic content
   - Automatic cache refresh for new content
   - HESI Comprehensive System routes support
----------------------------------------------------------- */

const CACHE_VERSION = 'v2.5.0';
const CACHE_NAME = `nurse-study-hub-${CACHE_VERSION}`;

// Static assets to precache
const STATIC_ASSETS = [
  '/',
  '/static/style.css',
  '/static/category-style.css',
  '/static/quiz-style.css',
  '/static/quiz-script.js',
  '/static/js/pwa-utils.js',
  '/static/manifest.json',
  '/static/icons/icon-192.png',
  '/static/icons/icon-512.png',
  '/static/icons/icon-120.png',
  '/static/icons/icon-152.png',
  '/static/icons/icon-167.png',
  '/static/icons/icon-180.png',
  '/static/images/Nursing_Hesi_Exam_Prep_Image.png',
  '/static/images/Nursing_Lab_Values.png',
  '/static/images/Nursing_Leadership_Image.png',
  '/static/images/Nursing_Pharmacology_Image.png',
  '/static/images/Nursing_Advanced_Certifications.png',
];

// Dynamic routes to cache on first access
const DYNAMIC_ROUTES = [
  '/category/HESI',
  '/category/Lab_Values',
  '/category/Patient_Care_Management',
  '/category/Pharmacology',
  '/category/Nursing_Certifications',
  '/category/HESI/NCLEX_Comprehensive',
  '/category/Pharmacology/Comprehensive',
  '/category/Pharmacology/Categories',
  '/category/Nursing_Certifications/CCRN',
];

// NCLEX category routes for HESI
const NCLEX_CATEGORY_ROUTES = [
  '/category/HESI/category/Management%20of%20Care',
  '/category/HESI/category/Safety%20and%20Infection%20Control',
  '/category/HESI/category/Health%20Promotion%20and%20Maintenance',
  '/category/HESI/category/Psychosocial%20Integrity',
  '/category/HESI/category/Basic%20Care%20and%20Comfort',
  '/category/HESI/category/Pharmacological%20and%20Parenteral%20Therapies',
  '/category/HESI/category/Reduction%20of%20Risk%20Potential',
  '/category/HESI/category/Physiological%20Adaptation',
];

// JSON files to precache (quiz data)
const JSON_PRECACHE = [
  '/modules/HESI/HESI_Comprehensive_Master_Categorized.json',
  '/modules/HESI/HESI_Comp_Quiz_1.json',
  '/modules/HESI/HESI_Comp_Quiz_2.json',
  '/modules/HESI/HESI_Comp_Quiz_3.json',
  '/modules/Lab_Values/NCLEX_Lab_Values.json',
  '/modules/Lab_Values/NCLEX_Lab_Values_Fill_In_The_Blank.json',
];

// Install event - precache static assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Precaching static assets');
        return cache.addAll(STATIC_ASSETS)
          .then(() => {
            console.log('[SW] Static assets cached');
            return Promise.allSettled(
              JSON_PRECACHE.map(url => 
                cache.add(url).catch(err => console.log(`[SW] Could not cache ${url}:`, err))
              )
            );
          });
      })
      .then(() => {
        console.log('[SW] Install complete');
        return self.skipWaiting();
      })
      .catch((err) => {
        console.error('[SW] Install failed:', err);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name.startsWith('nurse-study-hub-') && name !== CACHE_NAME)
            .map((name) => {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => {
        console.log('[SW] Claiming clients');
        return self.clients.claim();
      })
  );
});

// Fetch event - handle requests
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }
  
  // Skip external requests
  if (!url.origin.includes(self.location.origin)) {
    return;
  }
  
  // Strategy: Cache-first for static assets, Network-first for dynamic content
  const isStaticAsset = url.pathname.startsWith('/static/') || 
                        url.pathname.endsWith('.json') ||
                        url.pathname.endsWith('.png') ||
                        url.pathname.endsWith('.jpg') ||
                        url.pathname.endsWith('.ico');
  
  const isAPIRequest = url.pathname.startsWith('/api/');
  
  if (isStaticAsset) {
    // Cache-first strategy for static assets
    event.respondWith(
      caches.match(event.request)
        .then((cachedResponse) => {
          if (cachedResponse) {
            // Return cached response and update cache in background
            event.waitUntil(
              fetch(event.request)
                .then((networkResponse) => {
                  if (networkResponse && networkResponse.status === 200) {
                    return caches.open(CACHE_NAME)
                      .then((cache) => cache.put(event.request, networkResponse));
                  }
                })
                .catch(() => {})
            );
            return cachedResponse;
          }
          
          // Not in cache, fetch from network
          return fetch(event.request)
            .then((networkResponse) => {
              if (networkResponse && networkResponse.status === 200) {
                const responseToCache = networkResponse.clone();
                caches.open(CACHE_NAME)
                  .then((cache) => cache.put(event.request, responseToCache));
              }
              return networkResponse;
            });
        })
    );
  } else if (isAPIRequest) {
    // Network-only for API requests
    event.respondWith(fetch(event.request));
  } else {
    // Network-first for dynamic pages
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME)
              .then((cache) => cache.put(event.request, responseToCache));
          }
          return networkResponse;
        })
        .catch(() => {
          // Network failed, try cache
          return caches.match(event.request)
            .then((cachedResponse) => {
              if (cachedResponse) {
                return cachedResponse;
              }
              // If no cache, return offline page or error
              return caches.match('/');
            });
        })
    );
  }
});

// Message event - handle messages from clients
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({ version: CACHE_VERSION });
  }
});

// Background sync for offline quiz submissions (future feature)
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-quiz-results') {
    console.log('[SW] Background sync triggered');
  }
});
