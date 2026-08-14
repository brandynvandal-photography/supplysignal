/* The URL scheme.
 *
 * Two things are being protected here and only one of them is cosmetic.
 *
 * The cosmetic one: /alerts instead of /site/#/alerts.
 *
 * The other one is the reason this file is long. Only the SECTION may live in
 * the path. A path is transmitted and lands in the host's access log; a
 * fragment never leaves the browser. PRIVACY.md section 1 calls a log
 * containing "IP -> 47065" a disaster and section 3 promises county and
 * substance stay after the #. A refactor that moved a county into the path
 * would look tidy, pass every other test, and quietly break the promise the
 * whole app is built on - so there is a check below that fails if a five-digit
 * FIPS or a substance id ever appears left of the fragment.
 *
 * And every legacy URL still has to work. 3,231 per-county RSS feeds publish
 * nightlight.help/#/47065, the Capacitor build has no server to rewrite paths,
 * and links people already shared are in messages nobody can edit.
 */

import {
  PATHS, SEGMENTS, parseRoute, toUrl, canonicalUrl, decode, DEFAULT_DAYS,
} from "../site/js/routes.js";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const cases = [];
const check = (name, fn) => cases.push({ name, fn });
const url = (u) => {
  const [p, h] = String(u).split("#");
  return { pathname: p || "/", hash: h ? "#" + h : "" };
};

/* ------------------------------------------------------------ canonical */

/* from -> what the address bar should end up showing. */
const CANON = [
  ["/",                        "/alerts"],
  ["/alerts",                  "/alerts"],
  ["/sos",                     "/sos"],
  ["/drugs",                   "/drugs"],
  ["/alerts#/47065",           "/alerts#/47065"],
  ["/alerts#/47065/30",        "/alerts#/47065/30"],
  ["/alerts#/map",             "/alerts#/map"],
  ["/drugs#/class/opioids",    "/drugs#/class/opioids"],

  /* Legacy. None of these can be edited after the fact. */
  ["/site/",                   "/alerts"],
  ["/site/#/test",             "/test"],
  ["/#/47065",                 "/alerts#/47065"],       // every RSS feed
  ["/#/47065/30",              "/alerts#/47065/30"],
  ["/#/alerts/17031",          "/alerts#/17031"],
  ["/#/alerts/map",            "/alerts#/map"],
  ["/#/substances/fentanyl",   "/drugs#/fentanyl"],
  ["/#/help",                  "/sos"],
  ["/#/heat",                  "/heat"],
];

for (const [from, want] of CANON) {
  check(`canonical  ${from}  ->  ${want}`, () => {
    const got = canonicalUrl(url(from), true);
    return got === want ? null : `got ${got}`;
  });
}

check("canonicalising twice changes nothing", () => {
  const bad = [];
  for (const [from] of CANON) {
    const once = canonicalUrl(url(from), true);
    const twice = canonicalUrl(url(once), true);
    if (once !== twice) bad.push(`${from}: ${once} -> ${twice}`);
  }
  return bad.length ? bad.join("; ") : null;
});

/* ------------------------------------------------------------- the promise */

check("no county or substance ever appears in the path", () => {
  /* The check this file exists for. */
  const selections = ["47065", "17031", "06085", "fentanyl", "xylazine", "class/opioids"];
  const bad = [];
  for (const sel of selections) {
    for (const from of [`/#/${sel}`, `/#/alerts/${sel}`, `/#/substances/${sel}`,
                        `/alerts#/${sel}`, `/drugs#/${sel}`]) {
      const got = canonicalUrl(url(from), true) || "";
      const pathPart = got.split("#")[0];
      if (pathPart.includes(sel.split("/")[0])) bad.push(`${from} -> ${got}`);
    }
  }
  return bad.length ? `selection leaked into the path: ${bad.join("; ")}` : null;
});

check("every path segment is a section name and nothing else", () => {
  /* If a future segment is ever anything but a fixed section, it is by
     definition something about the reader. */
  const bad = Object.keys(PATHS).filter((seg) => !/^[a-z-]+$/.test(seg));
  return bad.length ? bad.join(", ") : null;
});

/* ------------------------------------------------------------- parseRoute */

check("path form and hash form parse identically", () => {
  const pairs = [
    ["/alerts#/47065",        "/#/alerts/47065"],
    ["/alerts#/47065/30",     "/#/alerts/47065/30"],
    ["/alerts#/map",          "/#/alerts/map"],
    ["/drugs#/fentanyl",      "/#/substances/fentanyl"],
    ["/sos",                  "/#/help"],
    ["/heat",                 "/#/heat"],
  ];
  const bad = [];
  for (const [p, h] of pairs) {
    const a = JSON.stringify(parseRoute(url(p), true));
    const b = JSON.stringify(parseRoute(url(h), true));
    if (a !== b) bad.push(`${p} => ${a}  vs  ${h} => ${b}`);
  }
  return bad.length ? bad.join("; ") : null;
});

check("a bare five-digit fips is the alerts tab", () => {
  const r = parseRoute(url("/#/47065"), true);
  return r.tab === "alerts" && r.fips === "47065" ? null : JSON.stringify(r);
});

check("an unknown section falls back to alerts rather than blank", () => {
  const r = parseRoute(url("/#/nonsense"), true);
  return r.tab === "alerts" ? null : JSON.stringify(r);
});

check("the window segment survives, and defaults", () => {
  const a = parseRoute(url("/alerts#/47065/30"), true);
  const b = parseRoute(url("/alerts#/47065"), true);
  return a.days === 30 && b.days === DEFAULT_DAYS ? null : `${a.days} / ${b.days}`;
});

check("map focus is only accepted when it is a real fips", () => {
  const a = parseRoute(url("/alerts#/map/17031"), true);
  const b = parseRoute(url("/alerts#/map/banana"), true);
  return a.focus === "17031" && b.focus === null ? null : `${a.focus} / ${b.focus}`;
});

/* ------------------------------------------------------------ native build */

check("the native build gets hash URLs, never paths", () => {
  /* Capacitor serves off a local origin with no server to rewrite anything, so
     a path URL there is a 404 rather than a route. */
  const bad = [];
  for (const h of ["#/alerts", "#/substances/fentanyl", "#/help", "#/47065"]) {
    const got = toUrl(h, false);
    if (!got.startsWith("#")) bad.push(`${h} -> ${got}`);
  }
  return bad.length ? bad.join("; ") : null;
});

check("hash form still parses when path routing is off", () => {
  const r = parseRoute({ pathname: "/", hash: "#/substances/fentanyl" }, false);
  return r.tab === "substances" && r.id === "fentanyl" ? null : JSON.stringify(r);
});

/* ------------------------------------------------ cross-page pointers */

check("a cross-page pointer from another section reaches its page", () => {
  /* Views write href="#/heat". Under path routing that is no longer an
     address: tapped on /sos it makes /sos#/heat, which parses as the emergency
     tab with a sub-route of "heat" and re-renders the emergency page. Every
     cross-page pointer in the app broke this way, including three ON the
     emergency page - "If they are burning up", "If they are panicking", and
     "No naloxone yet?". app.js linkify() rewrites them through toUrl on
     render; this asserts the translation those links depend on. */
  const bad = [];
  for (const [from, raw, wantTab] of [
    ["/sos",    "#/heat",        "heat"],
    ["/sos",    "#/stimulants",  "stimulants"],
    ["/sos",    "#/learn",       "learn"],
    ["/learn",  "#/sex",         "sex"],
    ["/learn",  "#/policy",      "policy"],
    ["/drugs",  "#/supervision", "supervision"],
    ["/after",  "#/support",     "support"],
  ]) {
    const href = toUrl(raw, true);
    const [p, h] = href.split("#");
    const got = parseRoute({ pathname: p || "/", hash: h ? "#" + h : "" }, true);
    if (got.tab !== wantTab) bad.push(`from ${from}: ${raw} -> ${href} -> ${got.tab}, want ${wantTab}`);
  }
  return bad.length ? bad.join("; ") : null;
});

check("every in-app href a view writes is one toUrl can translate", () => {
  /* A view writing href="#/nonsense" would silently land on alerts. */
  const dir = path.join(ROOT, "site/js/views");
  const bad = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".js"))) {
    const src = readFileSync(path.join(dir, f), "utf8");
    for (const m of src.matchAll(/href:\s*"(#\/[a-z-]+)"/g)) {
      const seg = m[1].slice(2);
      if (!SEGMENTS[seg] && !PATHS[seg]) bad.push(`${f}: ${m[1]}`);
    }
  }
  return bad.length ? bad.join("; ") : null;
});

check("app.js rewrites in-app hrefs on render", () => {
  const app = readFileSync(path.join(ROOT, "site/js/app.js"), "utf8");
  if (!/function linkify/.test(app)) return "linkify() is gone";
  if (!/linkify\(node\)/.test(app)) return "route() no longer calls linkify";
  return null;
});

/* ------------------------------------------------------- malformed input */

check("a malformed percent-escape never throws", () => {
  /* decodeURIComponent throws on a truncated escape. canonicalize() runs
     before the first render and route() read the URL outside its own
     try/catch, so ONE bad fragment rejected the boot promise and left the
     static loading skeleton on screen with aria-busy="true" and no error.
     Reproduced live against /sos#/%E0%A4%A - the overdose page rendered
     nothing at all. */
  const bad = [];
  for (const h of ["#/%", "#/%E0%A4%A", "#/%C0%80", "#/%%", "#/a%2", "#/100%25"]) {
    for (const p of ["/", "/sos", "/alerts", "/drugs"]) {
      for (const routing of [true, false]) {
        try {
          parseRoute({ pathname: p, hash: h }, routing);
          canonicalUrl({ pathname: p, hash: h }, routing);
          toUrl(h, routing);
        } catch (e) {
          bad.push(`${p}${h} (pathRouting=${routing}): ${e.constructor.name}`);
        }
      }
    }
  }
  return bad.length ? bad.slice(0, 4).join("; ") : null;
});

check("a malformed fragment still lands on a real view", () => {
  /* Failing safe means rendering something, not rendering nothing. */
  const r = parseRoute({ pathname: "/sos", hash: "#/%E0%A4%A" }, true);
  return r.tab === "help" ? null : JSON.stringify(r);
});

check("boot and route both survive a URL parse error", () => {
  const app = readFileSync(path.join(ROOT, "site/js/app.js"), "utf8");
  const bad = [];
  if (!/try \{ canonicalize\(\); \} catch/.test(app)) bad.push("canonicalize() is unguarded in boot");
  if (!/try \{ r = parseRoute\(\); \} catch/.test(app)) bad.push("parseRoute() is unguarded in route()");
  return bad.length ? bad.join("; ") : null;
});

/* --------------------------------------------- navigation side effects */

check("a search destination normalises to the live URL", () => {
  /* reveal() guards on "have we arrived where the result pointed" before it
     scrolls. The search index stores "#/test"; under path routing the live URL
     is "/test". Compared raw, that guard was true for EVERY result, so
     reveal() aborted on its first tick and the reader landed at the top of the
     right page with the heading they asked for thousands of pixels down.
     Measured: 5,924px on "Fentanyl test strips". */
  const bad = [];
  for (const [want, live] of [
    ["#/test", "/test"],
    ["#/policy", "/policy"],
    ["#/sex", "/sex"],
    ["#/help", "/sos"],
    ["#/substances/fentanyl", "/drugs#/fentanyl"],
  ]) {
    if (toUrl(want, true) !== live) bad.push(`${want} -> ${toUrl(want, true)}, want ${live}`);
  }
  return bad.length ? bad.join("; ") : null;
});

check("reveal compares the destination in the live form", () => {
  const app = readFileSync(path.join(ROOT, "site/js/app.js"), "utf8");
  return /routeIdentity\(toUrl\(wantRoute\)\)/.test(app)
    ? null : "reveal() no longer normalises wantRoute before comparing";
});

check("every navigation path scrolls to the top", () => {
  /* go() calls route() directly on a pushState, which fires neither popstate
     nor hashchange - so the handler that used to do this never ran and a tab
     tapped from halfway down a page landed halfway down the next one. */
  const app = readFileSync(path.join(ROOT, "site/js/app.js"), "utf8");
  if (!/function toTop\(\)/.test(app)) return "toTop() is gone";
  const go = app.slice(app.indexOf("export function go("), app.indexOf("const VIEWS"));
  const calls = (go.match(/toTop\(\)/g) || []).length;
  if (calls < 3) return `go() only calls toTop() ${calls} time(s); each branch needs it`;
  if (!/documentElement\.scrollTop = 0/.test(app)) {
    return "toTop() dropped the iOS fallback - scrollTo alone loses to momentum scrolling";
  }
  return null;
});

/* ----------------------------------------------------------- no drift */

check("every section has a view, and every view has a section", () => {
  const app = readFileSync(path.join(ROOT, "site/js/app.js"), "utf8");
  const block = app.slice(app.indexOf("const VIEWS = {"), app.indexOf("let token"));
  const views = [...block.matchAll(/^\s*([a-z]+):\s*\(\)\s*=>/gm)].map((m) => m[1]);
  const ids = Object.values(PATHS);
  const missing = views.filter((v) => !ids.includes(v));
  const extra = ids.filter((i) => !views.includes(i));
  return missing.length || extra.length
    ? `view without a path: ${missing.join(", ") || "none"}; path without a view: ${extra.join(", ") || "none"}`
    : null;
});

check("every section is rewritten in netlify.toml", () => {
  /* A section with no rewrite 404s on a hard refresh and on a shared link -
     it would still work while clicking around, which is how it ships broken. */
  const toml = readFileSync(path.join(ROOT, "netlify.toml"), "utf8");
  const rewritten = new Set(
    [...toml.matchAll(/from\s*=\s*"\/([a-z-]+)"\s*\n\s*to\s*=\s*"\/site\/index\.html"/g)]
      .map((m) => m[1])
  );
  const missing = Object.keys(PATHS).filter((seg) => !rewritten.has(seg));
  return missing.length ? `no rewrite for: ${missing.join(", ")}` : null;
});

check("the tab bar links to real sections", () => {
  const html = readFileSync(path.join(ROOT, "site/index.html"), "utf8");
  const bad = [];
  for (const m of html.matchAll(/<a href="([^"]+)"\s+data-tab="([a-z]+)"/g)) {
    const [, href, id] = m;
    if (!SEGMENTS[id]) { bad.push(`unknown tab id ${id}`); continue; }
    if (href !== `/${SEGMENTS[id]}`) bad.push(`${id}: href ${href}, expected /${SEGMENTS[id]}`);
  }
  return bad.length ? bad.join("; ") : null;
});

check("PATHS and SEGMENTS are inverses", () => {
  const bad = Object.entries(PATHS).filter(([seg, id]) => SEGMENTS[id] !== seg);
  return bad.length ? JSON.stringify(bad) : null;
});

/* ------------------------------------------------------------------- run */

console.log("\nURL SCHEME");
let pass = 0, fail = 0;
for (const c of cases) {
  let err;
  try { err = c.fn(); } catch (e) { err = e.stack || String(e); }
  if (err) { fail++; console.log(`  FAIL ${c.name}\n      ${err}`); }
  else { pass++; console.log(`  ok   ${c.name}`); }
}
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exitCode = 1;
