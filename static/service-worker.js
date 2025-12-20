// Service Worker v1.0.9 (Updated: Fixed Pharm_Quiz pre-cache errors and ReferenceError)
// Manages caching for offline PWA functionality

const CACHE_NAME = 'study-hub-v1.0.9';

// Pre-cache essential assets
const STATIC_ASSETS = [
  '/',
  '/static/css/style.css',
  '/static/css/mobile.css',
  '/static/js/pwa-utils.js',
  '/static/manifest.json',
  '/static/icons/icon-192.png',
  '/static/icons/icon-512.png',
  '/offline.html'
];

// Quiz data files - FIXED: Updated to match actual application structure
const QUIZ_DATA_FILES = [
  // HESI Quizzes
  '/modules/HESI/HESI_Adult_Health.json',
  '/modules/HESI/HESI_Clinical_Judgment.json',
  '/modules/HESI/HESI_Comp_Quiz_1.json',
  '/modules/HESI/HESI_Comp_Quiz_2.json',
  '/modules/HESI/HESI_Comp_Quiz_3.json',
  '/modules/HESI/HESI_Delegating.json',
  '/modules/HESI/HESI_Leadership.json',
  '/modules/HESI/HESI_Management.json',
  '/modules/HESI/HESI_Maternity.json',
  
  // Pharmacology - FIXED: Using actual file names
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

// Install event - cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log(`[Service Worker] Installing v1.0.9: Starting cache of ${STATIC_ASSETS.length} static assets + ${QUIZ_DATA_FILES.length} quiz files`);
        
        // Cache static assets
        const staticPromise = cache.addAll(STATIC_ASSETS).catch((error) => {
          console.warn('[Service Worker] Some static assets failed to cache:', error);
        });
        
        // Try to cache quiz data files, but don't fail if individual files are missing
        const quizPromises = QUIZ_DATA_FILES.map((url) => {
          return fetch(url)
            .then((response) => {
              if (response.ok) {
                return cache.put(url, response);
              } else {
                console.warn(`[Service Worker] Quiz file not found: ${url} (${response.status})`);
              }
            })
            .catch((error) => {
              // Silently skip files that don't exist or are unreachable
              console.warn(`[Service Worker] Could not cache quiz file: ${url}`, error.message);
            });
        });
        
        return Promise.all([staticPromise, ...quizPromises])
          .then(() => {
            console.log('[Service Worker] Cache installation complete');
            self.skipWaiting();
          });
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log(`[Service Worker] Deleting old cache: ${cacheName}`);
            return caches.delete(cacheName);
          }
        })
      ).then(() => self.clients.claim());
    })
  );
});

// Fetch event - use cache-first strategy for quiz data, network-first for others
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Skip non-GET requests and external URLs
  if (request.method !== 'GET' || url.origin !== self.location.origin) {
    return;
  }
  
  // Cache-first strategy for quiz data and static assets
  if (url.pathname.includes('/modules/') || 
      url.pathname.includes('/static/') ||
      url.pathname === '/' ||
      url.pathname.includes('favicon')) {
    
    event.respondWith(
      caches.match(request)
        .then((response) => {
          if (response) {
            console.log(`[Service Worker] Cache hit: ${url.pathname}`);
            return response;
          }
          
          // Not in cache, try network
          return fetch(request)
            .then((response) => {
              // Only cache successful responses
              if (response && response.status === 200) {
                const responseClone = response.clone();
                caches.open(CACHE_NAME).then((cache) => {
                  cache.put(request, responseClone);
                });
              }
              return response;
            })
            .catch((error) => {
              // Network failed and no cache - return offline page if available
              console.warn(`[Service Worker] Network error for ${url.pathname}:`, error);
              if (url.pathname.includes('/quiz') || url.pathname === '/') {
                return caches.match('/offline.html').catch(() => new Response('Offline'));
              }
              throw error;
            });
        })
    );
  } else {
    // Network-first strategy for API calls and other requests
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache successful API responses
          if (response && response.status === 200) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return response;
        })
        .catch((error) => {
          // Network failed, try cache
          console.warn(`[Service Worker] Network error for ${url.pathname}, checking cache:`, error);
          return caches.match(request)
            .then((cachedResponse) => {
              if (cachedResponse) {
                console.log(`[Service Worker] Using cached response for: ${url.pathname}`);
                return cachedResponse;
              }
              // No cache and no network
              return new Response('Service unavailable', {
                status: 503,
                statusText: 'Service Unavailable'
              });
            });
        })
    );
  }
});

// Handle messages from clients
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
