/* Service Worker – Circolari PWA
 *
 * Strategia:
 *   - Precache dei core asset (app shell).
 *   - Network-first per navigazioni HTML (aggiorna sempre la UI).
 *   - Stale-while-revalidate per JS/CSS/statici.
 *   - Cache-first per icone/manifest.
 *   - Le API (/api/events...) vanno sempre in rete: niente cache.
 *   - Gestione push notification (se arrivate dal server).
 */
const VERSION = "v1.0.0";
const CORE_CACHE = `circolari-core-${VERSION}`;
const STATIC_CACHE = `circolari-static-${VERSION}`;
const IMG_CACHE = `circolari-img-${VERSION}`;

const CORE_ASSETS = [
  "/",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
  "/favicon.ico",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CORE_CACHE);
      await Promise.all(
        CORE_ASSETS.map(async (url) => {
          try {
            const res = await fetch(url, { cache: "reload" });
            if (res && res.ok) await cache.put(url, res.clone());
          } catch (e) {
            /* network failure during install: ignore */
          }
        }),
      );
      self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter(
            (k) =>
              k !== CORE_CACHE &&
              k !== STATIC_CACHE &&
              k !== IMG_CACHE,
          )
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Mai cache per le API
  if (url.pathname.startsWith("/api/")) return;

  // Solo same-origin
  if (url.origin !== self.location.origin) return;

  // Navigazioni HTML -> network-first
  if (req.mode === "navigate" || req.headers.get("accept")?.includes("text/html")) {
    event.respondWith(networkFirstHtml(req));
    return;
  }

  // Immagini e icone -> cache-first
  if (
    req.destination === "image" ||
    /\.(?:png|jpg|jpeg|gif|svg|webp|ico)$/i.test(url.pathname)
  ) {
    event.respondWith(cacheFirst(req, IMG_CACHE));
    return;
  }

  // Tutto il resto (JS/CSS/font) -> stale-while-revalidate
  event.respondWith(swr(req, STATIC_CACHE));
});

async function networkFirstHtml(req) {
  try {
    const fresh = await fetch(req);
    const cache = await caches.open(CORE_CACHE);
    cache.put("/", fresh.clone()).catch(() => {});
    return fresh;
  } catch {
    const cache = await caches.open(CORE_CACHE);
    return (
      (await cache.match(req)) ||
      (await cache.match("/")) ||
      Response.error()
    );
  }
}

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  if (cached) return cached;
  try {
    const fresh = await fetch(req);
    if (fresh && fresh.ok) cache.put(req, fresh.clone());
    return fresh;
  } catch {
    return cached || Response.error();
  }
}

async function swr(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  const fetchPromise = fetch(req)
    .then((fresh) => {
      if (fresh && fresh.ok) cache.put(req, fresh.clone());
      return fresh;
    })
    .catch(() => cached);
  return cached || fetchPromise;
}

/* Notifiche: click apre l'app e focalizza l'evento se possibile. */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/";
  event.waitUntil(
    (async () => {
      const all = await clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of all) {
        if ("focus" in client) {
          client.postMessage({
            type: "notificationclick",
            url: targetUrl,
          });
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })(),
  );
});

/* Push (server -> PWA). Payload JSON: { title, body, data? } */
self.addEventListener("push", (event) => {
  let data = { title: "Circolari", body: "Hai un nuovo avviso" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    if (event.data) data.body = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: data.data || {},
      vibrate: [80, 40, 80],
    }),
  );
});
