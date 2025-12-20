/* ============================================================
   Service Worker for Nurse Success Study Hub PWA
   
   CACHE VERSION: Bump this when updating content
   TO ADD NEW QUIZ JSON: Add path to QUIZ_DATA_FILES array
   
   VERSION HISTORY:
   v1.0.8 - Fixed 404 handling: return real 404 for unknown routes when online
   v1.0.7 - Comprehensive auto-caching implementation
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
const HTML_PAGES = [
  '/',
  '/category/HESI',
  '/category/Lab_Values',
  '/category/Patient_Care_Management',
  '/category/Pharmacology',
  '/pharmacology/comprehensive',
  '/pharmacology/categories',
  '/category/Nursing_Certifications',
  '/category/Nursing_Certifications/CCRN',
  '/quiz-fishbone-mcq',
  '/quiz-fishbone-fill'
];

// Quiz JSON data files - comprehensive list
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

// Generate a simple 404 page
function generate404Page(url) {
  return new Response(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Page Not Found - Nurse Success Study Hub</title>
  <link href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 40px 20px;
      font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background-color: #e8e8e8;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .container {
      max-width: 500px;
      text-align: center;
      background: white;
      padding: 40px;
      border-radius: 16px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    }
    .icon { font-size: 64px; margin-bottom: 20px; }
    h1 { margin: 0 0 16px; color: #1a1a1a; font-size: 28px; }
    p { color: #666; margin: 0 0 24px; line-height: 1.6; }
    .url { 
      background: #f5f5f5; 
      padding: 12px; 
      border-radius: 8px; 
      word-break: break-all;
      font-family: monospace;
      font-size: 14px;
      color: #888;
      margin-bottom: 24px;
    }
    .btn {
      display: inline-block;
      padding: 14px 28px;
      background: #2f61f3;
      color: white;
      text-decoration: none;
      border-radius: 8px;
      font-weight: 600;
      transition: all 0.2s ease;
    }
    .btn:hover { background: #1e4fd6; transform: translateY(-2px); }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">🔍</div>
    <h1>Page Not Found</h1>
    <p>Sorry, the page you're looking for doesn't exist or may have been moved.</p>
    <div class="url">${url}</div>
    <a href="/" class="btn">← Back to Home</a>
  </div>
</body>
</html>
  `, { 
    status: 404, 
    statusText: 'Not Found',
    headers: { 'Content-Type': 'text/html' } 
  });
}

// Generate offline page
function generateOfflinePage() {
  return new Response(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Offline - Nurse Success Study Hub</title>
  <link href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 40px 20px;
      font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: linear-gradient(135deg, #ff9800, #f57c00);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .container {
      max-width: 500px;
      text-align: center;
      background: white;
      padding: 40px;
      border-radius: 16px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    }
    .icon { font-size: 64px; margin-bottom: 20px; }
    h1 { margin: 0 0 16px; color: #1a1a1a; font-size: 28px; }
    p { color: #666; margin: 0 0 24px; line-height: 1.6; }
    .btn {
      display: inline-block;
      padding: 14px 28px;
      background: #ff9800;
      color: white;
      text-decoration: none;
      border-radius: 8px;
      font-weight: 600;
      transition: all 0.2s ease;
      cursor: pointer;
      border: none;
      font-size: 16px;
    }
    .btn:hover { background: #f57c00; transform: translateY(-2px); }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">📴</div>
    <h1>You're Offline</h1>
    <p>This page isn't available offline. Please check your internet connection and try again.</p>
    <button class="btn" onclick="window.location.reload()">Try Again</button>
  </div>
</body>
</html>
  `, { 
    status: 503, 
    statusText: 'Service Unavailable',
    headers: { 'Content-Type': 'text/html' } 
  });
}

// Install event - IMMEDIATELY cache ALL assets
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installing version', CACHE_VERSION);
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(async (cache) => {
        console.log('[Service Worker] Pre-caching ALL assets');
        
        // Combine all asset lists
        const allAssets = [
          ...CORE_ASSETS,
          ...HTML_PAGES,
          ...QUIZ_DATA_FILES,
          ...IMAGE_FILES
        ];
        
        // Remove duplicates
        const uniqueAssets = [...new Set(allAssets)];
        
        console.log(`[Service Worker] Total assets to cache: ${uniqueAssets.length}`);
        
        // Cache all assets with error handling for each
        const cachePromises = uniqueAssets.map(url => 
          cache.add(url)
            .then(() => {
              console.log(`[Service Worker] Cached: ${url}`);
              return true;
            })
            .catch(err => {
              console.warn(`[Service Worker] Failed to cache ${url}:`, err.message);
              return false;
            })
        );
        
        const results = await Promise.allSettled(cachePromises);
        const successCount = results.filter(r => r.status === 'fulfilled' && r.value).length;
        const failCount = results.length - successCount;
        
        console.log(`[Service Worker] Cache complete: ${successCount} succeeded, ${failCount} failed`);
        
        if (successCount < CORE_ASSETS.length) {
          console.warn('[Service Worker] Some core assets failed to cache!');
        }
      })
      .then(() => {
        console.log('[Service Worker] Skip waiting');
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('[Service Worker] Install failed:', error);
        throw error;
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

// Fetch event - FIXED: Proper handling of 404s vs offline fallback
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

  // Skip external resources (like Vercel Analytics) - let them fail silently when offline
  if (!url.hostname.includes(self.location.hostname) && !url.hostname.includes('localhost')) {
    event.respondWith(
      fetch(request).catch(() => {
        return new Response('', { status: 499, statusText: 'Network Unavailable' });
      })
    );
    return;
  }

  event.respondWith(handleFetch(request, url));
});

async function handleFetch(request, url) {
  const isNavigationRequest = request.mode === 'navigate';
  
  // Try cache first
  const cachedResponse = await caches.match(request);
  
  // STRATEGY: Network-first for navigation, stale-while-revalidate for assets
  if (isNavigationRequest) {
    // For navigation requests: Try network first, then cache, then fallback
    try {
      const networkResponse = await fetch(request);
      
      // If we got a response, check if it's a real 404 from the server
      if (networkResponse.status === 404) {
        // Server returned 404 - return our styled 404 page
        return generate404Page(url.pathname);
      }
      
      // Cache successful responses
      if (networkResponse.status === 200) {
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(request, responseToCache);
        });
      }
      
      return networkResponse;
      
    } catch (error) {
      // Network failed - check if we're actually offline
      if (!navigator.onLine) {
        // We're offline - try to serve from cache
        if (cachedResponse) {
          console.log('[Service Worker] Offline: serving cached:', url.pathname);
          return cachedResponse;
        }
        // No cache available - show offline page
        console.log('[Service Worker] Offline: no cache for:', url.pathname);
        return generateOfflinePage();
      }
      
      // We appear to be online but fetch failed (network error, server down, etc.)
      // Try cache as fallback
      if (cachedResponse) {
        console.log('[Service Worker] Network error, serving cached:', url.pathname);
        return cachedResponse;
      }
      
      // No cache, network failed - this could be a 404 or network issue
      // Return 404 page since we can't determine for sure
      console.log('[Service Worker] Network error, no cache:', url.pathname);
      return generate404Page(url.pathname);
    }
    
  } else {
    // For non-navigation requests (assets): Stale-while-revalidate
    
    // Start network fetch in background
    const fetchPromise = fetch(request)
      .then((networkResponse) => {
        // Only cache successful responses
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch((error) => {
        console.warn('[Service Worker] Fetch failed:', url.pathname, error.message);
        throw error;
      });
    
    // Return cached version immediately if available
    if (cachedResponse) {
      // Update in background (don't await)
      event.waitUntil(fetchPromise.catch(() => {}));
      return cachedResponse;
    }
    
    // No cache - must wait for network
    try {
      return await fetchPromise;
    } catch (error) {
      // Asset fetch failed with no cache
      return new Response('Resource not available', { 
        status: 404, 
        statusText: 'Not Found' 
      });
    }
  }
}

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
  
  // Remove duplicates
  const uniqueUrls = [...new Set(allUrls)];
  
  let updated = 0;
  let failed = 0;
  
  for (const url of uniqueUrls) {
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
      stats: { updated, failed, total: uniqueUrls.length }
    });
  });
  
  return { updated, failed };
}

console.log('[Service Worker] Script loaded - version', CACHE_VERSION);
