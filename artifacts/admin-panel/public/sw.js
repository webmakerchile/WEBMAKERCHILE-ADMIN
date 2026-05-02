// WebMakerAdmin service worker
// Strategy:
//   - Static assets / SPA shell: stale-while-revalidate.
//   - Navigation requests: network-first, fall back to cached "/" shell.
//   - API GETs: network-first with a short cache fallback so the dashboard /
//     videos lists remain readable offline (writes always bypass cache).
//   - Push: render a notification, message clients so the bell refreshes.
//   - Notification click: focus an existing tab or open the link.

const VERSION = "wmadmin-v3";
const STATIC_CACHE = `${VERSION}-static`;
const RUNTIME_CACHE = `${VERSION}-runtime`;
const API_CACHE = `${VERSION}-api`;

const PRECACHE_URLS = [
  "/",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
  "/favicon.svg",
];

const API_GET_ALLOWLIST = [
  "/api/content/videos",
  "/api/auth/me",
  "/api/onboarding/checklist",
  "/api/notifications",
  "/api/saved-views",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) =>
        Promise.all(
          PRECACHE_URLS.map((url) =>
            cache.add(url).catch((err) => console.warn("[SW] precache failed", url, err)),
          ),
        ),
      ),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => !k.startsWith(VERSION))
          .map((k) => caches.delete(k)),
      ),
    ),
  );
  self.clients.claim();
});

function isApiAllowlisted(url) {
  return API_GET_ALLOWLIST.some((p) => url.pathname.startsWith(p));
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Navigation requests → serve the SPA shell when offline.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const clone = res.clone();
          caches.open(RUNTIME_CACHE).then((c) => c.put(req, clone));
          return res;
        })
        .catch(async () => {
          const cached = await caches.match(req);
          if (cached) return cached;
          const shell = await caches.match("/");
          if (shell) return shell;
          return new Response("Sin conexión", {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          });
        }),
    );
    return;
  }

  // API GETs → network-first with cache fallback for the allowlist only.
  if (url.pathname.startsWith("/api/")) {
    if (!isApiAllowlisted(url)) return; // Let the browser handle it normally.
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(API_CACHE).then((c) => c.put(req, clone));
          }
          return res;
        })
        .catch(() => caches.match(req).then((m) => m || new Response("[]", {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }))),
    );
    return;
  }

  // Static / SPA assets → stale-while-revalidate.
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(RUNTIME_CACHE).then((c) => c.put(req, clone));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});

// ----- Web Push -----

self.addEventListener("push", (event) => {
  let payload = { title: "Notificación", body: "", link: "/" };
  if (event.data) {
    try {
      payload = { ...payload, ...event.data.json() };
    } catch {
      payload.body = event.data.text();
    }
  }

  const tag = payload.tag || "wma-notif";
  const promise = self.registration
    .showNotification(payload.title || "WebMakerAdmin", {
      body: payload.body || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag,
      data: { link: payload.link || "/" },
      renotify: true,
    })
    .then(() =>
      self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
        clients.forEach((c) => c.postMessage({ type: "push-received", payload }));
      }),
    );

  event.waitUntil(promise);
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = event.notification.data?.link || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.postMessage({ type: "notification-click", link });
          // Try to navigate the existing tab; not all platforms allow it.
          if ("navigate" in client) {
            try {
              client.navigate(link);
            } catch {}
          }
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(link);
      return null;
    }),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "skipWaiting" || event.data?.type === "skipWaiting") {
    self.skipWaiting();
  }
});
