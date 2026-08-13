/**
 * Privacy regression tests.
 *
 * The privacy properties in PRIVACY.md are the safety features of this app,
 * and every one of them is one careless commit away from being lost - a font
 * tag, an analytics snippet, a convenient per-county fetch. Nobody reliably
 * catches that in a diff review. So it fails the build instead.
 *
 *   node test/privacy.test.mjs
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE = path.join(ROOT, "site");

let pass = 0;
const failures = [];

function check(name, fn) {
  try {
    const problem = fn();
    if (problem) failures.push(`${name}\n      ${problem}`);
    else pass++;
  } catch (e) {
    failures.push(`${name}\n      threw: ${e.message}`);
  }
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const p = path.join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const files = walk(SITE);
const read = (p) => readFileSync(p, "utf8");
const rel = (p) => path.relative(ROOT, p);
const byExt = (ext) => files.filter((f) => f.endsWith(ext));

console.log("\nPRIVACY");

/* ---------------------------------------------------------------- 1. CSP */

const html = read(path.join(SITE, "index.html"));

check("Content-Security-Policy is present", () =>
  /http-equiv=["']Content-Security-Policy["']/i.test(html)
    ? null
    : "no CSP meta tag in site/index.html"
);

check("CSP default-src is 'none'", () =>
  /default-src\s+'none'/.test(html) ? null : "default-src must be 'none'"
);

check("CSP forbids inline and eval'd script", () => {
  const m = html.match(/script-src([^;]*)/);
  if (!m) return "no script-src directive";
  if (/unsafe-inline|unsafe-eval/.test(m[1])) return `script-src is weakened: ${m[1].trim()}`;
  return null;
});

check("CSP restricts connect-src to self", () => {
  const m = html.match(/connect-src([^;]*)/);
  if (!m) return "no connect-src directive - a script could exfiltrate anywhere";
  if (!/'self'/.test(m[1]) || /\*|https?:/.test(m[1])) return `connect-src too broad: ${m[1].trim()}`;
  return null;
});

check("referrer policy is no-referrer", () =>
  /name=["']referrer["'][^>]*content=["']no-referrer["']/i.test(html)
    ? null
    : "missing <meta name=referrer content=no-referrer>"
);

/* Every directive, not three of them.
 *
 * This block asserted default-src, script-src and connect-src, and left
 * style-src, img-src, font-src, base-uri, form-action, manifest-src and
 * worker-src completely unguarded - all seven could be widened to * and the
 * suite still passed 18/18. That was verified, not assumed.
 *
 * The scan below for external subresources only reads HTML tags, so it cannot
 * see an <img> created in JavaScript with an absolute src. The CSP is the only
 * thing that stops that, which is exactly why the directives need asserting
 * rather than trusting.
 */
function directives(doc) {
  /* Only the double quote terminates the value. CSP directive values are FULL
     of single quotes - 'none', 'self', 'sha256-...' - so a [^"'] class stops
     dead at the first one and returns nothing but the first directive's name.
     That is what this helper did on its first outing, and it reported
     form-action missing from a CSP that declares it. */
  const m = doc.match(/http-equiv=["']Content-Security-Policy["'][^>]*content="([^"]+)"/i);
  if (!m) return null;
  const out = {};
  for (const part of m[1].split(";")) {
    const [name, ...values] = part.trim().split(/\s+/);
    if (name) out[name] = values;
  }
  return out;
}

const SELF_ONLY = ["style-src", "font-src", "manifest-src", "worker-src", "connect-src"];
for (const d of SELF_ONLY) {
  check(`CSP ${d} is self only`, () => {
    const map = directives(html);
    const v = map?.[d];
    if (!v) return `${d} is not declared, so it falls back to default-src - declare it explicitly`;
    const bad = v.filter((x) => x !== "'self'");
    return bad.length ? `${d} allows more than 'self': ${bad.join(" ")}` : null;
  });
}

check("CSP img-src allows only self and data:", () => {
  const v = directives(html)?.["img-src"];
  if (!v) return "img-src is not declared";
  const bad = v.filter((x) => x !== "'self'" && x !== "data:");
  return bad.length ? `img-src allows a remote origin: ${bad.join(" ")}` : null;
});

for (const d of ["base-uri", "form-action"]) {
  check(`CSP ${d} is 'none'`, () => {
    const v = directives(html)?.[d];
    if (!v) return `${d} is not declared - it does NOT inherit from default-src`;
    return v.join(" ") === "'none'" ? null : `${d} should be 'none', got: ${v.join(" ")}`;
  });
}

/* The root redirect page is served at / - the netlify redirect is force=false,
   so the real file wins and the redirect never fires. It carries an inline
   script and needs its own CSP; site/index.html's does not reach it. */
check("the root redirect page carries its own CSP", () => {
  const root = read(path.join(ROOT, "index.html"));
  const map = directives(root);
  if (!map) return "index.html at the repo root has no CSP meta, and it is served at /";
  if (!/^'none'$/.test((map["default-src"] || []).join(" "))) return "root CSP default-src must be 'none'";
  const script = (map["script-src"] || []).join(" ");
  if (/unsafe-inline|unsafe-eval/.test(script)) return `root script-src is weakened: ${script}`;
  if (!/sha256-/.test(script)) return "root page's inline script must be allowed by hash, not by unsafe-inline";
  return null;
});

/* ------------------------------------------ 2. no external subresources */

// Links out to a news story are fine and expected. Loading a font, script,
// image or stylesheet from someone else's server is not: that hands a third
// party the reader's IP address and the fact that they opened this page.
check("no external subresources in HTML", () => {
  const bad = [];
  const tagRe = /<(script|link|img|iframe|source|embed|object|video|audio)\b[^>]*>/gi;
  for (const tag of html.match(tagRe) || []) {
    const url = tag.match(/\b(?:src|href|data)=["'](https?:)?\/\/([^"']+)["']/i);
    if (url) bad.push(tag.slice(0, 90));
  }
  return bad.length ? `external subresource(s): ${bad.join(" | ")}` : null;
});

check("no external URLs in CSS", () => {
  const bad = [];
  for (const f of byExt(".css")) {
    const css = read(f);
    for (const m of css.match(/@import[^;]+|url\(\s*["']?(https?:)?\/\/[^)]+\)/gi) || []) {
      bad.push(`${rel(f)}: ${m.slice(0, 70)}`);
    }
  }
  return bad.length ? bad.join(" | ") : null;
});

check("no absolute-URL fetch or import in site scripts", () => {
  const bad = [];
  for (const f of byExt(".js")) {
    const js = read(f);
    for (const m of js.match(/\b(?:fetch|import)\s*\(\s*["'`](https?:)?\/\//gi) || []) {
      bad.push(`${rel(f)}: ${m.trim()}`);
    }
    for (const m of js.match(/new\s+(?:WebSocket|EventSource)\s*\(/gi) || []) {
      bad.push(`${rel(f)}: ${m.trim()} - persistent external connection`);
    }
  }
  return bad.length ? bad.join(" | ") : null;
});

/* -------------------------------------------- 3. no per-item data fetch */

// The whole design rests on this. A fetch built from a county FIPS or a
// substance id puts the user's lookup into the host's access log.
check("no data fetch built from a county or substance identifier", () => {
  const bad = [];
  for (const f of byExt(".js")) {
    const js = read(f);
    // fetch(...) whose argument contains a template interpolation or a `+`
    // concatenation is a per-item endpoint by construction.
    for (const m of js.match(/fetch\s*\(\s*[`"'][^`"')]*\$\{[^}]+\}/g) || []) {
      bad.push(`${rel(f)}: ${m.trim().slice(0, 70)}`);
    }
  }
  /* Two interpolations are allowed, and only these two:
     - data.js `${name}` is a fixed dataset filename, not user-selected input.
     - i18n.js `${code}` is a locale. It reveals nothing the browser has not
       already disclosed: Accept-Language is sent on every request regardless,
       so a locale fetch adds no new signal. Everything else is a leak. */
  const filtered = bad.filter(
    (b) => !/data\.js.*\$\{name\}/.test(b) && !/i18n\.js.*\$\{code\}/.test(b)
  );
  return filtered.length
    ? `per-item endpoint(s) - see PRIVACY.md §1: ${filtered.join(" | ")}`
    : null;
});

/* -------------------------------------------------- 4. storage discipline */

/* Storage is allowed in exactly three modules, none of which records what a
   reader looked up: app.js (color theme), i18n.js (language), and seen.js (one
   timestamp - whether the app was already opened this session). Any other
   module touching storage is a regression.

   seen.js gets its own structural test below, because "it only stores a
   timestamp" is a promise the allowlist alone cannot keep. */
const STORAGE_ALLOWED = new Set(["app.js", "i18n.js", "seen.js"]);


/* Comments are stripped before scanning, exactly as the seen.js structural
   test does. A module must be free to EXPLAIN that it deliberately stores
   nothing - practice.js says "no localStorage" in its header for precisely
   that reason - without the sentence being read as a violation. Same class of
   false positive as the bare /plausible/ match this suite used to make. */
const codeOnly = (js) =>
  js.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1 ");

check("storage APIs confined to the preference modules", () => {
  const bad = [];
  for (const f of byExt(".js")) {
    if (STORAGE_ALLOWED.has(path.basename(f))) continue;
    const js = codeOnly(read(f));
    if (/\b(localStorage|sessionStorage|indexedDB|document\.cookie)\b/.test(js)) {
      bad.push(rel(f));
    }
  }
  return bad.length
    ? `storage used outside ${[...STORAGE_ALLOWED].join("/")}: ${bad.join(", ")}`
    : null;
});

/* Nothing the app writes may outlive the session, so localStorage is banned
   outright - including in the three modules allowed above. The only permitted
   mentions are the defensive `localStorage.clear()` calls (Quick Exit, and the
   wipe on pagehide), which exist to remove anything an older build left behind.

   This is a stronger guarantee than the allowlist and it is the one that
   matters on a phone that gets searched: a preference in localStorage is a
   durable mark that this app was used, however harmless its value. */
check("nothing is written to localStorage", () => {
  const bad = [];
  for (const f of byExt(".js")) {
    const js = codeOnly(read(f));
    for (const m of js.matchAll(/localStorage\s*\.\s*(\w+)/g)) {
      if (m[1] !== "clear") bad.push(`${rel(f)}: localStorage.${m[1]}`);
    }
  }
  return bad.length ? `localStorage written outside a clear(): ${bad.join(", ")}` : null;
});

/* The wipe has three parts and each is load-bearing (see app.js). A build that
   quietly drops one still passes every other test here while leaving last
   session's shell sitting on the device. */
check("the session wipe is wired up", () => {
  const js = codeOnly(read(path.join(SITE, "js", "app.js")));
  const missing = [];
  if (!/addEventListener\(\s*["']pagehide["']/.test(js)) missing.push("no pagehide handler");
  if (!/caches\.delete/.test(js)) missing.push("caches are never deleted");
  /* The boot sweep must be awaited BEFORE the service worker registers, or the
     worker races it and can repopulate a cache the sweep has not reached. */
  const sweep = js.indexOf("await swept");
  const reg = js.indexOf("serviceWorker.register");
  if (sweep < 0) missing.push("boot sweep is not awaited");
  else if (reg >= 0 && sweep > reg) missing.push("service worker registers before the sweep completes");
  return missing.length ? missing.join("; ") : null;
});

/* The whole point of seen.js is that the "new since you last looked" feature
   cannot become a log of which counties someone checked. The natural way to
   build it - a {fips: timestamp} map - would be exactly that log. This test
   makes that implementation fail loudly rather than ship quietly.

   It reads the code with comments stripped, so the file is free to EXPLAIN why
   it avoids counties while never touching one. */
check("the last-visit marker cannot record what was looked up", () => {
  const src = read(path.join(SITE, "js", "seen.js"))
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1 ");

  const problems = [];

  // 1. One fixed key. An interpolated or concatenated key is how per-county
  //    records get in.
  const keys = [...src.matchAll(/\.(?:get|set|remove)Item\(\s*([^,)]+)/g)].map((m) => m[1].trim());
  for (const k of keys) {
    if (/[`+]|\$\{/.test(k)) problems.push(`storage key is built, not fixed: ${k}`);
  }

  // 2. Nothing about the reader's lookups may appear anywhere in the logic.
  for (const word of ["fips", "county", "counties", "substance", "query", "search", "route"]) {
    if (new RegExp(`\\b${word}\\b`, "i").test(src)) {
      problems.push(`references "${word}" - the marker must be lookup-blind`);
    }
  }

  // 3. The stored value must be a timestamp, not a structure.
  // Capture to the end of the statement, not to the first ")" - the value is
  // itself a call, and `[^)]+` would stop inside it.
  const writes = [...src.matchAll(/setItem\(\s*[^,]+,\s*([\s\S]*?)\s*\);/g)].map((m) => m[1].trim());
  if (!writes.length) problems.push("no write found - has the marker been removed?");
  for (const w of writes) {
    if (!/toISOString\(\)/.test(w) || /JSON\.stringify/.test(w)) {
      problems.push(`stored value is not a bare timestamp: ${w}`);
    }
  }

  return problems.length ? problems.join("; ") : null;
});

check("quick exit clears storage and replaces history", () => {
  const app = read(path.join(SITE, "js", "app.js"));
  const missing = [];
  if (!/localStorage\.clear/.test(app)) missing.push("localStorage.clear()");
  if (!/sessionStorage\.clear/.test(app)) missing.push("sessionStorage.clear()");
  if (!/caches\.delete/.test(app)) missing.push("caches.delete()");
  if (!/history\.replaceState/.test(app)) missing.push("history.replaceState()");
  if (!/location\.replace/.test(app)) missing.push("location.replace()");
  return missing.length ? `quick exit is missing: ${missing.join(", ")}` : null;
});

/* ------------------------------------------------- 5. outbound link safety */

check("outbound links carry noreferrer and no-referrer policy", () => {
  const ui = read(path.join(SITE, "js", "ui.js"));
  const fn = ui.slice(ui.indexOf("export function extLink"));
  const missing = [];
  if (!/noopener/.test(fn)) missing.push("rel=noopener");
  if (!/noreferrer/.test(fn)) missing.push("rel=noreferrer");
  if (!/referrerpolicy/.test(fn)) missing.push("referrerpolicy");
  return missing.length ? `extLink() missing: ${missing.join(", ")}` : null;
});

/* --------------------------------------------------------- 6. XSS surface */

// Headlines come from RSS feeds we do not control. Building DOM nodes makes
// injection structurally impossible; innerHTML reopens it.
check("no innerHTML/outerHTML assignment in site scripts", () => {
  const bad = [];
  for (const f of byExt(".js")) {
    const js = read(f);
    for (const m of js.match(/\.(inner|outer)HTML\s*=/g) || []) bad.push(`${rel(f)}: ${m}`);
    if (/insertAdjacentHTML|document\.write/.test(js)) bad.push(`${rel(f)}: insertAdjacentHTML/document.write`);
  }
  return bad.length ? bad.join(" | ") : null;
});

/* -------------------------------------------------- 7. modules must parse */

// A syntax error in a view degrades to "this section could not load", which
// on a harm reduction page silently hides safety information.
const { execFileSync } = await import("node:child_process");
check("every site module parses", () => {
  const bad = [];
  for (const f of byExt(".js")) {
    try {
      execFileSync(process.execPath, ["--check", f], { stdio: "pipe" });
    } catch (e) {
      bad.push(`${rel(f)}: ${String(e.stderr).split("\n").slice(0, 2).join(" ").trim()}`);
    }
  }
  return bad.length ? bad.join(" | ") : null;
});

/* ------------------------------------------------------- 8. no telemetry */

check("no analytics or telemetry identifiers", () => {
  /* Match the PRODUCTS, not English words that happen to collide. A bare
     /plausible/ flagged a code comment describing a "plausible-looking blob",
     and a test that cries wolf gets muted, which is worse than no test. */
  const banned = new RegExp(
    [
      "gtag\\(", "fbq\\(", "googletagmanager", "google-analytics",
      "analytics\\.js", "plausible\\.(io|js)", "matomo", "piwik",
      "segment\\.(com|io)", "mixpanel", "hotjar", "fullstory",
      "clarity\\.ms", "facebook\\.net", "sentry\\.(io|cdn)", "@sentry/",
      "amplitude\\.com", "heap\\.io", "datadoghq",
    ].join("|"),
    "i"
  );
  const bad = [];
  for (const f of [...byExt(".js"), ...byExt(".html"), ...byExt(".css")]) {
    if (banned.test(read(f))) bad.push(rel(f));
  }
  return bad.length ? `telemetry reference in: ${bad.join(", ")}` : null;
});

/* The page title is a privacy control, not a label.

   It is read by people who are not the reader: the tab switcher, browser
   history, a shared screen, and whatever the phone shows when it is handed to
   somebody. "Drug supply alerts and harm reduction" in any of those places
   outs the person holding it, and the threat is often in the same room.

   This has now been undone twice - once in the markup, once by applyStrings()
   overwriting the markup at boot with a locale string that nothing else
   consumed. A comment explaining the decision was not enough to keep it, so
   this is the test instead. */
check("page title stays innocuous", () => {
  const m = html.match(/<title>([^<]*)<\/title>/i);
  if (!m) return "no <title> in site/index.html";
  if (m[1].trim() !== "Nightlight") return `<title> is "${m[1].trim()}"`;

  const app = read(path.join(ROOT, "site/js/app.js"));
  if (/document\.title\s*=\s*t\(\s*["']app\.title["']/.test(app)) {
    return "app.js overwrites the title with app.title at boot";
  }
  for (const loc of ["en-US", "es"]) {
    let doc;
    try { doc = JSON.parse(read(path.join(ROOT, "data/i18n", `${loc}.json`))); }
    catch { continue; }                 // locale not shipped yet is not a failure
    if (doc?.app?.title) return `data/i18n/${loc}.json still defines app.title`;
  }
  return null;
});

/* -------------------------------------------------------------- report */

for (const f of failures) console.log(`  FAIL ${f}`);
if (!failures.length) console.log(`  all ${pass} privacy checks passed`);

console.log(`\n${pass} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
