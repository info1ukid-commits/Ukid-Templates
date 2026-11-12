const CACHE = "ukid-v8";
const BASE_PATH = new URL("./", self.location).pathname;
const APP_FILES = [
  "index.html",
  "404.html",
  "about.html",
  "academy.html",
  "admin-lessons.html",
  "contact.html",
  "courses.html",
  "dashboard.html",
  "learn-workspace.html",
  "my-templates.html",
  "offline.html",
  "privacy.html",
  "services.html",
  "signup.html",
  "terms.html",
  "templates.html",
  "dashboard.css",
  "dashboard.js",
  "firebase-config.js",
  "my-templates.css",
  "my-templates.js",
  "pwa.js",
  "script.js",
  "style.css",
  "templates.js",
  "manifest.json",
  "1.jpg",
  "CodeVault Coding Templates Logo.png",
  "ukid-icon-192.png",
  "ukid-icon-512.png"
];
const CDN_ORIGINS = new Set([
  "https://cdnjs.cloudflare.com",
  "https://cdn.jsdelivr.net",
  "https://fonts.googleapis.com",
  "https://fonts.gstatic.com",
  "https://www.gstatic.com"
]);

async function cacheResponse(request, response) {
  if (!response.ok && response.type !== "opaque") return;
  const cache = await caches.open(CACHE);
  await cache.put(request, response);
}

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(APP_FILES.map(file => new URL(file, self.registration.scope).href)))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key.startsWith("ukid-") && key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  const isSameOriginAppRequest = url.origin === self.location.origin
    && url.pathname.startsWith(BASE_PATH)
    && !url.pathname.startsWith(`${BASE_PATH}api/`);

  if (isSameOriginAppRequest && request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          event.waitUntil(cacheResponse(request, response.clone()).catch(error => {
            console.warn("Unable to cache page for offline use.", error);
          }));
        }
        return response;
      } catch {
        const cached = await caches.match(request, { ignoreSearch: true });
        if (cached) return cached;

        if (url.pathname === BASE_PATH || url.pathname === `${BASE_PATH}index.html`) {
          const home = await caches.match(new URL("index.html", self.registration.scope).href);
          if (home) return home;
        }

        return (await caches.match(new URL("offline.html", self.registration.scope).href))
          || new Response("You are offline. Reconnect and try again.", {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8" }
          });
      }
    })());
    return;
  }

  const isMonacoAsset = url.origin === "https://cdn.jsdelivr.net"
    && url.pathname.includes("/monaco-editor@");
  const isCacheableCdnRequest = CDN_ORIGINS.has(url.origin)
    && (["font", "image", "script", "style", "worker"].includes(request.destination) || isMonacoAsset);
  if (!isSameOriginAppRequest && !isCacheableCdnRequest) return;

  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) {
      event.waitUntil(fetch(request).then(response => cacheResponse(request, response.clone())).catch(() => undefined));
      return cached;
    }

    const response = await fetch(request);
    if (response.ok || response.type === "opaque") {
      event.waitUntil(cacheResponse(request, response.clone()).catch(error => {
        console.warn("Unable to cache a resource for offline use.", error);
      }));
    }
    return response;
  })());
});
