/* -----------------------------------------------------------
   Nurse Success Study Hub - Service Worker
   - PWA offline support
   - Cache-first strategy for static assets
   - Network-first for API/dynamic content
   - Automatic cache refresh for new content
   - NCLEX Comprehensive System routes support
----------------------------------------------------------- */

const CACHE_VERSION = 'v2.2.0';
const CACHE_NAME = `nurse-study-hub-${CACHE_VERSION}`;
const DATA_CACHE_NAME = `nurse-study-hub-data-${CACHE_VERSION}`;

// Static assets to precache
const STATIC_ASSETS = [
  '/',
  '/static/style.css',
  '/static/category-style.css',
  '/static/quiz-style.css',
  '/static/home-style.css',
  '/static/quiz-script.js',
  '/static/js/pwa-utils.js',
  '/static/js/progress-store.js',
  '/static/manifest.json',
  '/static/icons/icon-192.png',
  '/static/icons/icon-512.png',
  '/static/icons/icon-120.png',
  '/static/icons/icon-152.png',
  '/static/icons/icon-167.png',
  '/static/icons/icon-180.png',
  '/images/Nursing_Nclex_Exam_Prep_Image.png',
  '/images/Nursing_Lab_Values.png',
  '/images/Nursing_Leadership_Image.png',
  '/images/Nursing_Pharmacology_Image.png',
  '/images/Nursing_Advanced_Certifications.png',
];

// HTML pages to precache
const HTML_PAGES = [
  '/',
  '/category/NCLEX',
  '/category/Lab_Values',
  '/category/Patient_Care_Management',
  '/category/Pharmacology',
  '/category/Pharmacology/Comprehensive',
  '/category/Pharmacology/Categories',
  '/category/Nursing_Certifications',
  '/category/Nursing_Certifications/CCRN',
  '/category/Nursing_Certifications/CFRN',
];

// NCLEX category routes
const NCLEX_CATEGORY_ROUTES = [
  '/category/NCLEX/category/Management%20of%20Care',
  '/category/NCLEX/category/Safety%20and%20Infection%20Control',
  '/category/NCLEX/category/Health%20Promotion%20and%20Maintenance',
  '/category/NCLEX/category/Psychosocial%20Integrity',
  '/category/NCLEX/category/Basic%20Care%20and%20Comfort',
  '/category/NCLEX/category/Pharmacological%20and%20Parenteral%20Therapies',
  '/category/NCLEX/category/Reduction%20of%20Risk%20Potential',
  '/category/NCLEX/category/Physiological%20Adaptation',
];

// CFRN category routes
const CFRN_CATEGORY_ROUTES = [
  '/category/Nursing_Certifications/CFRN/category/Trauma%2C%20Burns%2C%20and%20Transfusion',
  '/category/Nursing_Certifications/CFRN/category/Airway%2C%20Ventilation%2C%20and%20Respiratory%20Care',
  '/category/Nursing_Certifications/CFRN/category/Cardiac%20and%20Hemodynamic%20Care',
  '/category/Nursing_Certifications/CFRN/category/Obstetric%2C%20Neonatal%2C%20and%20Pediatric%20Special%20Populations',
  '/category/Nursing_Certifications/CFRN/category/Medical%20Emergencies%20and%20Critical%20Care',
  '/category/Nursing_Certifications/CFRN/category/Neurologic%20and%20Neurosurgical%20Care',
  '/category/Nursing_Certifications/CFRN/category/Operations%2C%20Safety%2C%20and%20Transport',
  '/category/Nursing_Certifications/CFRN/category/Flight%20Physiology%20and%20Environmental%20Factors',
  '/category/Nursing_Certifications/CFRN/category/Pediatric%20Assessment%20and%20Management',
  '/category/Nursing_Certifications/CFRN/category/Toxicology%20and%20Pharmacology',
];

// JSON files to precache (quiz data)
const JSON_PRECACHE = [
  // NCLEX Comprehensive
  '/modules/NCLEX/NCLEX_Comprehensive_Master_Categorized.json',
  
  // Lab Values
  '/modules/Lab_Values/NCLEX_Lab_Values.json',
  '/modules/Lab_Values/NCLEX_Lab_Values_Fill_In_The_Blank.json',
  
  // Patient Care Management
  '/modules/Patient_Care_Management/Learning_Questions_Module_1_2.json',
  '/modules/Patient_Care_Management/Learning_Questions_Module_3_4.json',
  '/modules/Patient_Care_Management/Module_1.json',
  '/modules/Patient_Care_Management/Module_2.json',
  '/modules/Patient_Care_Management/Module_3.json',
  '/modules/Patient_Care_Management/Module_4.json',
  
  // Pharmacology
  '/modules/Pharmacology/Comprehensive_Pharmacology.json',
  '/modules/Pharmacology/Pharm_Quiz_1.json',
  '/modules/Pharmacology/Pharm_Quiz_2.json',
  '/modules/Pharmacology/Pharm_Quiz_3.json',
  '/modules/Pharmacology/Pharm_Quiz_4.json',
  '/modules/Pharmacology/Anti_Infectives_Pharm.json',
  '/modules/Pharmacology/Cardiovascular_Pharm.json',
  '/modules/Pharmacology/CNS_Psychiatric_Pharm.json',
  '/modules/Pharmacology/Endocrine_Metabolic_Pharm.json',
  '/modules/Pharmacology/Gastrointestinal_Pharm.json',
  '/modules/Pharmacology/Hematologic_Oncology_Pharm.json',
  '/modules/Pharmacology/High_Alert_Medications_Pharm.json',
  '/modules/Pharmacology/Immunologic_Biologics_Pharm.json',
  '/modules/Pharmacology/Musculoskeletal_Pharm.json',
  '/modules/Pharmacology/Pain_Management_Pharm.json',
  '/modules/Pharmacology/Renal_Electrolytes_Pharm.json',
  '/modules/Pharmacology/Respiratory_Pharm.json',
  
  // Nursing Certifications
  '/modules/Nursing_Certifications/CCRN_Test_1_Combined_QA.json',
  '/modules/Nursing_Certifications/CCRN_Test_2_Combined_QA.json',
  '/modules/Nursing_Certifications/CCRN_Test_3_Combined_QA.json',
  '/modules/Nursing_Certifications/CFRN_Question_Bank.json',
];

// Install event - precache assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker version:', CACHE_VERSION);
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => {
        return caches.open(CACHE_NAME);
      })
      .then((cache) => {
        console.log('[SW] Caching HTML pages');
        // Cache HTML pages (allow failures for pages that may not exist yet)
        return Promise.allSettled(
          [...HTML_PAGES, ...NCLEX_CATEGORY_ROUTES, ...CFRN_CATEGORY_ROUTES].map(url => 
            cache.add(url).catch(err => console.log(`[SW] Could not cache ${url}:`, err.message))
          )
        );
      })
      .then(() => {
        return caches.open(DATA_CACHE_NAME);
      })
      .then((cache) => {
        console.log('[SW] Caching JSON data files');
        // Cache JSON files (allow failures for files that may not exist)
        return Promise.allSettled(
          JSON_PRECACHE.map(url => 
            cache.add(url).catch(err => console.log(`[SW] Could not cache ${url}:`, err.message))
          )
        );
      })
      .then(() => {
        console.log('[SW] Install complete');
        // Notify clients that offline mode is ready
        self.clients.matchAll().then(clients => {
          clients.forEach(client => {
            client.postMessage({
              type: 'OFFLINE_READY',
              version: CACHE_VERSION
            });
          });
        });
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
            .filter((name) => name.startsWith('nurse-study-hub-') && 
                             name !== CACHE_NAME && 
                             name !== DATA_CACHE_NAME)
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

// Helper function to determine if a request is for a static asset
function isStaticAsset(pathname) {
  const staticExtensions = ['.css', '.js', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.eot'];
  return pathname.startsWith('/static/') || staticExtensions.some(ext => pathname.endsWith(ext));
}

// Helper function to determine if a request is for JSON data
function isJsonData(pathname) {
  return pathname.endsWith('.json') || pathname.startsWith('/modules/');
}

// Network first strategy with cache fallback
async function networkFirstWithCache(request, cacheName) {
  try {
    const networkResponse = await fetch(request);
    
    // Cache successful responses
    if (networkResponse.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.log('[SW] Network failed, trying cache:', request.url);
    
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // Return offline fallback for navigation requests
    if (request.mode === 'navigate') {
      const offlinePage = await caches.match('/');
      if (offlinePage) {
        return offlinePage;
      }
    }
    
    throw error;
  }
}

// Cache first strategy with network fallback
async function cacheFirstWithNetwork(request, cacheName) {
  const cachedResponse = await caches.match(request);
  
  if (cachedResponse) {
    // Refresh cache in background (stale-while-revalidate)
    fetch(request)
      .then(async (networkResponse) => {
        if (networkResponse.ok) {
          const cache = await caches.open(cacheName);
          cache.put(request, networkResponse);
        }
      })
      .catch(() => {
        // Network failed, but we have cache - that's fine
      });
    
    return cachedResponse;
  }
  
  // Not in cache, fetch from network
  try {
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.error('[SW] Both cache and network failed for:', request.url);
    throw error;
  }
}

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
  
  // Skip API requests (let them go to network)
  if (url.pathname.startsWith('/api/')) {
    return;
  }
  
  const pathname = url.pathname;
  
  // Strategy based on resource type
  if (isStaticAsset(pathname)) {
    // Static assets: Cache first
    event.respondWith(cacheFirstWithNetwork(event.request, CACHE_NAME));
  } else if (isJsonData(pathname)) {
    // JSON data: Cache first (quiz questions don't change often)
    event.respondWith(cacheFirstWithNetwork(event.request, DATA_CACHE_NAME));
  } else {
    // HTML pages and dynamic content: Network first
    event.respondWith(networkFirstWithCache(event.request, CACHE_NAME));
  }
});

// Listen for messages from the main thread
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CACHE_URLS') {
    const urls = event.data.urls || [];
    caches.open(DATA_CACHE_NAME)
      .then((cache) => cache.addAll(urls))
      .then(() => {
        console.log('[SW] Cached additional URLs:', urls);
      })
      .catch((err) => {
        console.error('[SW] Failed to cache additional URLs:', err);
      });
  }
  
  if (event.data && event.data.type === 'GET_VERSION') {
    event.source.postMessage({
      type: 'VERSION',
      version: CACHE_VERSION
    });
  }
});

// Background sync for offline quiz submissions (future feature)
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-quiz-results') {
    console.log('[SW] Background sync triggered');
    // Future: sync quiz results when back online
  }
});

// Push notification handler (future feature)
self.addEventListener('push', (event) => {
  if (event.data) {
    const data = event.data.json();
    console.log('[SW] Push received:', data);
    
    event.waitUntil(
      self.registration.showNotification(data.title || 'Nurse Success Study Hub', {
        body: data.body || 'You have a new notification',
        icon: '/static/icons/icon-192.png',
        badge: '/static/icons/icon-192.png',
        data: data.url || '/'
      })
    );
  }
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Focus existing window or open new one
        for (const client of clientList) {
          if (client.url === event.notification.data && 'focus' in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(event.notification.data || '/');
        }
      })
  );
});

console.log('[SW] Service worker loaded, version:', CACHE_VERSION);
