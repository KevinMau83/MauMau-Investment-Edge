// Owner pages and API responses deliberately bypass offline storage.
self.addEventListener("install", event => event.waitUntil(self.skipWaiting()));
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", event => {
  if (event.request.method === "GET" && event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).catch(() => new Response(
      "Investment Edge is offline. Reconnect to open your private workspace.",
      { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } }
    )));
  }
});
