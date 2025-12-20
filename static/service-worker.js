// Service Worker v1.0.10
// Nurse Success Study Hub - Comprehensive PWA Service Worker
// Features: Offline support, intelligent caching, push notifications, background sync

'use strict';

// ==================== CACHE CONFIGURATION ====================

const CACHE_VERSION = 'v1.0.10';
const CACHE_NAME = 'study-hub-' + CACHE_VERSION;
const RUNTIME_CACHE = 'study-hub-runtime-' + CACHE_VERSION;
const IMAGE_CACHE = 'study-hub-images-' + CACHE_VERSION;

// Critical static assets - pages and styles
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
  '/static/css/mobile.css',
  '/static/js/pwa-utils.js',
  '/static/js/quiz-script.js',
  '/static/js/quiz-fill-blank.js',
  '/static/js/quiz-fishbone-mcq.js',
  '/static/js/quiz-fishbone-fill.js',
  '/static/js/fishbone-utils.js'
];

// All quiz data files - cached individually
const QUIZ_DATA_FILES = [
  // HESI Quizzes (9 files)
  '/modules/HESI/HESI_Adult_Health.json',
  '/modules/HESI/HESI_Clinical_Judgment.json',
  '/modules/HESI/HESI_Comp_Quiz_1.json',
  '/modules/HESI/HESI_Comp_Quiz_2.json',
  '/modules/HESI/HESI_Comp_Quiz_3.json',
  '/modules/HESI/HESI_Delegating.json',
  '/modules/HESI/HESI_Leadership.json',
  '/modules/HESI/HESI_Management.json',
  '/modules/HESI/HESI_Maternity.json',
  
  // Pharmacology (13 files)
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
  
  // Lab Values (2 files)
  '/modules/Lab_Values/NCLEX_Lab_Values.json',
  '/modules/Lab_Values/NCLEX_Lab_Values_Fill_In_The_Blank.json',
  
  // Nursing Certifications (3 files)
  '/modules/Nursing_Certifications/CCRN_Test_1_Combined_QA.json',
  '/modules/Nursing_Certifications/CCRN_Test_2_Combined_QA.json',
  '/modules/Nursing_Certifications/CCRN_Test_3_Combined_QA.json',
  
  // Patient Care Management (6 files)
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
        
        // Cache static assets individually with fallback
        var staticPromises = STATIC_ASSETS.map(function(url) {
          return fetch(url)
            .then(function(response) {
              if (response.ok) {
                return cache.put(url, response);
              }
              console.warn('[SW] Static asset not found: ' + url);
            })
            .catch(function(error) {
              console.warn('[SW] Error caching static asset ' + url + ': ' + error.message);
            });
        });
        
        // Cache script assets
        var scriptPromises = SCRIPT_ASSETS.map(function(url) {
          return fetch(url)
            .then(function(response) {
              if (response.ok) {
                return cache.put(url, response);
              }
              console.warn('[SW] Script asset not found: ' + url);
            })
            .catch(function(error) {
              console.warn('[SW] Error caching script ' + url + ': ' + error.message);
            });
        });
        
        // Cache quiz data files
        var quizPromises = QUIZ_DATA_FILES.map(function(url) {
          return fetch(url)
            .then(function(response) {
              if (response.ok) {
                return cache.put(url, response);
              }
              console.warn('[SW] Quiz file not found: ' + url);
            })
            .catch(function(error) {
              console.warn('[SW] Error caching quiz ' + url + ': ' + error.message);
            });
        });
        
        // Cache images
        var imagePromises = IMAGE_ASSETS.map(function(url) {
          return fetch(url)
            .then(function(response) {
              if (response.ok) {
                return cache.put(url, response);
              }
              console.warn('[SW] Image not found: ' + url);
            })
            .catch(function(error) {
              console.warn('[SW] Error caching image ' + url + ': ' + error.message);
            });
        });
        
        // Combine all promises - don't fail if some are missing
        return Promise.all(
          staticPromises.concat(scriptPromises).concat(quizPromises).concat(imagePromises)
        )
        .then(function() {
          console.log('[Service Worker] Installation complete - ' + CACHE_VERSION);
          return self.skipWaiting();
        })
        .catch(function(error) {
          console.error('[SW] Error during cache installation: ' + error.message);
          return self.skipWaiting();
        });
      })
      .catch(function(error) {
        console.error('[SW] Failed to open cache: ' + error.message);
        return self.skipWaiting();
      })
  );
});

// ==================== ACTIVATE EVENT ====================

self.addEventListener('activate', function(event) {
  console.log('[Service Worker] Activating ' + CACHE_VERSION);
  
  event.waitUntil(
    caches.keys()
      .then(function(cacheNames) {
        console.log('[SW] Found caches: ' + cacheNames.join(', '));
        
        var deletePromises = cacheNames.map(function(cacheName) {
          // Delete old cache versions
          if (cacheName !== CACHE_NAME && cacheName !== RUNTIME_CACHE && cacheName !== IMAGE_CACHE) {
            console.log('[SW] Deleting old cache: ' + cacheName);
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
        console.error('[SW] Error during activation: ' + error.message);
      })
  );
});

// ==================== FETCH EVENT ====================

self.addEventListener('fetch', function(event) {
  var request = event.request;
  var url = new URL(request.url);
  
  // Skip non-GET requests and external domains
  if (request.method !== 'GET' || url.origin !== self.location.origin) {
    return;
  }
  
  // Strategy 1: Cache-first for quiz data (JSON files)
  if (url.pathname.includes('/modules/')) {
    event.respondWith(cacheFirst(request, CACHE_NAME));
    return;
  }
  
  // Strategy 2: Cache-first for static assets (CSS, JS, icons)
  if (url.pathname.includes('/static/') || url.pathname === '/' || url.pathname === '/index.html') {
    event.respondWith(cacheFirst(request, CACHE_NAME));
    return;
  }
  
  // Strategy 3: Cache-first for images
  if (url.pathname.includes('/images/')) {
    event.respondWith(cacheFirstImages(request));
    return;
  }
  
  // Strategy 4: Network-first for HTML pages and API calls
  event.respondWith(networkFirst(request, CACHE_NAME));
});

// ==================== CACHING STRATEGIES ====================

// Cache-first strategy: Return cached version if available, fall back to network
function cacheFirst(request, cacheName) {
  return caches.match(request)
    .then(function(response) {
      if (response) {
        console.log('[SW] Cache hit: ' + request.url);
        return response;
      }
      
      // Not in cache, fetch from network
      return fetch(request)
        .then(function(response) {
          // Cache successful responses
          if (response && response.status === 200) {
            var responseClone = response.clone();
            caches.open(cacheName)
              .then(function(cache) {
                cache.put(request, responseClone);
              })
              .catch(function(error) {
                console.warn('[SW] Error caching response: ' + error.message);
              });
          }
          return response;
        })
        .catch(function(error) {
          console.warn('[SW] Network error for ' + request.url + ': ' + error.message);
          
          // Return offline page if available
          return caches.match('/')
            .catch(function() {
              return new Response('Offline - Content unavailable', {
                status: 503,
                statusText: 'Service Unavailable',
                headers: new Headers({'Content-Type': 'text/plain'})
              });
            });
        });
    })
    .catch(function(error) {
      console.error('[SW] Cache match error: ' + error.message);
      return fetch(request)
        .catch(function() {
          return new Response('Service unavailable', {status: 503});
        });
    });
}

// Cache-first strategy for images
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
          console.warn('[SW] Image fetch error: ' + error.message);
          // Return placeholder image or cached version
          return caches.match(request)
            .catch(function() {
              return new Response('');
            });
        });
    })
    .catch(function(error) {
      console.error('[SW] Image cache error: ' + error.message);
      return fetch(request).catch(function() {
        return new Response('');
      });
    });
}

// Network-first strategy: Try network first, fall back to cache
function networkFirst(request, cacheName) {
  return fetch(request)
    .then(function(response) {
      // Cache successful responses
      if (response && response.status === 200) {
        var responseClone = response.clone();
        caches.open(RUNTIME_CACHE)
          .then(function(cache) {
            cache.put(request, responseClone);
          });
      }
      return response;
    })
    .catch(function(error) {
      console.warn('[SW] Network request failed: ' + request.url);
      
      // Fall back to cache
      return caches.match(request)
        .then(function(response) {
          if (response) {
            console.log('[SW] Returning cached response for: ' + request.url);
            return response;
          }
          
          // No cache available
          return new Response('Offline - Page unavailable', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: new Headers({'Content-Type': 'text/html'})
          });
        })
        .catch(function(cacheError) {
          console.error('[SW] Cache lookup failed: ' + cacheError.message);
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
        console.log('[SW] All caches cleared');
        event.ports[0].postMessage({success: true});
      });
  }
});

// ==================== PUSH EVENT ====================

self.addEventListener('push', function(event) {
  if (event.data) {
    var options = {
      body: event.data.text(),
      icon: '/static/icons/icon-192.png',
      badge: '/static/icons/icon-192.png'
    };
    
    event.waitUntil(
      self.registration.showNotification('Nurse Success Study Hub', options)
    );
  }
});

// ==================== NOTIFICATION CLICK ====================

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  
  event.waitUntil(
    clients.matchAll({type: 'window'})
      .then(function(clientList) {
        for (var i = 0; i < clientList.length; i++) {
          var client = clientList[i];
          if (client.url === '/' && 'focus' in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow('/');
        }
      })
  );
});

// ==================== BACKGROUND SYNC ====================

self.addEventListener('sync', function(event) {
  if (event.tag === 'sync-quizzes') {
    event.waitUntil(syncQuizData());
  }
});

function syncQuizData() {
  return caches.open(CACHE_NAME)
    .then(function(cache) {
      console.log('[SW] Syncing quiz data...');
      
      var syncPromises = QUIZ_DATA_FILES.map(function(url) {
        return fetch(url)
          .then(function(response) {
            if (response.ok) {
              return cache.put(url, response);
            }
          })
          .catch(function(error) {
            console.warn('[SW] Sync error for ' + url);
          });
      });
      
      return Promise.all(syncPromises);
    });
}

// ==================== LOGGING ====================

console.log('[Service Worker] ' + CACHE_VERSION + ' loaded and ready');
