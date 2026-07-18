"use strict";
/*
 * Service worker: alles voorgecachet, cache-first. Nieuwe release =
 * CACHE-versie ophogen; activate ruimt oude caches op.
 */
var CACHE = "mtrex-loon-v7";
var ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./engine.js",
  "./params.js",
  "./storage.js",
  "./manifest.webmanifest",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (cache) { return cache.addAll(ASSETS); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (namen) {
      return Promise.all(namen.filter(function (n) { return n !== CACHE; }).map(function (n) { return caches.delete(n); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(function (hit) {
      if (hit) return hit;
      if (e.request.mode === "navigate") return caches.match("./index.html");
      return fetch(e.request);
    })
  );
});
