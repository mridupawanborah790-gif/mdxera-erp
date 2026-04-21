const CACHE_NAME = 'mdxera-cache-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  'https://sblmbkgoiefqzykjksgm.supabase.co/storage/v1/object/public/logos/ChatGPT%20Image%20Feb%203,%202026,%2009_44_47%20PM%20(1).png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // NEVER intercept API calls or specific cross-origin essential services
  if (
    event.request.method !== 'GET' || 
    url.hostname.includes('supabase.co') || 
    url.hostname.includes('supabase.com') ||
    url.hostname.includes('googleapis') ||
    url.hostname.includes('google.com') ||
    url.hostname.includes('gstatic') ||
    url.hostname.includes('generativelanguage') ||
    url.hostname.includes('razorpay') ||
    url.hostname.includes('postalpincode.in') ||
    url.pathname.includes('/api/') ||
    url.pathname.includes('/rest/v1/')
  ) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        if (response) return response;

        return fetch(event.request)
          .then((response) => {
            if (!response || response.status !== 200 || response.type !== 'basic') {
              // Special case for our cross-origin icon if we want to cache it on first fetch
              if (url.pathname.includes('PM%20(1).png')) {
                  return response;
              }
              return response;
            }
            return response;
          })
          .catch((err) => {
            console.warn('[SW] Fetch failed:', err, event.request.url);
            if (event.request.mode === 'navigate') {
               return caches.match('/');
            }
            // If it's an API call that somehow got here, re-throw to trigger catch blocks in services
            if (url.hostname.includes('supabase') || url.hostname.includes('googleapis')) {
                throw err;
            }
            return new Response('Network error occurred in Service Worker', { 
                status: 408,
                headers: { 'Content-Type': 'text/plain' }
            });
          });
      })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});