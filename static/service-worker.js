/* ============================================================
   Nurse Success Study Hub - Service Worker
   Enables offline functionality for iPad PWA
   
   VERSION MANAGEMENT:
   - Bump CACHE_VERSION when you update quiz JSON files or core assets
   - This will trigger the update notification for users
   ============================================================ */

const CACHE_VERSION = 'v1.0.2';
const CACHE_NAME = `nurse-study-hub-${CACHE_VERSION}`;

// Core assets that must be cached for the app to work offline
const CORE_ASSETS = [
  '/',
  '/static/style.css',
  '/static/home-style.css',
  '/static/catagory-style.css',
  '/static/quiz-script.js',
  '/static/quiz-fill-blank.js',
  '/static/quiz-fishbone-mcq.js',
  '/static/quiz-fishbone-fill.js',
  '/static/fishbone-utils.js',
  '/static/js/pwa-utils.js',
  '/static/manifest.json',
  
  // Icons
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
  '/static/icons/icon-512.png',
  
  // Fishbone images
  '/static/images/fishbone-cbc.png',
  '/static/images/fishbone-bmp.png',
  '/static/images/fishbone-liver.png',
  '/static/images/fishbone-coagulation.png',
  '/static/images/fishbone-abg.png',
  
  // Category images
  '/images/Nursing_Advanced_Certifications.png',
  '/images/Nursing_Hesi_Exam_Prep_Image.png',
  '/images/Nursing_Lab_Values.png',
  '/images/Nursing_Leadership_Image.png',
  '/images/Nursing_Pharmacology_Image.png'
];

// Quiz data JSON files - essential for offline quiz functionality
// UPDATE THIS LIST when you add new quiz JSON files
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
  '/modules/Patient_Care_Management/Module_4.json',
  
  // Pharmacology - Comprehensive (4 quizzes)
  '/modules/Pharmacology/Pharm_Quiz_1.json',
  '/modules/Pharmacology/Pharm_Quiz_2.json',
  '/modules/Pharmacology/Pharm_Quiz_3.json',
  '/modules/Pharmacology/Pharm_Quiz_4.json',
  
  // Pharmacology - By Category (12 quizzes)
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
  '/modules/Pharmacology/High_Alert_Medications_Pharm.json'
];

// HTML pages to cache
const HTML_PAGES = [
  '/',
  '/category/HESI',
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

// Install event - cache all essential assets
self.addEventListener('install', (event) => {
  console.log('[ServiceWorker] Install - Version:', CACHE_VERSION);
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[ServiceWorker] Caching core assets');
        
        // Cache core assets first
        const corePromise = cache.addAll(CORE_ASSETS).catch(err => {
          console.warn('[ServiceWorker] Some core assets failed to cache:', err);
        });
        
        // Cache quiz data files
        const quizPromise = Promise.all(
          QUIZ_DATA_FILES.map(url => 
            cache.add(url).catch(err => {
              console.warn(`[ServiceWorker] Failed to cache ${url}:`, err);
            })
          )
        );
        
        // Cache HTML pages
        const htmlPromise = Promise.all(
          HTML_PAGES.map(url =>
            cache.add(url).catch(err => {
              console.warn(`[ServiceWorker] Failed to cache ${url}:`, err);
            })
          )
        );
        
        return Promise.all([corePromise, quizPromise, htmlPromise]);
      })
      .then(() => {
        console.log('[ServiceWorker] All assets cached');
        // Don't skip waiting - let the update banner handle this
      })
  );
});

// Activate event - clean up old caches and notify clients
self.addEventListener('activate', (event) => {
  console.log('[ServiceWorker] Activate - Version:', CACHE_VERSION);
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((cacheName) => {
              // Delete any cache that starts with our prefix but isn't current
              return cacheName.startsWith('nurse-study-hub-') && cacheName !== CACHE_NAME;
            })
            .map((cacheName) => {
              console.log('[ServiceWorker] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            })
        );
      })
      .then(() => {
        console.log('[ServiceWorker] Claiming clients');
        return self.clients.claim();
      })
  );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }
  
  // Skip chrome-extension and other non-http(s) requests
  if (!url.protocol.startsWith('http')) {
    return;
  }
  
  // Skip Vercel analytics and external resources we don't control
  if (url.hostname.includes('vercel-analytics') || 
      url.hostname.includes('vercel-insights') ||
      url.hostname.includes('fonts.googleapis.com') ||
      url.hostname.includes('fonts.gstatic.com')) {
    return;
  }
  
  // Handle API requests with network-first strategy
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirstStrategy(request));
    return;
  }
  
  // Handle quiz JSON files with stale-while-revalidate
  if (url.pathname.endsWith('.json') && url.pathname.includes('/modules/')) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }
  
  // Handle static assets with cache-first strategy
  if (url.pathname.startsWith('/static/') || 
      url.pathname.startsWith('/images/') || 
      url.pathname.startsWith('/modules/')) {
    event.respondWith(cacheFirstStrategy(request));
    return;
  }
  
  // Handle navigation requests (HTML pages) with network-first
  if (request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(networkFirstStrategy(request));
    return;
  }
  
  // Default: cache-first for everything else
  event.respondWith(cacheFirstStrategy(request));
});

// Cache-first strategy: Try cache, fallback to network
async function cacheFirstStrategy(request) {
  const cachedResponse = await caches.match(request);
  
  if (cachedResponse) {
    return cachedResponse;
  }
  
  // Not in cache, fetch from network
  return fetchAndCache(request);
}

// Network-first strategy: Try network, fallback to cache
async function networkFirstStrategy(request) {
  try {
    const networkResponse = await fetch(request);
    
    // Cache successful responses
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.log('[ServiceWorker] Network request failed, trying cache:', request.url);
    
    const cachedResponse = await caches.match(request);
    
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // If it's a navigation request and we have no cached page, return cached home
    if (request.mode === 'navigate') {
      const offlinePage = await caches.match('/');
      if (offlinePage) {
        return offlinePage;
      }
    }
    
    // Return a basic offline response
    return new Response('Offline - Please check your connection', {
      status: 503,
      statusText: 'Service Unavailable',
      headers: new Headers({
        'Content-Type': 'text/plain'
      })
    });
  }
}

// Stale-while-revalidate: Return cache immediately, update in background
async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cachedResponse = await cache.match(request);
  
  // Fetch from network in background
  const fetchPromise = fetch(request).then((networkResponse) => {
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  }).catch(() => null);
  
  // Return cached response immediately if available, otherwise wait for network
  return cachedResponse || fetchPromise;
}

// Fetch and cache helper
async function fetchAndCache(request) {
  try {
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.log('[ServiceWorker] Fetch failed:', request.url);
    throw error;
  }
}

// Listen for messages from the main thread
self.addEventListener('message', (event) => {
  const { type } = event.data || {};
  
  if (type === 'SKIP_WAITING') {
    console.log('[ServiceWorker] Skip waiting requested');
    self.skipWaiting();
  }
  
  if (type === 'GET_VERSION') {
    event.ports[0].postMessage({ version: CACHE_VERSION });
  }
  
  // Force update all cached content
  if (type === 'UPDATE_CACHE') {
    event.waitUntil(
      caches.open(CACHE_NAME).then((cache) => {
        return Promise.all([
          ...CORE_ASSETS.map(url => cache.add(url).catch(() => {})),
          ...QUIZ_DATA_FILES.map(url => cache.add(url).catch(() => {})),
          ...HTML_PAGES.map(url => cache.add(url).catch(() => {}))
        ]);
      })
    );
  }
  
  // Check if update is available
  if (type === 'CHECK_UPDATE') {
    event.ports[0].postMessage({ 
      version: CACHE_VERSION,
      updateAvailable: false // Will be true when a new SW is waiting
    });
  }
});

// Notify all clients when a new version is ready
self.addEventListener('install', () => {
  self.clients.matchAll().then(clients => {
    clients.forEach(client => {
      client.postMessage({
        type: 'UPDATE_AVAILABLE',
        version: CACHE_VERSION
      });
    });
  });
});

console.log('[ServiceWorker] Service Worker loaded - Version:', CACHE_VERSION);
