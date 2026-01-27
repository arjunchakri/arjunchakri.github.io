// Notes App Service Worker
const CACHE_NAME = 'notes-v1';
const STATIC_ASSETS = [
    './',
    './index.html',
    './app.js',
    './styles.css',
    './manifest.json',
    './icon.svg'
];

// Install - cache static assets
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('[SW] Caching static assets');
                return cache.addAll(STATIC_ASSETS);
            })
            .then(() => self.skipWaiting())
    );
});

// Activate - clean old caches
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys
                    .filter(key => key.startsWith('notes-') && key !== CACHE_NAME)
                    .map(key => {
                        console.log('[SW] Removing old cache:', key);
                        return caches.delete(key);
                    })
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch - network first for API, cache first for assets
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);
    
    // Skip non-GET requests
    if (event.request.method !== 'GET') return;
    
    // Skip Firebase/external API requests - always network
    if (url.hostname.includes('firebase') || 
        url.hostname.includes('gstatic') ||
        url.hostname.includes('googleapis') ||
        url.hostname.includes('esm.sh') ||
        url.hostname.includes('cdn.jsdelivr.net')) {
        return;
    }
    
    // For same-origin static assets - cache first, then network
    if (url.origin === location.origin) {
        event.respondWith(
            caches.match(event.request)
                .then(cached => {
                    if (cached) {
                        // Return cached, but also update cache in background
                        fetch(event.request)
                            .then(response => {
                                if (response && response.status === 200) {
                                    caches.open(CACHE_NAME).then(cache => {
                                        cache.put(event.request, response);
                                    });
                                }
                            })
                            .catch(() => {});
                        return cached;
                    }
                    
                    // Not cached, fetch and cache
                    return fetch(event.request)
                        .then(response => {
                            if (!response || response.status !== 200) {
                                return response;
                            }
                            const responseClone = response.clone();
                            caches.open(CACHE_NAME).then(cache => {
                                cache.put(event.request, responseClone);
                            });
                            return response;
                        });
                })
        );
    }
});

// Handle offline navigation
self.addEventListener('fetch', event => {
    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request)
                .catch(() => caches.match('./index.html'))
        );
    }
});
