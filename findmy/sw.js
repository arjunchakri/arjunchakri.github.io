// Service Worker for Find My PWA
// VERSION 2.0 - Change this to force update
const CACHE_VERSION = 'v2';
const CACHE_NAME = `findmy-${CACHE_VERSION}`;

const urlsToCache = [
    './',
    './index.html',
    './manifest.json',
    './icon.svg'
];

// External resources (cache but allow network updates)
const externalResources = [
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
    'https://fonts.googleapis.com/css2?family=Outfit'
];

// Install event - cache core files
self.addEventListener('install', (event) => {
    console.log(`[SW] Installing ${CACHE_NAME}`);
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[SW] Caching core files');
                return cache.addAll(urlsToCache);
            })
            .catch(err => {
                console.log('[SW] Cache failed:', err);
            })
    );
    // Force the waiting service worker to become active
    self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    console.log(`[SW] Activating ${CACHE_NAME}`);
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    // Delete any old findmy caches
                    if (cacheName.startsWith('findmy-') && cacheName !== CACHE_NAME) {
                        console.log(`[SW] Deleting old cache: ${cacheName}`);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    // Take control of all pages immediately
    self.clients.claim();
    
    // Notify all clients about the update
    self.clients.matchAll().then(clients => {
        clients.forEach(client => {
            client.postMessage({ type: 'SW_UPDATED', version: CACHE_VERSION });
        });
    });
});

// Fetch event - Network-first for HTML, Cache-first for assets
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    
    // Skip non-GET requests
    if (event.request.method !== 'GET') {
        return;
    }
    
    // Skip Firebase and other API requests
    if (url.hostname.includes('firebase') || 
        url.hostname.includes('googleapis.com') ||
        url.hostname.includes('gstatic.com')) {
        return;
    }
    
    // Network-first for HTML files (always get latest app code)
    if (event.request.mode === 'navigate' || 
        url.pathname.endsWith('.html') || 
        url.pathname === '/' ||
        url.pathname.endsWith('/')) {
        event.respondWith(
            fetch(event.request)
                .then((response) => {
                    // Clone and cache the new response
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseClone);
                    });
                    return response;
                })
                .catch(() => {
                    // Fallback to cache if network fails
                    return caches.match(event.request)
                        .then(response => response || caches.match('./index.html'));
                })
        );
        return;
    }
    
    // Cache-first for static assets (JS, CSS, images)
    event.respondWith(
        caches.match(event.request)
            .then((cachedResponse) => {
                if (cachedResponse) {
                    // Return cached version, but also fetch and update cache in background
                    fetch(event.request).then((networkResponse) => {
                        if (networkResponse && networkResponse.status === 200) {
                            caches.open(CACHE_NAME).then((cache) => {
                                cache.put(event.request, networkResponse);
                            });
                        }
                    }).catch(() => {});
                    return cachedResponse;
                }
                
                // Not in cache, fetch from network
                return fetch(event.request)
                    .then((response) => {
                        if (!response || response.status !== 200) {
                            return response;
                        }
                        
                        // Cache the new resource
                        const responseClone = response.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            if (event.request.url.startsWith(self.location.origin) ||
                                externalResources.some(r => event.request.url.includes(r))) {
                                cache.put(event.request, responseClone);
                            }
                        });
                        
                        return response;
                    })
                    .catch(() => {
                        // Return offline fallback for navigation
                        if (event.request.mode === 'navigate') {
                            return caches.match('./index.html');
                        }
                        return null;
                    });
            })
    );
});

// Listen for skip waiting message from the app
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

// Background sync for location updates (if supported)
self.addEventListener('sync', (event) => {
    if (event.tag === 'location-sync') {
        event.waitUntil(syncLocation());
    }
});

async function syncLocation() {
    console.log('[SW] Background sync triggered');
}
