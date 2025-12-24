/* ============================================================
   Service Worker for Nurse Success Study Hub PWA
   
   CACHE VERSION: Bump this when updating content
   TO ADD NEW QUIZ JSON: Add path to QUIZ_DATA_FILES array
   
   PART 2: Added HESI comprehensive quiz routes and category routes
   
   VERSION HISTORY:
   v1.0.8 - Added HESI landing routes and all 8 NCLEX category quiz routes for comprehensive quiz support
   v1.0.7 - Improved caching: Range header bypass, Cache-Control respect, inline offline response
   v1.0.6 - Fixed CSS filename (category-style.css), added automatic cache updates
   v1.0.5 - Added pharmacology routes and categories
   ============================================================ */

const CACHE_VERSION = 'v1.0.8';
const CACHE_NAME = `nurse-success-${CACHE_VERSION}`;

// How often to check for updates (in milliseconds)
const UPDATE_CHECK_INTERVAL = 30 * 60 * 1000; // 30 minutes

// Core files that MUST be cached for app to work offline
const CORE_ASSETS = [
  '/',
  '/static/manifest.json',
  '/static/style.css',
  '/static/home-style.css',
  '/static/category-style.css',
  '/static/js/pwa-utils.js',
  '/static/quiz-script.js',
  '/static/quiz-fill-blank.js',
  '/static/fishbone-utils.js',
  '/static/quiz-fishbone-mcq.js',
  '/static/quiz-fishbone-fill.js',
  // Icons - all sizes
  '/static/icons/icon-72.png',
  '/static/icons/icon-96.png',
  '/static/icons/icon-120.png',
  '/static/icons/icon-128.png',
  '/static/icons/icon-144.png',
  '/static/icons/icon-152.png',
  '/static/icons/icon-167.png',
  '/static/icons/icon-180.png',
  '/static/icons/icon-192.png',
  '/static/icons/icon-384.png',
  '/static/icons/icon-512.png'
];

// HTML pages to cache for offline navigation
// IMPORTANT: These are the Flask routes, not template files
// PART 2: Added HESI landing and category routes for comprehensive quiz support
const HTML_PAGES = [
  '/',
  '/category/HESI',
  '/category/HESI/NCLEX_Comprehensive',
  '/category/HESI/category/Management%20of%20Care',
  '/category/HESI/category/Safety%20and%20Infection%20Control',
  '/category/HESI/category/Health%20Promotion%20and%20Maintenance',
  '/category/HESI/category/Psychosocial%20Integrity',
  '/category/HESI/category/Basic%20Care%20and%20Comfort',
  '/category/HESI/category/Pharmacological%20and%20Parenteral%20Therapies',
  '/category/HESI/category/Reduction%20of%20Risk%20Potential',
  '/category/HESI/category/Physiological%20Adaptation',
  '/category/Lab_Values',
  '/category/Patient_Care_Management',
  '/category/Pharmacology',
  '/category/Pharmacology/Comprehensive',
  '/category/Pharmacology/Categories',
  '/category/Nursing_Certifications',
  '/category/Nursing_Certifications/CCRN',
  '/quiz-fishbone-mcq',
  '/quiz-fishbone-fill'
];

// Quiz JSON data files - ADD NEW QUIZ FILES HERE
const QUIZ_DATA_FILES = [
  // HESI
  '/modules/HESI/HESI_Adult_Health.json',
  '/modules/HESI/HESI_Clinical_Judgment.json',
  '/modules/HESI/HESI_Comp_Quiz_1.json',
  '/modules/HESI/HESI_Comp_Quiz_2.json',
  '/modules/HESI/HESI_Comp_Quiz_3.json',
  '/modules/HESI/HESI_Delegating.json',
  '/modules/HESI/HESI_Leadership.json',
  '/modules/HESI/HESI_Management.json',
  '/modules/HESI/HESI_Maternity.json',
  '/modules/HESI/HESI_Comprehensive_Master_Categorized.json',
  
  // Lab Values
  '/modules/Lab_Values/NCLEX_Lab_Values.json',
  '/modules/Lab_Values/NCLEX_Lab_Values_Fill_In_The_Blank.json',
  
  // Patient Care Management
  '/modules/Patient_Care_Management/Module_1.json',
  '/modules/Patient_Care_Management/Module_2.json',
  '/modules/Patient_Care_Management/Module_3.json',
  '/modules/Patient_Care_Management/Module_4.json',
  '/modules/Patient_Care_Management/Learning_Questions_Module_1_2.json',
  '/modules/Patient_Care_Management/Learning_Questions_Module_3_4_.json',
  
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
  
  // Nursing Certifications - CCRN
  '/modules/Nursing_Certifications/CCRN_Test_1_Combined_QA.json',
  '/modules/Nursing_Certifications/CCRN_Test_2_Combined_QA.json',
  '/modules/Nursing_Certifications/CCRN_Test_3_Combined_QA.json'
];

// Category images
const IMAGE_FILES = [
  '/images/Nursing_Hesi_Exam_Prep_Image.png',
  '/images/Nursing_Lab_Values.png',
  '/images/Nursing_Leadership_Image.png',
  '/images/Nursing_Pharmacology_Image.png',
  '/images/Nursing_Advanced_Certifications.png',
  // Fishbone diagram images
  '/static/images/fishbone-cbc.png',
  '/static/images/fishbone-bmp.png',
  '/static/images/fishbone-liver.png',
  '/static/images/fishbone-coagulation.png',
  '/static/images/fishbone-abg.png',
  '/static/images/fishbone-elements.png'
];

// Install event - cache core assets
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installing version', CACHE_VERSION);
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(async (cache) => {
        console.log('[Service Worker] Caching core assets');
        
        // Cache core assets (fail fast if these fail)
        await cache.addAll(CORE_ASSETS);
        console.log('[Service Worker] Core assets cached');
        
        // Try to cache HTML pages (don't fail install if these fail)
        const htmlPromises = HTML_PAGES.map(url => 
          cache.add(url).catch(err => console.warn('[SW] Failed to cache:', url, err.message))
        );
        await Promise.allSettled(htmlPromises);
        console.log('[Service Worker] HTML pages cached');
        
        // Try to cache quiz data (don't fail install if these fail)
        const quizPromises = QUIZ_DATA_FILES.map(url =>
          cache.add(url).catch(err => console.warn('[SW] Failed to cache:', url, err.message))
        );
        await Promise.allSettled(quizPromises);
        console.log('[Service Worker] Quiz data cached');
        
        // Try to cache images (don't fail install if these fail)
        const imagePromises = IMAGE_FILES.map(url =>
          cache.add(url).catch(err => console.warn('[SW] Failed to cache:', url, err.message))
        );
        await Promise.allSettled(imagePromises);
        
        console.log('[Service Worker] All assets processed');
      })
      .then(() => {
        console.log('[Service Worker] Skip waiting after successful precache');
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('[Service Worker] Install failed:', error);
      })
  );
});

// Activate event - clean up old caches and notify clients
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
        return self.clients.claim();
      })
      .then(() => {
        // Notify all clients that a new version is available
        return self.clients.matchAll().then(clients => {
          clients.forEach(client => {
            client.postMessage({
              type: 'SW_ACTIVATED',
              version: CACHE_VERSION
            });
          });
        });
      })
  );
});

// Fetch event - serve from cache with appropriate strategies
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip requests with Range headers (streaming/partial content)
  if (request.headers.has('Range')) {
    return;
  }

  event.respondWith(
    caches.match(request)
      .then((cachedResponse) => {
        // STRATEGY 1: Network First for HTML pages & API responses
        // Try network for freshness, fallback to cache
        if (url.pathname === '/' || url.pathname.startsWith('/category') || url.pathname.startsWith('/quiz') || url.pathname.startsWith('/api/')) {
          return fetch(request)
            .then((networkResponse) => {
              // Cache successful responses
              if (networkResponse && networkResponse.status === 200) {
                const responseToCache = networkResponse.clone();
                caches.open(CACHE_NAME).then((cache) => {
                  cache.put(request, responseToCache);
                });
              }
              return networkResponse;
            })
            .catch(() => {
              // Network failed, return cached version or home page
              if (cachedResponse) {
                return cachedResponse;
              }
              // If no cached response, try home page, else return minimal offline response
              return caches.match('/').then((homeResponse) => {
                if (homeResponse) {
                  return homeResponse;
                }
                // Return minimal inline HTML response (no styling, no new file)
                return new Response(
                  '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Offline</title></head><body><h1>Offline</h1><p>Please check your connection and try again.</p></body></html>',
                  { status: 503, headers: { 'Content-Type': 'text/html' } }
                );
              });
            });
        }
        
        // STRATEGY 2: Cache First for static assets
        // Return cache immediately for speed, update in background
        if (url.pathname.startsWith('/static/') || url.pathname.startsWith('/images/')) {
          if (cachedResponse) {
            // Check Cache-Control before background refresh
            const cacheControl = cachedResponse.headers.get('Cache-Control') || '';
            if (!cacheControl.includes('no-store')) {
              // Fetch fresh version in background (stale-while-revalidate)
              fetch(request).then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200) {
                  caches.open(CACHE_NAME).then((cache) => {
                    cache.put(request, networkResponse);
                  });
                }
              }).catch(() => { /* Ignore background update failures */ });
            }
            return cachedResponse;
          }
          
          return fetch(request)
            .then((networkResponse) => {
              // Only cache successful responses that allow caching
              const cacheControl = networkResponse.headers.get('Cache-Control') || '';
              if (cacheControl.includes('no-store')) {
                return networkResponse;
              }
              if (networkResponse && networkResponse.status === 200) {
                const responseToCache = networkResponse.clone();
                caches.open(CACHE_NAME).then((cache) => {
                  cache.put(request, responseToCache);
                });
              }
              return networkResponse;
            });
        }
        
        // STRATEGY 3: Stale While Revalidate for quiz JSON
        // Return cache immediately, fetch fresh in background
        if (url.pathname.endsWith('.json') || url.pathname.startsWith('/modules/')) {
          // Return cached version immediately if available
          if (cachedResponse) {
            // Check Cache-Control before background refresh
            const cacheControl = cachedResponse.headers.get('Cache-Control') || '';
            if (!cacheControl.includes('no-store')) {
              // Fetch fresh version in background
              fetch(request).then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200) {
                  caches.open(CACHE_NAME).then((cache) => {
                    cache.put(request, networkResponse);
                  });
                }
              }).catch(() => {
                // Ignore background update failures
              });
            }
            return cachedResponse;
          }
          
          // No cache, must fetch from network
          return fetch(request)
            .then((networkResponse) => {
              // Only cache successful responses that allow caching
              const cacheControl = networkResponse.headers.get('Cache-Control') || '';
              if (cacheControl.includes('no-store')) {
                return networkResponse;
              }
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
    console.log('[Service Worker] Skip waiting requested');
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'FORCE_UPDATE') {
    console.log('[Service Worker] Force update requested');
    event.waitUntil(updateCache());
  }
  
  if (event.data && event.data.type === 'CHECK_UPDATE') {
    console.log('[Service Worker] Checking for updates');
    event.waitUntil(checkForUpdates(event.source));
  }
  
  if (event.data && event.data.type === 'CACHE_URLS') {
    console.log('[Service Worker] Caching additional URLs');
    event.waitUntil(
      caches.open(CACHE_NAME)
        .then((cache) => cache.addAll(event.data.urls))
    );
  }
  
  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({ version: CACHE_VERSION });
  }
});

// Background sync for cache updates (if supported)
self.addEventListener('sync', (event) => {
  if (event.tag === 'update-cache') {
    console.log('[Service Worker] Background sync: updating cache');
    event.waitUntil(updateCache());
  }
});

// Periodic background sync (if supported)
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'update-cache') {
    console.log('[Service Worker] Periodic sync: updating cache');
    event.waitUntil(updateCache());
  }
});

// Check for updates by fetching the service worker file
async function checkForUpdates(client) {
  try {
    const response = await fetch('/service-worker.js', { cache: 'no-store' });
    if (response.ok) {
      const text = await response.text();
      const versionMatch = text.match(/CACHE_VERSION\s*=\s*['"]([^'"]+)['"]/);
      if (versionMatch && versionMatch[1] !== CACHE_VERSION) {
        console.log('[Service Worker] New version available:', versionMatch[1]);
        if (client) {
          client.postMessage({
            type: 'UPDATE_AVAILABLE',
            currentVersion: CACHE_VERSION,
            newVersion: versionMatch[1]
          });
        }
        return true;
      }
    }
  } catch (error) {
    console.warn('[Service Worker] Update check failed:', error.message);
  }
  return false;
}

// Function to update all cached content
async function updateCache() {
  console.log('[Service Worker] Starting cache update');
  const cache = await caches.open(CACHE_NAME);
  const allUrls = [...CORE_ASSETS, ...HTML_PAGES, ...QUIZ_DATA_FILES, ...IMAGE_FILES];
  
  let updated = 0;
  let failed = 0;
  
  for (const url of allUrls) {
    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (response && response.status === 200) {
        await cache.put(url, response);
        updated++;
      }
    } catch (error) {
      console.warn('[Service Worker] Failed to update:', url, error.message);
      failed++;
    }
  }
  
  console.log(`[Service Worker] Cache update complete. Updated: ${updated}, Failed: ${failed}`);
  
  // Notify clients that cache was updated
  const clients = await self.clients.matchAll();
  clients.forEach(client => {
    client.postMessage({ 
      type: 'CACHE_UPDATED', 
      version: CACHE_VERSION,
      stats: { updated, failed, total: allUrls.length }
    });
  });
  
  return { updated, failed };
}

console.log('[Service Worker] Script loaded - version', CACHE_VERSION);
