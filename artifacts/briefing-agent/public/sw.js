const CACHE_PREFIX = 'briefing-agent-pwa-';
const CACHE_NAME = `${CACHE_PREFIX}shell-v2`;

function isCacheableResponse(response) {
  if (!response.ok || response.redirected) return false;
  const cacheControl = response.headers.get('Cache-Control') ?? '';
  return !/(?:no-store|private)/i.test(cacheControl);
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    const appShell = new URL('./', self.registration.scope).href;
    try {
      const response = await fetch(appShell, { credentials: 'omit', cache: 'reload' });
      if (isCacheableResponse(response)) await cache.put(appShell, response.clone());
    } catch {
      // Installation can complete, but offline startup will need a later online visit.
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
        .map((key) => caches.delete(key)),
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const requestUrl = new URL(request.url);
  const scopeUrl = new URL(self.registration.scope);
  if (requestUrl.origin !== scopeUrl.origin || !requestUrl.pathname.startsWith(scopeUrl.pathname)) return;
  if (requestUrl.pathname.split('/').includes('api')) return;
  if (requestUrl.search !== '') return;
  if (request.headers?.has('authorization')) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        return await fetch(request);
      } catch {
        // Navigation requests may contain session state; fall back only to the public app shell.
        return (await cache.match(new URL('./', self.registration.scope).href)) ??
          new Response('Briefing Agent is offline. Reconnect to use sign-in, search, and saved sources.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          });
      }
    })());
    return;
  }

  if (!['script', 'style', 'image', 'font'].includes(request.destination)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) return cached;

    const response = await fetch(request);
    if (isCacheableResponse(response)) await cache.put(request, response.clone());
    return response;
  })());
});
