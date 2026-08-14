/* Offline.
 *
 * The overdose-response steps are needed most in exactly the situations where
 * a connection is least reliable. Until this file existed, the "app" was a
 * bookmark that white-screened offline - and app.js already cleared caches in
 * Quick Exit as though a service worker existed. Now one does.
 *
 * Privacy rules this file must keep:
 *   - Same-origin only. Nothing else is ever requested (CSP enforces it),
 *     so nothing else is ever cached.
 *   - Cache names are versioned and unrevealing. The cache holds the same
 *     byte-identical bundle every visitor gets - it cannot say what anyone
 *     looked AT, only that the app was installed.
 *   - Quick Exit calls caches.delete() from the page; nothing here resists it.
 *
 * Strategy: precache the shell on install; then stale-while-revalidate for
 * everything same-origin. The reader always gets an instant (possibly
 * day-old) copy while a fresh one is fetched behind it - right for data that
 * updates hourly and must never block an emergency lookup on the network.
 */

/* Bump this on any release that changes the shell. Stale-while-revalidate
   means a returning reader gets the CACHED shell first, so without a bump the
   Nightlight rename would have shown them the old name for one more visit.
   Changing it drops the previous cache on activate, and skipWaiting +
   clients.claim below make that take effect on this visit rather than the
   next one. */
/* The suffix is a hash of every JS, CSS and index.html file under site/ -
   exactly the set where serving a stale copy is a BUG rather than merely old
   data. test/sw.test.mjs recomputes it and fails if this string is out of
   date, printing the value to paste in.

   That test exists because relying on the instruction above did not work.
   Near me was fixed, deployed, and STILL broken for anyone who had opened the
   app before: stale-while-revalidate served the cached alerts.js first, and
   that copy still imported the old src/locate.mjs path that the /src/* 404
   rule had killed. Verified in the live cache - cachedImportsOldPath: true.
   A comment saying "remember to bump this" is not a mechanism. */
const VERSION = "nl-2d6a5376";

/* The minimum set that makes every screen renderable offline. Data files are
   picked up on first use by the runtime cache. */
const SHELL = [
  "./",
  "./index.html",
  "./css/app.css",
  "./js/app.js",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* What may be written to the device.
 *
 * The header above claims this cache "cannot say what anyone looked AT". That
 * was only incidentally true: the handler cached every same-origin GET, so any
 * URL containing a county or a substance would have been written into Cache
 * Storage and left there, readable on a seized device until Quick Exit ran.
 *
 * An allowlist makes the claim structural instead of lucky. Everything the app
 * legitimately needs is byte-identical for every reader - the shell, the
 * national data bundles, the locale files. Nothing per-county is cacheable,
 * and `/feeds/` is called out because those files are the one per-county path
 * that exists on this origin at all. */
/* The i18n group is not decoration. The comment above has always claimed the
   locale files are covered, and the pattern could not match them: `[^/]+`
   stops at the directory separator, so data/i18n/en-US.json was never
   cacheable. Mostly latent, because the boot sweep wipes the cache anyway -
   but setLocale() re-fetches, so switching language offline mid-session failed
   both the target locale AND the en-US fallback, leaving `strings` empty and
   re-rendering the whole interface as raw dot-paths: "nav.help",
   "alerts.heading". Still one file per language, still identical for every
   reader, so nothing about the allowlist's guarantee changes. */
/* .bin as well as .json: the precomputed county mesh ships as a packed
   Float32 blob (data/county-mesh.bin). Same national, byte-identical shape
   as every other bundle here - it says nothing about who looked at what -
   and without it the map falls back to rebuilding the mesh from
   county-shapes.json, which is a 3.9s main-thread freeze. */
const CACHEABLE = /^\.?\/?(index\.html|css\/|js\/|img\/|data\/(i18n\/)?[^/]+\.(json|bin)$|manifest\.webmanifest)/;

function mayCache(url) {
  const path = url.pathname.replace(/^.*\/site\//, "");
  if (path === "" || path === "/") return true;          // the shell itself
  if (/(^|\/)feeds\//.test(url.pathname)) return false;  // per-county: never
  if (/(^|\/)data\/counties\//.test(url.pathname)) return false;
  return CACHEABLE.test(path);
}

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;

  e.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const cacheOk = mayCache(url);
      const cached = cacheOk ? await cache.match(e.request) : null;
      const refresh = fetch(e.request)
        .then((res) => {
          if (res.ok && cacheOk) cache.put(e.request, res.clone());
          return res;
        })
        .catch(() => null);

      /* Serve cache instantly when there is one; fall back to the network
         while populating the cache when there is not. A navigation with
         neither gets the shell, so deep links still open offline. */
      return cached
        || (await refresh)
        || (e.request.mode === "navigate" ? cache.match("./index.html") : Response.error());
    })
  );
});
