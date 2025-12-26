// ============================================================
// NURSE SUCCESS STUDY HUB - SERVICE WORKER
// Version: 1.1.1 - Fixed HESI Comprehensive routes and typos
// ============================================================

const CACHE_VERSION = '1.1.1';
const CACHE_NAME = `nurse-success-${CACHE_VERSION}`;

// ============================================================
// CORE ASSETS - These must be cached for the app to work
// ============================================================
const CORE_ASSETS = [
  '/',
  '/static/style.css',
  '/static/home-style.css',
  '/static/category-style.css',
  '/static/quiz-style.css',
  '/static/quiz-script.js',
  '/static/quiz-fill-blank.js',
  '/static/quiz-fishbone-mcq.js',
  '/static/quiz-fishbone-fill.js',
  '/static/fishbone-utils.js',
  '/static/js/pwa-utils.js',
  '/static/manifest.json',
  '/static/icons/icon-192.png',
  '/static/icons/icon-512.png'
];

// ============================================================
// HTML PAGES - Navigation routes to cache
// ============================================================
const HTML_PAGES = [
  '/',
  '/category/HESI',
  '/category/HESI/NCLEX_Comprehensive',
  '/category/Lab_Values',
  '/category/Patient_Care_Management',
  '/category/Pharmacology',
  '/category/Pharmacology/Categories',
  '/category/Pharmacology/Comprehensive',
  '/category/Nursing_Certifications',
  '/category/Nursing_Certifications/CCRN',
  '/quiz-fishbone-mcq',
  '/quiz-fishbone-fill'
];

// ============================================================
// QUIZ DATA FILES - JSON question banks
// Note: Fixed typo in Learning_Questions_Module_3_4 (removed extra underscore)
// ============================================================
const QUIZ_DATA_FILES = [
  // HESI
  '/modules/HESI/HESI_Comprehensive_Master_Categorized.json',
  
  // Lab Values
  '/modules/Lab_Values/NCLEX_Lab_Values.json',
  '/modules/Lab_Values/NCLEX_Lab_Values_Fill_In_The_Blank.json',
  
  // Nursing Certifications
  '/modules/Nursing_Certifications/CCRN_Test_1_Combined_QA.json',
  '/modules/Nursing_Certifications/CCRN_Test_2_Combined_QA.json',
  '/modules/Nursing_Certifications/CCRN_Test_3_Combined_QA.json',
  
  // Patient Care Management (FIXED: removed extra underscore from Module_3_4)
  '/modules/Patient_Care_Management/Learning_Questions_Module_1_2.json',
  '/modules/Patient_Care_Management/Learning_Questions_Module_3_4.json',
  '/modules/Patient_Care_Management/Module_1.json',
  '/modules/Patient_Care_Management/Module_2.json',
  '/modules/Patient_Care_Management/Module_3.json',
  '/modules/Patient_Care_Management/Module_4.json',
  
  // Pharmacology - Comprehensive
  '/modules/Pharmacology/Comprehensive_Pharmacology.json',
  '/modules/Pharmacology/Pharm_Quiz_1.json',
  '/modules/Pharmacology/Pharm_Quiz_2.json',
  '/modules/Pharmacology/Pharm_Quiz_3.json',
  '/modules/Pharmacology/Pharm_Quiz_4.json',
  
  // Pharmacology - Categories
  '/modules/Pharmacology/Anti_Infectives_Pharm.json',
  '/modules/Pharmacology/CNS_Psychiatric_Pharm.json',
  '/modules/Pharmacology/Cardiovascular_Pharm.json',
  '/modules/Pharmacology/Endocrine_Metabolic_Pharm.json',
  '/modules/Pharmacology/Gastrointestinal_Pharm.json',
  '/modules/Pharmacology/Hematologic_Oncology_Pharm.json',
  '/modules/Pharmacology/High_Alert_Medications_Pharm.json',
  '/modules/Pharmacology/Immunologic_Biologics_Pharm.json',
  '/modules/Pharmacology/Musculoskeletal_Pharm.json',
  '/modules/Pharmacology/Pain_Management_Pharm.json',
  '/modules/Pharmacology/Renal_Electrolytes_Pharm.json',
  '/modules/Pharmacology/Respiratory_Pharm.json'
];

// ============================================================
// IMAGE FILES - Category images and fishbone diagrams
// ============================================================
const IMAGE_FILES = [
  '/images/Nursing_Hesi_Exam_Prep_Image.png',
  '/images/Nursing_Lab_Values.png',
  '/images/Nursing_Leadership_Image.png',
  '/images/Nursing_Pharmacology_Image.png',
  '/images/Nursing_Advanced_Certifications.png',
  '/static/images/fishbone-cbc.png',
  '/static/images/fishbone-bmp.png',
  '/static/images/fishbone-liver.png',
  '/static/images/fishbone-coagulation.png',
  '/static/images/fishbone-abg.png',
  '/static/images/fishbone-elements.png'
];

// ============================================================
// INSTALL EVENT - Cache core assets
// ============================================================
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installing version', CACHE_VERSION);
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[Service Worker] Caching core assets...');
        
        // Cache core assets (fail install if these fail)
        return cache.addAll(CORE_ASSETS)
          .then(() => {
            console.log('[Service Worker] Core assets cached successfully');
            
            // Try to cache HTML pages (don't fail if some fail)
            return Promise.allSettled(
              HTML_PAGES.map(url => 
                cache.add(url).catch(err => {
                  console.warn(`[Service Worker] Failed to cache HTML: ${url}`, err.message);
                })
              )
            );
          })
          .then(() => {
            // Try to cache quiz data files (don't fail if some fail)
            console.log('[Service Worker] Caching quiz data files...');
            return Promise.allSettled(
              QUIZ_DATA_FILES.map(url => 
                cache.add(url).catch(err => {
                  console.warn(`[Service Worker] Failed to cache quiz data: ${url}`, err.message);
                })
              )
            );
          })
          .then(() => {
            // Try to cache images (don't fail if some fail)
            console.log('[Service Worker] Caching images...');
            return Promise.allSettled(
              IMAGE_FILES.map(url => 
                cache.add(url).catch(err => {
                  console.warn(`[Service Worker] Failed to cache image: ${url}`, err.message);
                })
              )
            );
          });
      })
      .then(() => {
        console.log('[Service Worker] Installation complete, skipping waiting');
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('[Service Worker] Install failed:', error);
      })
  );
});

// ============================================================
// ACTIVATE EVENT - Clean up old caches
// ============================================================
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
        // Notify all clients that a new version is active
        return self.clients.matchAll().then((clients) => {
          clients.forEach((client) => {
            client.postMessage({
              type: 'SW_UPDATED',
              version: CACHE_VERSION
            });
          });
        });
      })
  );
});

// ============================================================
// FETCH EVENT - Serve from cache, fallback to network
// ============================================================
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;
  
  // Skip cross-origin requests (except for fonts, analytics, etc.)
  if (url.origin !== location.origin) {
    // Allow Google Fonts
    if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
      event.respondWith(
        caches.match(event.request).then((cached) => {
          return cached || fetch(event.request).then((response) => {
            return caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, response.clone());
              return response;
            });
          });
        })
      );
    }
    return;
  }
  
  // For quiz routes with query parameters, try network first for fresh data
  if (url.pathname.startsWith('/quiz/')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Clone and cache successful responses
          if (response && response.status === 200) {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return response;
        })
        .catch(() => {
          // Fallback to cache if network fails
          return caches.match(event.request).then((cached) => {
            return cached || caches.match('/').then((home) => home);
          });
        })
    );
    return;
  }
  
  // For static assets and JSON files, use cache-first strategy
  if (url.pathname.startsWith('/static/') || 
      url.pathname.startsWith('/modules/') || 
      url.pathname.startsWith('/images/')) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) {
          // Return cached version, but also update cache in background
          fetch(event.request).then((response) => {
            if (response && response.status === 200) {
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, response);
              });
            }
          }).catch(() => {});
          return cached;
        }
        
        // Not in cache, fetch from network
        return fetch(event.request).then((response) => {
          if (response && response.status === 200) {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return response;
        });
      })
    );
    return;
  }
  
  // For HTML pages, use network-first strategy
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.status === 200) {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request).then((cached) => {
          if (cached) return cached;
          
          // For navigation requests, return cached home page as fallback
          if (event.request.mode === 'navigate') {
            return caches.match('/');
          }
          
          return new Response('Offline', { status: 503 });
        });
      })
  );
});

// ============================================================
// MESSAGE HANDLER - For client communication
// ============================================================
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('[Service Worker] Skip waiting requested');
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({ version: CACHE_VERSION });
  }
  
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    console.log('[Service Worker] Clearing all caches');
    event.waitUntil(
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => caches.delete(cacheName))
        );
      })
    );
  }
});

console.log('[Service Worker] Script loaded - version', CACHE_VERSION);
