// SafetyFirst EHS - Enhanced Service Worker for Offline Support
const CACHE_VERSION = 'v1.1.0';
const STATIC_CACHE = `safetyfirst-static-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `safetyfirst-dynamic-${CACHE_VERSION}`;
const API_CACHE = `safetyfirst-api-${CACHE_VERSION}`;
const IMAGE_CACHE = `safetyfirst-images-${CACHE_VERSION}`;

// Cache size limits
const MAX_API_CACHE_ITEMS = 100;
const MAX_DYNAMIC_CACHE_ITEMS = 50;
const MAX_IMAGE_CACHE_ITEMS = 100;
const API_CACHE_MAX_AGE = 5 * 60 * 1000; // 5 minutes for API data freshness

// Files to cache immediately on install
const STATIC_FILES = [
  '/',
  '/app.html',
  '/index.html',
  '/manifest.json',
  'https://cdn.tailwindcss.com',
  'https://unpkg.com/react@18/umd/react.production.min.js',
  'https://unpkg.com/react-dom@18/umd/react-dom.production.min.js',
  'https://unpkg.com/@babel/standalone/babel.min.js',
  'https://cdn.jsdelivr.net/npm/recharts@2.8.0/umd/Recharts.min.js',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap'
];

// API endpoints with caching strategies
const API_CACHE_CONFIG = {
  '/api/dashboard': { maxAge: 300000, priority: 'high', syncOnReconnect: true },
  '/api/incidents': { maxAge: 180000, priority: 'high', syncOnReconnect: true },
  '/api/action-items': { maxAge: 180000, priority: 'high', syncOnReconnect: true },
  '/api/inspections': { maxAge: 300000, priority: 'medium', syncOnReconnect: true },
  '/api/training': { maxAge: 600000, priority: 'medium', syncOnReconnect: false },
  '/api/documents': { maxAge: 600000, priority: 'low', syncOnReconnect: false },
  '/api/users': { maxAge: 3600000, priority: 'low', syncOnReconnect: false },
  '/api/observations': { maxAge: 300000, priority: 'medium', syncOnReconnect: true },
  '/api/jsa': { maxAge: 600000, priority: 'low', syncOnReconnect: false },
  '/api/permits': { maxAge: 300000, priority: 'medium', syncOnReconnect: true },
  '/api/contractors': { maxAge: 3600000, priority: 'low', syncOnReconnect: false },
  '/api/chemicals': { maxAge: 3600000, priority: 'low', syncOnReconnect: false },
  '/api/claims': { maxAge: 300000, priority: 'high', syncOnReconnect: true },
  '/api/inspection-templates/library': { maxAge: 86400000, priority: 'low', syncOnReconnect: false },
  '/api/organization': { maxAge: 3600000, priority: 'low', syncOnReconnect: false }
};

// Conflict resolution strategies
const CONFLICT_STRATEGIES = {
  'incidents': 'server-wins',
  'action-items': 'merge',
  'inspections': 'client-wins-draft',
  'observations': 'client-wins',
  'default': 'server-wins'
};

// Install event
self.addEventListener('install', (event) => {
  console.log('[SW] Installing Service Worker v' + CACHE_VERSION);
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(STATIC_FILES))
      .then(() => self.skipWaiting())
      .catch((err) => console.error('[SW] Install error:', err))
  );
});

// Activate event
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating Service Worker v' + CACHE_VERSION);
  event.waitUntil(
    Promise.all([
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name.startsWith('safetyfirst-') && 
                             ![STATIC_CACHE, DYNAMIC_CACHE, API_CACHE, IMAGE_CACHE].includes(name))
            .map((name) => caches.delete(name))
        );
      }),
      self.clients.claim(),
      self.clients.matchAll().then(clients => {
        clients.forEach(client => {
          client.postMessage({ type: 'SW_UPDATED', version: CACHE_VERSION });
        });
      })
    ])
  );
});

// Fetch event
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (!request.url.startsWith('http')) return;

  if (request.method !== 'GET') {
    if (request.url.includes('/api/')) {
      event.respondWith(handleMutationRequest(request));
    }
    return;
  }

  if (url.pathname.startsWith('/api/')) {
    event.respondWith(handleApiRequest(request, url));
    return;
  }

  if (request.destination === 'image' || /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(url.pathname)) {
    event.respondWith(handleImageRequest(request));
    return;
  }

  if (STATIC_FILES.some(file => url.pathname === file || url.href === file)) {
    event.respondWith(cacheFirstStrategy(request, STATIC_CACHE));
    return;
  }

  event.respondWith(staleWhileRevalidate(request));
});

// Handle API requests with smart caching
async function handleApiRequest(request, url) {
  const routeConfig = Object.entries(API_CACHE_CONFIG).find(([route]) => url.pathname.startsWith(route));
  const config = routeConfig ? routeConfig[1] : { maxAge: 60000, priority: 'low' };
  
  const cache = await caches.open(API_CACHE);
  const cachedResponse = await cache.match(request);
  
  if (cachedResponse) {
    const cachedTime = cachedResponse.headers.get('x-cached-at');
    const age = cachedTime ? Date.now() - parseInt(cachedTime) : Infinity;
    
    if (age < config.maxAge) {
      if (config.priority === 'high' && navigator.onLine) {
        fetchAndCache(request, cache).catch(() => {});
      }
      return addCacheHeaders(cachedResponse, age, true);
    }
  }

  try {
    const networkResponse = await fetchWithTimeout(request, 10000);
    
    if (networkResponse.ok) {
      const responseToCache = networkResponse.clone();
      const headers = new Headers(responseToCache.headers);
      headers.set('x-cached-at', Date.now().toString());
      
      const cachedBody = await responseToCache.blob();
      const timestampedResponse = new Response(cachedBody, {
        status: responseToCache.status,
        statusText: responseToCache.statusText,
        headers
      });
      
      cache.put(request, timestampedResponse);
      await trimCache(cache, MAX_API_CACHE_ITEMS);
    }
    
    return networkResponse;
  } catch (error) {
    if (cachedResponse) {
      return addCacheHeaders(cachedResponse, Infinity, true);
    }
    return createOfflineResponse('API request failed while offline');
  }
}

// Handle mutation requests (POST/PUT/DELETE)
async function handleMutationRequest(request) {
  if (navigator.onLine) {
    try {
      return await fetch(request);
    } catch (error) {}
  }
  
  const clonedRequest = request.clone();
  const body = await clonedRequest.text().catch(() => '{}');
  let parsedBody;
  try {
    parsedBody = JSON.parse(body);
  } catch {
    parsedBody = { rawBody: body };
  }

  const pendingRequest = {
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    url: request.url,
    method: request.method,
    headers: Object.fromEntries(request.headers.entries()),
    body: parsedBody,
    timestamp: Date.now(),
    retryCount: 0,
    entityType: extractEntityType(request.url),
    conflictStrategy: getConflictStrategy(request.url)
  };

  const db = await openOfflineDB();
  const tx = db.transaction('pendingRequests', 'readwrite');
  await tx.objectStore('pendingRequests').add(pendingRequest);

  if ('sync' in self.registration) {
    await self.registration.sync.register('sync-pending-requests');
  }

  notifyClients({
    type: 'OFFLINE_REQUEST_QUEUED',
    requestId: pendingRequest.id,
    entityType: pendingRequest.entityType
  });

  return new Response(JSON.stringify({
    success: true,
    offline: true,
    pendingId: pendingRequest.id,
    message: 'Changes saved offline. Will sync when reconnected.',
    queuedAt: pendingRequest.timestamp
  }), {
    status: 202,
    headers: { 'Content-Type': 'application/json' }
  });
}

// Handle image requests
async function handleImageRequest(request) {
  const cache = await caches.open(IMAGE_CACHE);
  const cachedResponse = await cache.match(request);
  
  if (cachedResponse) {
    fetchAndCache(request, cache).catch(() => {});
    return cachedResponse;
  }
  
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
      await trimCache(cache, MAX_IMAGE_CACHE_ITEMS);
    }
    return networkResponse;
  } catch (error) {
    return createPlaceholderImage();
  }
}

// Cache-first strategy
async function cacheFirstStrategy(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cachedResponse = await cache.match(request);
  
  if (cachedResponse) return cachedResponse;
  
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) cache.put(request, networkResponse.clone());
    return networkResponse;
  } catch (error) {
    return offlineFallback(request);
  }
}

// Stale-while-revalidate
async function staleWhileRevalidate(request) {
  const cache = await caches.open(DYNAMIC_CACHE);
  const cachedResponse = await cache.match(request);
  
  const fetchPromise = fetch(request)
    .then((networkResponse) => {
      if (networkResponse.ok) {
        cache.put(request, networkResponse.clone());
        trimCache(cache, MAX_DYNAMIC_CACHE_ITEMS);
      }
      return networkResponse;
    })
    .catch(() => cachedResponse || offlineFallback(request));
  
  return cachedResponse || fetchPromise;
}

// Background sync with conflict resolution
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-pending-requests') {
    event.waitUntil(syncPendingRequestsWithConflictResolution());
  }
});

async function syncPendingRequestsWithConflictResolution() {
  const db = await openOfflineDB();
  const tx = db.transaction('pendingRequests', 'readonly');
  const store = tx.objectStore('pendingRequests');
  
  const requests = await new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  requests.sort((a, b) => a.timestamp - b.timestamp);
  
  const results = { synced: 0, failed: 0, conflicts: 0 };
  const conflictedRequests = [];

  for (const pendingReq of requests) {
    try {
      if (pendingReq.method === 'PUT' && pendingReq.conflictStrategy !== 'client-wins') {
        const conflict = await checkForConflict(pendingReq);
        if (conflict.hasConflict) {
          const resolution = await resolveConflict(pendingReq, conflict);
          if (resolution.skip) {
            conflictedRequests.push({ request: pendingReq, conflict, resolution });
            results.conflicts++;
            const deleteTx = db.transaction('pendingRequests', 'readwrite');
            await deleteTx.objectStore('pendingRequests').delete(pendingReq.id);
            continue;
          }
          pendingReq.body = resolution.resolvedBody;
        }
      }

      const response = await fetch(pendingReq.url, {
        method: pendingReq.method,
        headers: {
          ...pendingReq.headers,
          'X-Offline-Sync': 'true',
          'X-Offline-Timestamp': pendingReq.timestamp.toString()
        },
        body: JSON.stringify(pendingReq.body)
      });
      
      if (response.ok || response.status === 409) {
        const deleteTx = db.transaction('pendingRequests', 'readwrite');
        await deleteTx.objectStore('pendingRequests').delete(pendingReq.id);
        results.synced++;
        
        notifyClients({
          type: 'SYNC_SUCCESS',
          requestId: pendingReq.id,
          entityType: pendingReq.entityType
        });
      } else if (response.status >= 500) {
        pendingReq.retryCount++;
        if (pendingReq.retryCount < 5) {
          const updateTx = db.transaction('pendingRequests', 'readwrite');
          await updateTx.objectStore('pendingRequests').put(pendingReq);
        }
        results.failed++;
      } else {
        const deleteTx = db.transaction('pendingRequests', 'readwrite');
        await deleteTx.objectStore('pendingRequests').delete(pendingReq.id);
        results.failed++;
        
        notifyClients({
          type: 'SYNC_FAILED',
          requestId: pendingReq.id,
          entityType: pendingReq.entityType,
          error: `Server returned ${response.status}`
        });
      }
    } catch (error) {
      console.error('[SW] Sync failed:', pendingReq.url, error);
      pendingReq.retryCount++;
      results.failed++;
    }
  }

  if (results.synced > 0 || results.conflicts > 0) {
    let message = '';
    if (results.synced > 0) message += `${results.synced} changes synced. `;
    if (results.conflicts > 0) message += `${results.conflicts} conflicts resolved.`;
    
    self.registration.showNotification('SafetyFirst EHS Sync', {
      body: message.trim(),
      icon: '/manifest.json',
      badge: '/manifest.json',
      tag: 'sync-results'
    });
  }

  return results;
}

async function checkForConflict(pendingReq) {
  const entityId = extractEntityId(pendingReq.url);
  if (!entityId) return { hasConflict: false };

  try {
    const response = await fetch(pendingReq.url.replace(/\/[^/]+$/, `/${entityId}`), {
      method: 'GET',
      headers: { 'X-Conflict-Check': 'true' }
    });
    
    if (!response.ok) return { hasConflict: false };
    
    const serverData = await response.json();
    const serverTimestamp = new Date(serverData.updatedAt || serverData.createdAt).getTime();
    
    if (serverTimestamp > pendingReq.timestamp) {
      return { hasConflict: true, serverData, serverTimestamp, clientTimestamp: pendingReq.timestamp };
    }
    
    return { hasConflict: false };
  } catch (error) {
    return { hasConflict: false };
  }
}

async function resolveConflict(pendingReq, conflict) {
  const strategy = pendingReq.conflictStrategy || CONFLICT_STRATEGIES.default;
  
  switch (strategy) {
    case 'server-wins':
      return { skip: true, reason: 'Server data is newer' };
    case 'client-wins':
      return { skip: false, resolvedBody: pendingReq.body };
    case 'client-wins-draft':
      if (conflict.serverData?.status === 'draft') {
        return { skip: false, resolvedBody: pendingReq.body };
      }
      return { skip: true, reason: 'Server record no longer draft' };
    case 'merge':
      const merged = mergeObjects(conflict.serverData, pendingReq.body);
      return { skip: false, resolvedBody: merged };
    default:
      return { skip: true, reason: 'Unknown strategy' };
  }
}

function mergeObjects(server, client) {
  const merged = { ...server };
  for (const [key, value] of Object.entries(client)) {
    if (value !== undefined && value !== null) {
      if (typeof value === 'object' && !Array.isArray(value) && typeof server[key] === 'object') {
        merged[key] = mergeObjects(server[key], value);
      } else {
        merged[key] = value;
      }
    }
  }
  return merged;
}

// Helper functions
function extractEntityType(url) {
  const match = url.match(/\/api\/([^/]+)/);
  return match ? match[1] : 'unknown';
}

function extractEntityId(url) {
  const match = url.match(/\/([a-f0-9]{24})(?:\/|$)/i);
  return match ? match[1] : null;
}

function getConflictStrategy(url) {
  const entityType = extractEntityType(url);
  return CONFLICT_STRATEGIES[entityType] || CONFLICT_STRATEGIES.default;
}

async function fetchWithTimeout(request, timeout) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(request, { signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

async function fetchAndCache(request, cache) {
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

function addCacheHeaders(response, age, fromCache) {
  const headers = new Headers(response.headers);
  headers.set('X-Served-From', fromCache ? 'cache' : 'network');
  headers.set('X-Cache-Age', Math.round(age / 1000).toString());
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function trimCache(cache, maxItems) {
  const keys = await cache.keys();
  if (keys.length > maxItems) {
    const toDelete = keys.slice(0, keys.length - maxItems);
    await Promise.all(toDelete.map(key => cache.delete(key)));
  }
}

function createOfflineResponse(message) {
  return new Response(JSON.stringify({ error: 'You are offline', offline: true, message }), {
    status: 503,
    headers: { 'Content-Type': 'application/json' }
  });
}

function createPlaceholderImage() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect fill="#e2e8f0" width="100" height="100"/><text x="50" y="50" text-anchor="middle" fill="#94a3b8" font-family="sans-serif" font-size="12">Offline</text></svg>`;
  return new Response(svg, { headers: { 'Content-Type': 'image/svg+xml' } });
}

function offlineFallback(request) {
  const url = new URL(request.url);
  if (url.pathname.endsWith('.html') || url.pathname === '/') {
    return caches.match('/app.html').then(response => {
      return response || new Response(`<!DOCTYPE html><html><head><title>Offline</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f1f5f9}.c{text-align:center;padding:2rem;background:#fff;border-radius:1rem;box-shadow:0 10px 40px rgba(0,0,0,.1)}.i{font-size:4rem;margin-bottom:1rem}h1{color:#1e293b;margin-bottom:.5rem}p{color:#64748b;margin-bottom:1.5rem}button{background:#3b82f6;color:#fff;border:none;padding:.875rem 2rem;border-radius:.5rem;cursor:pointer;font-size:1rem}</style></head><body><div class="c"><div class="i">📡</div><h1>You're Offline</h1><p>Changes will sync when reconnected.</p><button onclick="location.reload()">Retry</button></div></body></html>`, { headers: { 'Content-Type': 'text/html' } });
    });
  }
  return new Response('Offline', { status: 503 });
}

function notifyClients(message) {
  self.clients.matchAll().then(clients => {
    clients.forEach(client => client.postMessage(message));
  });
}

// IndexedDB
function openOfflineDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('SafetyFirstOffline', 2);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('pendingRequests')) {
        const store = db.createObjectStore('pendingRequests', { keyPath: 'id' });
        store.createIndex('timestamp', 'timestamp', { unique: false });
        store.createIndex('entityType', 'entityType', { unique: false });
      }
      if (!db.objectStoreNames.contains('draftForms')) {
        const draftStore = db.createObjectStore('draftForms', { keyPath: 'id' });
        draftStore.createIndex('type', 'type', { unique: false });
        draftStore.createIndex('timestamp', 'timestamp', { unique: false });
      }
      if (!db.objectStoreNames.contains('offlineData')) {
        const dataStore = db.createObjectStore('offlineData', { keyPath: 'key' });
        dataStore.createIndex('type', 'type', { unique: false });
      }
    };
  });
}

// Push notifications
self.addEventListener('push', (event) => {
  const data = event.data?.json() || { title: 'SafetyFirst EHS', body: 'You have a new notification' };
  event.waitUntil(self.registration.showNotification(data.title, {
    body: data.body,
    icon: '/manifest.json',
    badge: '/manifest.json',
    tag: data.tag || 'default',
    data: data.data || {},
    requireInteraction: data.priority === 'urgent',
    vibrate: data.priority === 'urgent' ? [200, 100, 200] : [100]
  }));
});

// Notification click
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const urlToOpen = event.notification.data?.url || '/app.html';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes('/app') && 'focus' in client) {
          client.postMessage({ type: 'NOTIFICATION_CLICK', data: event.notification.data });
          return client.focus();
        }
      }
      return clients.openWindow(urlToOpen);
    })
  );
});

// Periodic sync
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'refresh-critical-data') {
    event.waitUntil(refreshCriticalData());
  }
});

async function refreshCriticalData() {
  const cache = await caches.open(API_CACHE);
  const highPriorityRoutes = Object.entries(API_CACHE_CONFIG)
    .filter(([_, config]) => config.priority === 'high')
    .map(([route]) => route);
  
  for (const route of highPriorityRoutes) {
    try {
      const response = await fetch(route);
      if (response.ok) {
        const headers = new Headers(response.headers);
        headers.set('x-cached-at', Date.now().toString());
        const cachedBody = await response.blob();
        await cache.put(route, new Response(cachedBody, { status: response.status, statusText: response.statusText, headers }));
      }
    } catch (error) {}
  }
}

// Message handler
self.addEventListener('message', (event) => {
  const { type } = event.data || {};
  
  switch (type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;
    case 'GET_PENDING_SYNC_COUNT':
      openOfflineDB().then(db => {
        const tx = db.transaction('pendingRequests', 'readonly');
        const req = tx.objectStore('pendingRequests').count();
        req.onsuccess = () => event.source.postMessage({ type: 'PENDING_SYNC_COUNT', count: req.result });
      });
      break;
    case 'CLEAR_CACHE':
      Promise.all([caches.delete(API_CACHE), caches.delete(DYNAMIC_CACHE)])
        .then(() => event.source.postMessage({ type: 'CACHE_CLEARED' }));
      break;
    case 'FORCE_SYNC':
      syncPendingRequestsWithConflictResolution()
        .then(results => event.source.postMessage({ type: 'SYNC_COMPLETE', results }));
      break;
  }
});

console.log('[SW] Service Worker v' + CACHE_VERSION + ' loaded - SafetyFirst EHS');
