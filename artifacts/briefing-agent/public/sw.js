const CACHE_PREFIX = 'briefing-agent-pwa-';
const CACHE_NAME = `${CACHE_PREFIX}shell-v1`;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    const appShell = new URL('./', self.registration.scope).href;
    await cache.add(appShell).catch(() => undefined);
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

self.addEventListener('sync', (event) => {
  if (event.tag !== 'briefing-agent-shell-refresh') return;
  event.waitUntil(refreshAppShell());
});

self.addEventListener('periodicsync', (event) => {
  if (event.tag !== 'briefing-agent-shell-refresh') return;
  event.waitUntil(refreshAppShell());
});

self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    const openWindows = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true,
    });
    if (openWindows.some((client) => client.focused && client.visibilityState === 'visible')) {
      return;
    }

    await self.registration.showNotification('Brief ready', {
      body: 'A manually started briefing is ready in Briefing Agent.',
      icon: new URL('./app-icon-192.png', self.registration.scope).href,
      badge: new URL('./app-icon-192.png', self.registration.scope).href,
      tag: `briefing-ready-${Date.now()}`,
      data: { url: new URL('./user-portal', self.registration.scope).href },
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const destination = new URL('./user-portal', self.registration.scope).href;
    const openWindows = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true,
    });
    const existing = openWindows.find((client) => client.url.startsWith(self.registration.scope));
    if (existing) {
      await existing.focus();
      return;
    }
    await self.clients.openWindow(destination);
  })());
});

self.addEventListener('notificationclose', () => {
  // No user data is stored when a notification is dismissed.
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const requestUrl = new URL(request.url);
  const scopeUrl = new URL(self.registration.scope);
  if (requestUrl.origin !== scopeUrl.origin || !requestUrl.pathname.startsWith(scopeUrl.pathname)) return;
  if (requestUrl.pathname.split('/').includes('api')) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const response = await fetch(request);
        if (response.ok) await cache.put(request, response.clone());
        return response;
      } catch {
        return (await cache.match(request)) ??
          (await cache.match(new URL('./', self.registration.scope).href)) ??
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
    try {
      const response = await fetch(request);
      if (response.ok) await cache.put(request, response.clone());
      return response;
    } catch {
      return (await cache.match(request)) ?? Response.error();
    }
  })());
});

async function refreshAppShell() {
  const appShell = new URL('./', self.registration.scope).href;
  const response = await fetch(appShell, { cache: 'no-store' });
  if (!response.ok) throw new Error('The app shell could not be refreshed.');
  const cache = await caches.open(CACHE_NAME);
  await cache.put(appShell, response);
}
