// Service Worker for DailyTrack PWA
const CACHE_NAME = 'DailyTrack-v2.0.0';
const OFFLINE_URL = 'offline.html';
const API_CACHE_NAME = 'DailyTrack-api-v1';

// Assets to cache on install
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/offline.html',
  '/app.js',
  '/db.js',
  '/sync.js',
  '/styles/components.css',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap'
];

// Network timeout in milliseconds
const NETWORK_TIMEOUT = 5000;

// Install event - cache assets
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installing...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[Service Worker] Caching app shell');
        return cache.addAll(PRECACHE_ASSETS);
      })
      .then(() => {
        console.log('[Service Worker] Install completed');
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('[Service Worker] Install failed:', error);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating...');
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName !== API_CACHE_NAME) {
            console.log('[Service Worker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('[Service Worker] Activation completed');
      return self.clients.claim();
    })
  );
});

// Network first, falling back to cache strategy for API calls
async function networkFirstWithTimeout(request) {
  try {
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Network timeout')), NETWORK_TIMEOUT);
    });

    const networkPromise = fetch(request);
    const response = await Promise.race([networkPromise, timeoutPromise]);
    
    // Cache successful API responses
    if (response.ok && request.url.includes('/api/')) {
      const cache = await caches.open(API_CACHE_NAME);
      cache.put(request, response.clone());
    }
    
    return response;
  } catch (error) {
    console.log('[Service Worker] Network failed, trying cache:', error);
    
    // Try cache for API requests
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // For API calls, return offline response
    if (request.url.includes('/api/')) {
      return new Response(
        JSON.stringify({ 
          offline: true, 
          message: 'You are offline. Data will sync when you reconnect.' 
        }),
        { 
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
    
    // For navigation requests, return offline page
    if (request.mode === 'navigate') {
      return caches.match(OFFLINE_URL);
    }
    
    throw error;
  }
}

// Cache first, falling back to network for static assets
async function cacheFirst(request) {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }
  
  try {
    const networkResponse = await fetch(request);
    
    // Cache new assets
    if (networkResponse.ok && request.url.startsWith(self.location.origin)) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    // If both cache and network fail, return offline page for navigation
    if (request.mode === 'navigate') {
      return caches.match(OFFLINE_URL);
    }
    
    throw error;
  }
}

// Fetch event - strategy router
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Skip non-GET requests and browser extensions
  if (event.request.method !== 'GET' || url.protocol === 'chrome-extension:') {
    return;
  }
  
  // API calls use network-first strategy
  if (url.pathname.startsWith('/api/') || url.hostname === 'api.DailyTrack.com') {
    event.respondWith(networkFirstWithTimeout(event.request));
    return;
  }
  
  // Static assets use cache-first strategy
  if (
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.jpg') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.includes('/fonts/') ||
    url.hostname.includes('cdnjs.cloudflare.com')
  ) {
    event.respondWith(cacheFirst(event.request));
    return;
  }
  
  // Everything else (HTML pages) use network-first
  event.respondWith(networkFirstWithTimeout(event.request));
});

// Background sync for offline actions
self.addEventListener('sync', (event) => {
  console.log('[Service Worker] Background sync:', event.tag);
  
  if (event.tag === 'sync-tasks') {
    event.waitUntil(syncTasks());
  } else if (event.tag === 'sync-expenses') {
    event.waitUntil(syncExpenses());
  } else if (event.tag === 'sync-journal') {
    event.waitUntil(syncJournal());
  }
});

// Push notifications
self.addEventListener('push', (event) => {
  console.log('[Service Worker] Push received:', event);
  
  if (!event.data) return;
  
  const data = event.data.json();
  const options = {
    body: data.body,
    icon: '/icons/icon-192x192.png',
    badge: '/icons/badge-72x72.png',
    vibrate: [200, 100, 200],
    data: {
      url: data.url || '/'
    },
    actions: [
      {
        action: 'view',
        title: 'View'
      },
      {
        action: 'dismiss',
        title: 'Dismiss'
      }
    ]
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  console.log('[Service Worker] Notification click:', event.notification.tag);
  
  event.notification.close();
  
  if (event.action === 'dismiss') {
    return;
  }
  
  // Focus or open the app
  event.waitUntil(
    clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === '/' && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(event.notification.data.url);
      }
    })
  );
});

// Periodic background sync (if supported)
if (self.registration && self.registration.periodicSync) {
  self.addEventListener('periodicsync', (event) => {
    if (event.tag === 'daily-sync') {
      console.log('[Service Worker] Running daily sync');
      event.waitUntil(performDailySync());
    }
  });
}

// Sync functions
async function syncTasks() {
  const db = await openDatabase();
  const offlineTasks = await getAllFromStore(db, 'tasks', 'sync');
  
  for (const task of offlineTasks) {
    try {
      await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(task)
      });
      
      // Mark as synced
      await updateInStore(db, 'tasks', { ...task, sync: 'synced' });
    } catch (error) {
      console.error('Failed to sync task:', error);
    }
  }
}

async function syncExpenses() {
  // Similar implementation for expenses
}

async function syncJournal() {
  // Similar implementation for journal
}

async function performDailySync() {
  await Promise.all([
    syncTasks(),
    syncExpenses(),
    syncJournal()
  ]);
}

// Database helper functions
function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('DailyTrackDB', 2);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      if (!db.objectStoreNames.contains('tasks')) {
        const store = db.createObjectStore('tasks', { keyPath: 'id' });
        store.createIndex('by-date', 'createdAt');
        store.createIndex('by-sync', 'sync');
      }
      
      if (!db.objectStoreNames.contains('expenses')) {
        const store = db.createObjectStore('expenses', { keyPath: 'id' });
        store.createIndex('by-date', 'date');
        store.createIndex('by-category', 'category');
      }
      
      if (!db.objectStoreNames.contains('habits')) {
        const store = db.createObjectStore('habits', { keyPath: 'id' });
        store.createIndex('by-streak', 'currentStreak');
      }
      
      if (!db.objectStoreNames.contains('journal')) {
        const store = db.createObjectStore('journal', { keyPath: 'id' });
        store.createIndex('by-date', 'date');
      }
      
      if (!db.objectStoreNames.contains('syncQueue')) {
        const store = db.createObjectStore('syncQueue', { 
          keyPath: 'id',
          autoIncrement: true 
        });
        store.createIndex('by-type', 'type');
      }
    };
    
    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => reject(event.target.error);
  });
}

function getAllFromStore(db, storeName, indexName) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], 'readonly');
    const store = transaction.objectStore(storeName);
    const index = indexName ? store.index(indexName) : store;
    const request = index.getAll();
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function updateInStore(db, storeName, item) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.put(item);
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}