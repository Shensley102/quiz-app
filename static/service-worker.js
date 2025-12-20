// Service Worker v1.0.11 - Production Ready
// Nurse Success Study Hub - Comprehensive PWA Service Worker
// Features: Offline support, intelligent caching, proper error handling

'use strict';

// ==================== CACHE CONFIGURATION ====================

const CACHE_VERSION = 'v1.0.11';
const CACHE_NAME = 'study-hub-' + CACHE_VERSION;
const RUNTIME_CACHE = 'study-hub-runtime-' + CACHE_VERSION;
const IMAGE_CACHE = 'study-hub-images-' + CACHE_VERSION;

// Critical static assets
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/static/manifest.json',
  '/static/icons/icon-192.png',
  '/static/icons/icon-512.png'
];

// CSS and JavaScript files
const SCRIPT_ASSETS = [
  '/static/css/style.css',
  '/static/css/home-style.css',
  '/static/css/category-style.css',
  '/static/css/quiz-style.css',
  '/static/css/mobile.css',
  '/static/js/quiz-script.js'
];

// All quiz data files
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
  
  // Pharmacology
  '/modules/Pharmacology/Anti_Infectives_Pharm.json',
  '/modules/Pharmacology/CNS_Psychiatric_Pharm.json',
  '/modules/Pharmacology/Cardiovascular_Pharm.json',
  '/modules/Pharmacology/Comprehensive_Pharmacology.json',
  '/modules/Pharmacology/Endocrine_Metabolic_Pharm.json',
  '/modules/Pharmacology/Gastrointestinal_Pharm.json',
  '/modules/Pharmacology/Hematologic_Oncology_Pharm.json',
  '/modules/Pharmacology/High_Alert_Medications_Pharm.json',
  '/modules/Pharmacology/Immunologic_Biologics_Pharm.json',
  '/modules/Pharmacology/Musculoskeletal_Pharm.json',
  '/modules/Pharmacology/Pain_Management_Pharm.json',
  '/modules/Pharmacology/Renal_Electrolytes_Pharm.json',
  '/modules/Pharmacology/Respiratory_Pharm.json',
  
  // Lab Values
  '/modules/Lab_Values/NCLEX_Lab_Values.json',
  '/modules/Lab_Values/NCLEX_Lab_Values_Fill_In_The_Blank.json',
  
  // Nursing Certifications
  '/modules/Nursing_Certifications/CCRN_Test_1_Combined_QA.json',
  '/modules/Nursing_Certifications/CCRN_Test_2_Combined_QA.json',
  '/modules/Nursing_Certifications/CCRN_Test_3_Combined_QA.json',
  
  // Patient Care Management
  '/modules/Patient_Care_Management/Learning_Questions_Module_1_2.json',
  '/modules/Patient_Care_Management/Learning_Questions_Module_3_4_.json',
  '/modules/Patient_Care_Management/Module_1.json',
  '/modules/Patient_Care_Management/Module_2.json',
  '/modules/Patient_Care_Management/Module_3.json',
  '/modules/Patient_Care_Management/Module_4.json'
];

// Category images
const IMAGE_ASSETS = [
  '/images/Nursing_Advanced_Certifications.png',
  '/images/Nursing_Hesi_Exam_Prep_Image.png',
  '/images/Nursing_Lab_Values.png',
  '/images/Nursing_Leadership_Image.png',
  '/images/Nursing_Pharmacology_Image.png',
  '/static/images/fishbone-abg.png',
  '/static/images/fishbone-bmp.png',
  '/static/images/fishbone-cbc.png',
  '/static/images/fishbone-coagulation.png',
  '/static/images/fishbone-elements.png',
  '/static/images/fishbone-liver.png'
];

// ==================== INSTALL EVENT ====================

self.addEventListener('install', function(event) {
  console.log('[Service Worker] Installing ' + CACHE_VERSION);
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache) {
        console.log('[Service Worker] Opened cache: ' + CACHE_NAME);
        
        // Cache static assets
        var staticPromises = STATIC_ASSETS.map(function(url) {
          return fetchAndCache(cache, url);
        });
        
        // Cache scripts
        var scriptPromises = SCRIPT_ASSETS.map(function(url) {
          return fetchAndCache(cache, url);
        });
        
        // Cache quiz files
        var quizPromises = QUIZ_DATA_FILES.map(function(url) {
          return fetchAndCache(cache, url);
        });
        
        // Cache images
        var imagePromises = IMAGE_ASSETS.map(function(url) {
          return fetchAndCache(cache, url);
        });
        
        return Promise.all(
          staticPromises.concat(scriptPromises).concat(quizPromises).concat(imagePromises)
        )
        .then(function() {
          console.log('[Service Worker] Installation complete - ' + CACHE_VERSION);
          return self.skipWaiting();
        })
        .catch(function(error) {
          console.warn('[Service Worker] Some assets failed to cache: ' + error.message);
          return self.skipWaiting();
        });
      })
      .catch(function(error) {
        console.error('[Service Worker] Failed to open cache: ' + error.message);
        return self.skipWaiting();
      })
  );
});

/**
 * Helper function to fetch and cache a single file
 */
function fetchAndCache(cache, url) {
  return fetch(url)
    .then(function(response) {
      if (response.ok) {
        return cache.put(url, response);
      }
      console.warn('[Service Worker] Asset returned non-ok status: ' + url + ' (' + response.status + ')');
    })
    .catch(function(error) {
      console.warn('[Service Worker] Error caching ' + url + ': ' + error.message);
    });
}

// ==================== ACTIVATE EVENT ====================

self.addEventListener('activate', function(event) {
  console.log('[Service Worker] Activating ' + CACHE_VERSION);
  
  event.waitUntil(
    caches.keys()
      .then(function(cacheNames) {
        console.log('[Service Worker] Found caches: ' + cacheNames.join(', '));
        
        var deletePromises = cacheNames.map(function(cacheName) {
          // Delete old cache versions
          if (cacheName !== CACHE_NAME && cacheName !== RUNTIME_CACHE && cacheName !== IMAGE_CACHE) {
            console.log('[Service Worker] Deleting old cache: ' + cacheName);
            return caches.delete(cacheName);
          }
        });
        
        return Promise.all(deletePromises);
      })
      .then(function() {
        console.log('[Service Worker] Activation complete');
        return self.clients.claim();
      })
      .catch(function(error) {
        console.error('[Service Worker] Error during activation: ' + error.message);
      })
  );
});

// ==================== FETCH EVENT ====================

self.addEventListener('fetch', function(event) {
  var request = event.request;
  var url = new URL(request.url);
  
  // Skip non-GET and external requests
  if (request.method !== 'GET' || url.origin !== self.location.origin) {
    return;
  }
  
  // Strategy 1: Cache-first for quiz data (JSON files)
  if (url.pathname.includes('/modules/') && url.pathname.endsWith('.json')) {
    event.respondWith(cacheFirstWithFallback(request, CACHE_NAME, 'json'));
    return;
  }
  
  // Strategy 2: Cache-first for static assets (CSS, JS, icons)
  if (url.pathname.startsWith('/static/') || url.pathname.endsWith('.css') || url.pathname.endsWith('.js')) {
    event.respondWith(cacheFirstWithFallback(request, CACHE_NAME, 'static'));
    return;
  }
  
  // Strategy 3: Cache-first for images
  if (url.pathname.startsWith('/images/') || url.pathname.endsWith('.png') || url.pathname.endsWith('.jpg') || url.pathname.endsWith('.jpeg')) {
    event.respondWith(cacheFirstImages(request));
    return;
  }
  
  // Strategy 4: Network-first for HTML pages and API calls
  if (url.pathname === '/' || url.pathname.endsWith('.html') || url.pathname.startsWith('/api/') || url.pathname.startsWith('/category') || url.pathname.startsWith('/quiz')) {
    event.respondWith(networkFirstWithCache(request, CACHE_NAME));
    return;
  }
});

// ==================== CACHING STRATEGIES ====================

/**
 * Cache-first strategy with proper error handling
 */
function cacheFirstWithFallback(request, cacheName, type) {
  return caches.match(request)
    .then(function(response) {
      if (response) {
        console.log('[Service Worker] Cache hit: ' + request.url);
        return response;
      }
      
      // Not in cache, fetch from network
      return fetch(request)
        .then(function(response) {
          // Cache successful responses
          if (response && response.status === 200 && response.type === 'basic') {
            var responseClone = response.clone();
            caches.open(cacheName)
              .then(function(cache) {
                cache.put(request, responseClone);
              })
              .catch(function(error) {
                console.warn('[Service Worker] Error caching response: ' + error.message);
              });
          }
          return response;
        })
        .catch(function(error) {
          console.warn('[Service Worker] Network error for ' + request.url + ': ' + error.message);
          
          // Return cached version if available
          return caches.match(request)
            .then(function(response) {
              if (response) {
                return response;
              }
              
              // Return appropriate offline response
              if (type === 'json') {
                return new Response(
                  JSON.stringify({error: 'Quiz data unavailable offline'}),
                  {status: 503, statusText: 'Service Unavailable', headers: new Headers({'Content-Type': 'application/json'})}
                );
              }
              
              return new Response('Content unavailable offline', {status: 503});
            });
        });
    })
    .catch(function(error) {
      console.error('[Service Worker] Cache match error: ' + error.message);
      return fetch(request).catch(function() {
        return new Response('Service unavailable', {status: 503});
      });
    });
}

/**
 * Cache-first for images
 */
function cacheFirstImages(request) {
  return caches.match(request)
    .then(function(response) {
      if (response) {
        return response;
      }
      
      return fetch(request)
        .then(function(response) {
          if (response && response.status === 200) {
            var responseClone = response.clone();
            caches.open(IMAGE_CACHE)
              .then(function(cache) {
                cache.put(request, responseClone);
              });
          }
          return response;
        })
        .catch(function(error) {
          console.warn('[Service Worker] Image fetch error: ' + error.message);
          
          // Try cached version
          return caches.match(request)
            .catch(function() {
              // Return transparent 1x1 pixel
              return new Response(
                Buffer ? Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00, 0x00, 0xFF, 0xFF, 0xFF, 0x00, 0x00, 0x00, 0x21, 0xF9, 0x04, 0x01, 0x0A, 0x00, 0x01, 0x00, 0x2C, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02, 0x4C, 0x01, 0x00, 0x3B]) : '',
                {
                  status: 200,
                  headers: new Headers({'Content-Type': 'image/gif'})
                }
              );
            });
        });
    });
}

/**
 * Network-first strategy with cache fallback
 */
function networkFirstWithCache(request, cacheName) {
  return fetch(request)
    .then(function(response) {
      // Check if response is valid
      if (!response || response.status === 404) {
        // Real 404 - page doesn't exist on server
        return response;
      }
      
      // Cache successful responses
      if (response.status === 200 && response.type === 'basic') {
        var responseClone = response.clone();
        caches.open(RUNTIME_CACHE)
          .then(function(cache) {
            cache.put(request, responseClone);
          });
      }
      
      return response;
    })
    .catch(function(error) {
      console.warn('[Service Worker] Network request failed: ' + request.url);
      
      // Fall back to cache
      return caches.match(request)
        .then(function(response) {
          if (response) {
            console.log('[Service Worker] Returning cached response: ' + request.url);
            return response;
          }
          
          // No cache available and offline
          return new Response(
            '<html><body><h1>Offline</h1><p>This page is not available offline.</p><a href="/">Go Home</a></body></html>',
            {
              status: 503,
              statusText: 'Service Unavailable',
              headers: new Headers({'Content-Type': 'text/html'})
            }
          );
        })
        .catch(function(cacheError) {
          console.error('[Service Worker] Cache lookup failed: ' + cacheError.message);
          return new Response('Service unavailable', {status: 503});
        });
    });
}

// ==================== MESSAGE EVENT ====================

self.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.keys()
      .then(function(cacheNames) {
        return Promise.all(
          cacheNames.map(function(cacheName) {
            return caches.delete(cacheName);
          })
        );
      })
      .then(function() {
        console.log('[Service Worker] All caches cleared');
        if (event.ports[0]) {
          event.ports[0].postMessage({success: true});
        }
      });
  }
});

// ==================== LOGGING ====================

console.log('[Service Worker] ' + CACHE_VERSION + ' loaded and ready');
