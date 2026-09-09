/* ONE SET OF HOSTING RULES, TWO HOSTS, NO DRIFT.
 *
 * netlify.toml is the source of the 200 rewrites, the security headers and the
 * two caching regimes. scripts/hosting.mjs derives Cloudflare Pages'
 * _redirects and _headers from it at build time. This proves the derivation
 * is faithful and that what Pages cannot express was not needed:
 *
 *   1. The parser reads the subset of TOML the file is written in, and reads
 *      it correctly - force, status, quoted values with punctuation.
 *   2. Every app route in site/js/routes.js has a 200 rewrite in the TOML AND
 *      in the derived _redirects. A tab that 404s on one host and serves the
 *      shell on the other is the exact failure two copies invite.
 *   3. Every header rule survives with identical values, in order.
 *   4. Every forced-404 denylist rule names a path that is NOT in the dist/
 *      allowlist. Pages cannot carry those rules; it does not need to,
 *      because the path is not there - and this is where that is checked
 *      rather than assumed.
 *   5. The derived files stay under Pages' limits (100 header rules, 2,000
 *      static redirects) and carry no rule Pages would refuse.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseNetlify, toRedirects, toHeaders, carriesToPages, pagesDestination } from "../scripts/hosting.mjs";
import { PUBLIC } from "../scripts/build-site.mjs";
import { SEGMENTS } from "../site/js/routes.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const toml = readFileSync(path.join(ROOT, "netlify.toml"), "utf8");

let pass = 0;
const fails = [];
const ok = (name, cond) => { if (cond) pass++; else fails.push(name); };

console.log("HOSTING\n");

/* ---- 1. the parser ---- */
const sample = `
[build]
  publish = "dist"
# a comment
[[redirects]]
  from = "/"
  to = "/site/index.html"
  status = 200
  force = true
[[redirects]]
  from = "/src/*"
  to = "/404.html"
  status = 404
  force = true
[[headers]]
  for = "/*"
  [headers.values]
    X-Frame-Options = "DENY"
    Permissions-Policy = "geolocation=(self), camera=()"
`;
let parsed = null;
try { parsed = parseNetlify(sample); } catch (e) { fails.push(`parser threw on the sample: ${e.message}`); }
ok("the parser reads from/to/status/force",
   parsed && parsed.redirects.length === 2
   && parsed.redirects[0].from === "/" && parsed.redirects[0].status === 200 && parsed.redirects[0].force === true
   && parsed.redirects[1].status === 404);
ok("the parser keeps header values with commas and parentheses intact",
   parsed && parsed.headers[0].values[1][1] === "geolocation=(self), camera=()");
ok("the parser ignores [build] keys and comments",
   parsed && !("publish" in (parsed.redirects[0] || {})));

let rules = null;
try { rules = parseNetlify(toml); } catch (e) { fails.push(`parser threw on netlify.toml: ${e.message}`); }
if (!rules) {
  for (const f of fails) console.log("  not ok " + f);
  console.log(`\n${pass} passed, ${fails.length} failed`);
  process.exit(1);
}

/* ---- 2. every route is rewritten, on both hosts ---- */
const redirectsFile = toRedirects(rules);
const rewrites = new Map(rules.redirects.filter((r) => r.status === 200).map((r) => [r.from, r.to]));
const missingToml = Object.keys(SEGMENTS).map((id) => `/${SEGMENTS[id]}`).filter((p) => rewrites.get(p) !== "/site/index.html");
ok("every app route has a 200 rewrite to the shell in netlify.toml"
   + (missingToml.length ? `: ${missingToml.join(", ")}` : ""), !missingToml.length);
const missingPages = Object.keys(SEGMENTS).map((id) => `/${SEGMENTS[id]}`)
  .filter((p) => !redirectsFile.split("\n").includes(`${p} /site/ 200`));
ok("every app route has the same rewrite in the derived _redirects, in the directory form Pages serves"
   + (missingPages.length ? `: ${missingPages.join(", ")}` : ""), !missingPages.length);
ok("the root and the quick-exit page are rewritten too",
   redirectsFile.includes("/ /site/ 200") && redirectsFile.includes("/w /site/w/ 200"));
ok("no derived destination names index.html (Pages 308s the file form to the directory)",
   !/index\.html \d+\n/.test(redirectsFile) && pagesDestination("/site/index.html") === "/site/" && pagesDestination("/site/w/index.html") === "/site/w/");

/* ---- 3. every header rule survives, values identical, order kept ---- */
const headersFile = toHeaders(rules);
const lost = [];
let cursor = 0;
for (const h of rules.headers) {
  const at = headersFile.indexOf(`\n${h.for}\n`, cursor);
  if (at < 0) { lost.push(`rule for ${h.for}`); continue; }
  cursor = at;
  for (const [k, v] of h.values) {
    const line = `  ${k}: ${v}`;
    const here = headersFile.indexOf(line, cursor);
    if (here < 0) lost.push(`${h.for} -> ${k}`);
  }
}
ok("every header rule and value is in the derived _headers, in order"
   + (lost.length ? `: ${lost.slice(0, 4).join("; ")}` : ""), !lost.length);
ok("frame-ancestors and X-Frame-Options - the two the meta CSP cannot carry - are set for /*",
   /\n\/\*\n(?:.*\n)*?  X-Frame-Options: DENY\n/.test(headersFile)
   && /  Content-Security-Policy: frame-ancestors 'none'\n/.test(headersFile));
const noCacheFor = new Set(rules.headers.filter((h) => h.values.some(([k, v]) => k === "Cache-Control" && v === "no-cache")).map((h) => h.for));
const uncached = [...rewrites.keys()].filter((p) => !noCacheFor.has(p));
ok("every rewritten path has its own no-cache rule (Pages does not default it)"
   + (uncached.length ? `: ${uncached.join(", ")}` : ""), !uncached.length);
ok("the service worker keeps its root scope header",
   /\n\/site\/sw\.js\n  Service-Worker-Allowed: \/\n/.test(headersFile));

/* ---- 4. the 404 denylist is redundant with the allowlist, and provably so ---- */
const denied = rules.redirects.filter((r) => r.status === 404);
ok(`there is a 404 denylist to check (${denied.length} rules)`, denied.length > 0);
const shipped = denied
  .map((r) => r.from.replace(/^\//, "").split("/")[0])
  .filter((top) => PUBLIC.includes(top));
ok("no denylisted path is also in the dist/ allowlist"
   + (shipped.length ? `: ${shipped.join(", ")}` : ""), !shipped.length);
ok("the derived _redirects carries no 404 rule (Pages would refuse it)",
   !/ 404\n/.test(redirectsFile));

/* ---- 5. limits and shape ---- */
const redirectLines = redirectsFile.split("\n").filter((l) => l && !l.startsWith("#"));
ok(`_redirects stays under 2,000 rules (${redirectLines.length})`, redirectLines.length > 0 && redirectLines.length < 2000);
ok(`_headers stays under 100 rules (${rules.headers.length})`, rules.headers.length > 0 && rules.headers.length < 100);
ok("every _redirects line is source, destination, status",
   redirectLines.every((l) => /^\/\S* \/\S+ (200|30[1-8])$/.test(l)));
ok("every rule that was carried is one Pages supports",
   rules.redirects.filter(carriesToPages).every((r) => r.to.startsWith("/")));

for (const f of fails) console.log("  not ok " + f);
if (!fails.length) {
  console.log(`  ok   ${rewrites.size} rewrites and ${rules.headers.length} header rules derive from netlify.toml`);
  console.log(`  ok   ${denied.length} denylist rules are covered by the dist/ allowlist instead`);
}
console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) process.exit(1);
