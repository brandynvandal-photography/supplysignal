// Hosting rules, derived - never duplicated.
//
//   import { parseNetlify, toRedirects, toHeaders } from "./hosting.mjs";
//
// WHY THIS EXISTS
//
// nightlight.help moved off Netlify's metered plan after usage_exceeded took
// the site down with a 503 - on a harm reduction app, a 503 is a safety
// failure, not a billing event. Cloudflare Pages serves the same static
// dist/ with no bandwidth cap and, deployed by direct upload from GitHub
// Actions, no build cap either (the 500 builds/month allowance counts only
// builds Pages runs itself; see docs/HOSTING.md).
//
// Pages reads its rules from two plain files in the output directory,
// _redirects and _headers. netlify.toml holds the same rules in TOML, and
// every one of them was argued for at length in that file - the 200 rewrites
// that keep the county in the fragment, the frame-ancestors header the meta
// CSP cannot carry, the two caching regimes test/dist.test.mjs polices. A
// second hand-written copy of that list is a second place for it to be
// wrong, and the day it drifts is the day one host serves a stale service
// worker and the other does not.
//
// So the TOML stays the single source and this derives the Pages files from
// it at build time. scripts/build-site.mjs writes both into dist/;
// test/hosting.test.mjs proves the derivation round-trips and that nothing
// Pages cannot express was silently dropped.
//
// WHAT DOES NOT TRANSLATE, AND WHY THAT IS FINE
//
//   - The forced-404 denylist ("/src/*" -> /404.html 404). Pages' _redirects
//     supports redirects (3xx) and same-site proxying (200), not rewrites to
//     other status codes. It does not need them: dist/ is an allowlist and
//     those paths are not in it, so they 404 because they do not exist -
//     which is the stronger guarantee, and the one build-site.mjs already
//     asserts. The test below checks every denylisted path against the
//     allowlist rather than trusting either.
//   - `force = true`. Pages follows a redirect rule whether or not a static
//     asset matches the path, so every rule behaves as forced. The root "/"
//     rewrite and "/support" relied on force on Netlify; on Pages they need
//     nothing: under wrangler's Pages emulator the root rule proxies the
//     shell at "/" even though a real index.html sits there (verified
//     2026-09-09 - the served body carries the shell's modulepreload links,
//     not the 601-byte fallback). Should production ever serve the asset
//     instead, that fallback still hops to /site/ with an inline script that
//     carries the #/fips fragment across, so the county survives either way.
//   - A destination that names index.html. Pages canonicalises
//     "/site/index.html" to "/site/" with a 308, so a proxy rule pointing at
//     the file redirects instead of serving - every tab path answered 308
//     under the emulator until this was found. The derivation rewrites such
//     destinations to the directory form; Netlify keeps the file form it has
//     always used.
//
// The parser reads the TOML SUBSET netlify.toml is written in - [[redirects]]
// and [[headers]] tables, quoted strings, integers, booleans, # comments - and
// nothing else. It is not a TOML parser and refuses anything it does not
// recognise rather than guessing.

/** Parse the [[redirects]] and [[headers]] tables out of netlify.toml. */
export function parseNetlify(toml) {
  const redirects = [];
  const headers = [];
  let block = null;          // the object being filled
  let inValues = false;      // inside [headers.values]

  const lines = String(toml).split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.replace(/^\s+/, "");
    if (!line || line.startsWith("#")) continue;

    if (line === "[[redirects]]") { block = { from: null, to: null, status: 301, force: false }; redirects.push(block); inValues = false; continue; }
    if (line === "[[headers]]") { block = { for: null, values: [] }; headers.push(block); inValues = false; continue; }
    if (line === "[headers.values]") {
      if (!block || !("values" in block)) throw new Error(`netlify.toml:${i + 1}: [headers.values] outside a [[headers]] table`);
      inValues = true; continue;
    }
    /* Any other table header ([build], [[plugins]] ...) ends the current block. */
    if (/^\[/.test(line)) { block = null; inValues = false; continue; }

    const m = line.match(/^([A-Za-z0-9_-]+)\s*=\s*(.+?)\s*$/);
    if (!m) throw new Error(`netlify.toml:${i + 1}: cannot read "${raw.trim()}"`);
    if (!block) continue;                       // a key under [build] etc.
    const [, key, rawVal] = m;
    const val = readValue(rawVal, i + 1);

    if ("values" in block) {
      if (inValues) block.values.push([key, String(val)]);
      else if (key === "for") block.for = String(val);
      else throw new Error(`netlify.toml:${i + 1}: unexpected key "${key}" in [[headers]]`);
    } else {
      if (key === "from" || key === "to") block[key] = String(val);
      else if (key === "status") block.status = Number(val);
      else if (key === "force") block.force = val === true;
      else throw new Error(`netlify.toml:${i + 1}: unexpected key "${key}" in [[redirects]]`);
    }
  }

  for (const r of redirects) {
    if (!r.from || !r.to) throw new Error(`a [[redirects]] table is missing from/to (${JSON.stringify(r)})`);
  }
  for (const h of headers) {
    if (!h.for || !h.values.length) throw new Error(`a [[headers]] table is missing for/values (${JSON.stringify(h)})`);
  }
  return { redirects, headers };
}

function readValue(s, lineNo) {
  if (/^"([^"\\]|\\.)*"$/.test(s)) return JSON.parse(s);     // quoted string, TOML basic strings escape like JSON here
  if (/^-?\d+$/.test(s)) return Number(s);
  if (s === "true") return true;
  if (s === "false") return false;
  throw new Error(`netlify.toml:${lineNo}: unsupported value ${s}`);
}

/** Which redirect rules Pages can carry: 3xx redirects and 200 same-site proxies. */
export const carriesToPages = (r) => r.status === 200 || (r.status >= 301 && r.status <= 308);

/** dist/_redirects. One rule per line: source destination status. */
export function toRedirects(rules) {
  const out = [
    "# GENERATED by scripts/build-site.mjs from netlify.toml - do not edit here.",
    "# Rewrites (200) serve the app shell at each tab path; the county and the",
    "# substance stay in the fragment, which is never sent. See netlify.toml for",
    "# the reasoning behind every line, and scripts/hosting.mjs for what does",
    "# not translate (the forced 404s - dist/ is an allowlist, they are absent).",
  ];
  for (const r of rules.redirects) {
    if (!carriesToPages(r)) continue;
    out.push(`${r.from} ${pagesDestination(r.to)} ${r.status}`);
  }
  return out.join("\n") + "\n";
}

/** "/site/index.html" -> "/site/": the form Pages serves without a 308. */
export const pagesDestination = (to) => to.replace(/\/index\.html$/, "/");

/** dist/_headers. A path pattern, then indented "Name: value" lines. */
export function toHeaders(rules) {
  const out = [
    "# GENERATED by scripts/build-site.mjs from netlify.toml - do not edit here.",
    "# Security headers the meta CSP cannot carry, and the two caching regimes:",
    "# content-hashed names immutable, entry points and ingest output no-cache.",
  ];
  for (const h of rules.headers) {
    out.push(h.for);
    for (const [k, v] of h.values) out.push(`  ${k}: ${v}`);
  }
  return out.join("\n") + "\n";
}
