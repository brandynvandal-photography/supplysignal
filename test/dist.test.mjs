/* The web deploy resolves, and its caching rules match its names.
 *
 * WHY THIS EXISTS
 *
 * Since 2026-08-19 the deploy is not the source tree. scripts/build-site.mjs
 * minifies the shell, renames every JS, CSS and national data file by a hash
 * of its contents, and rewrites every reference - import specifiers, the
 * worker's SHELL list, index.html, the data manifest in data.js - to match.
 * netlify.toml then marks the hashed names immutable and the entry points
 * no-cache. Every one of those is a place a reference can dangle, and a
 * dangling reference in this build is a tab that shows "could not load" on
 * nightlight.help while every other test - all of which read site/ - stays
 * green. So this builds dist/ the way Netlify does and walks it.
 *
 * Three properties, each load-bearing:
 *
 *   1. EVERY REFERENCE RESOLVES. index.html's links and scripts, sw.js's
 *      precache list, every import in every module, every "../data/..."
 *      fetch, and every entry in the data manifest points at a file that is
 *      in dist/.
 *   2. EVERYTHING UNDER A HASHED DIRECTORY IS HASHED, and the entry points
 *      are not. The immutable header is only safe on a name that carries its
 *      content; an unhashed file under /site/js/ would be cached for a year.
 *   3. THE CACHE RULES DO NOT OVERLAP. Netlify's docs do not say which header
 *      wins when two rules match one path, so the rules are written to make
 *      the question moot - and this checks it against every real file in
 *      dist/ rather than by reading the patterns.
 */

import { execFileSync } from "node:child_process";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");

const fails = [];
let checked = 0;

/* Built here, not trusted from disk - the same rule test/offline.test.mjs
   applies to www/. */
execFileSync(process.execPath, [path.join(ROOT, "scripts/build-site.mjs")], { stdio: "pipe" });

const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const read = (rel) => readFileSync(path.join(DIST, rel), "utf8");
const has = (rel) => existsSync(path.join(DIST, rel));
const HASHED = /\.[0-9a-f]{8}\.[a-z]+$/;

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(path.relative(DIST, p).split(path.sep).join("/"));
  }
  return out;
}
const all = walk(DIST);

/* ------------------------------------------------------------ 1. index.html */

const html = read("site/index.html");
for (const m of html.matchAll(/(?:href|src)="(\/site\/[^"]+)"/g)) {
  const rel = m[1].slice(1);
  checked++;
  if (!has(rel)) fails.push(`index.html references ${m[1]}, which dist/ does not contain`);
  if (/^site\/(js|css)\//.test(rel) && !HASHED.test(rel)) {
    fails.push(`index.html references ${m[1]} without a content hash - it would be cached as immutable`);
  }
}
checked++;
if (!has("site/index.html") || !has("site/sw.js")) fails.push("dist/site is missing index.html or sw.js");
checked++;
if (!/<title>Nightlight<\/title>/.test(html)) fails.push("dist index.html lost its title - the shell was rewritten wrongly");

/* ---------------------------------------------------------------- 2. sw.js */

const sw = strip(read("site/sw.js"));
const shell = sw.match(/const SHELL = \[([\s\S]*?)\];/);
if (!shell) fails.push("dist sw.js has no SHELL list");
else {
  for (const m of shell[1].matchAll(/"([^"]+)"/g)) {
    const spec = m[1];
    checked++;
    if (spec === "./") continue;
    const rel = path.posix.normalize(path.posix.join("site", spec));
    if (!has(rel)) fails.push(`sw.js precaches ${spec}, which dist/site does not contain`);
    if (/^site\/(js|css)\//.test(rel) && !HASHED.test(rel)) fails.push(`sw.js precaches an unhashed ${spec}`);
  }
}

/* -------------------------------------------------------------- 3. modules */

const js = all.filter((r) => r.startsWith("site/js/") && r.endsWith(".js"));
checked++;
if (js.length < 30) fails.push(`only ${js.length} JS files under dist/site/js - the shell did not stage`);
let imports = 0;
for (const rel of js) {
  checked++;
  if (!HASHED.test(rel)) fails.push(`${rel} is under site/js/ without a content hash`);
  const src = strip(read(rel));
  const specs = [
    ...src.matchAll(/(?:^|[^\w$.])import\s*(?:[\w$*{}\s,]+?\s*from\s*)?["']([^"']+)["']/g),
    ...src.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g),
  ].map((m) => m[1]);
  imports += specs.length;
  for (const spec of specs) {
    checked++;
    const target = path.posix.normalize(path.posix.join(path.posix.dirname(rel), spec));
    if (!has(target)) fails.push(`${rel} imports ${spec}, which dist/ does not contain`);
    else if (!HASHED.test(target)) fails.push(`${rel} imports ${spec}, an unhashed name`);
  }
  /* Literal data fetches ("../data/...") resolve from the document root. */
  for (const m of src.matchAll(/["'](\.\.\/data\/[^"']+)["']/g)) {
    checked++;
    const target = m[1].replace(/^\.\.\//, "");
    if (!has(target)) fails.push(`${rel} names ${m[1]}, which dist/ does not contain`);
  }
}
checked++;
if (imports < 60) fails.push(`only ${imports} imports found across dist JS - the import pattern is not matching minified output`);

/* ----------------------------------------------------- 4. the data manifest */

/* Both directions: every hashed bundle is named in data.js or i18n.js, and
   every name they carry is a file. */
const dataJs = read(js.find((r) => /^site\/js\/data\.[0-9a-f]{8}\.js$/.test(r)));
const i18nJs = read(js.find((r) => /^site\/js\/i18n\.[0-9a-f]{8}\.js$/.test(r)));
const named = new Set([...(dataJs + i18nJs).matchAll(/"(h\/[^"]+)"/g)].map((m) => m[1]));
for (const n of named) {
  checked++;
  if (!has(`data/${n}`)) fails.push(`the data manifest names ${n}, which dist/data does not contain`);
}
const hashedData = all.filter((r) => r.startsWith("data/h/")).map((r) => r.slice("data/".length));
checked++;
if (hashedData.length < 15) fails.push(`only ${hashedData.length} hashed data bundles under dist/data/h`);
for (const r of hashedData) {
  checked++;
  if (!HASHED.test(r)) fails.push(`data/${r} is under data/h/ without a content hash`);
  if (!named.has(r)) fails.push(`data/${r} is shipped but nothing names it - data.js or i18n.js lost it`);
}
checked++;
if (!has("data/alerts.json")) fails.push("dist/data/alerts.json is missing - the packaged app refreshes from this exact URL");
checked++;
if (has("data/index.json")) fails.push("dist/data/index.json is present - it is a topic and must ship only inside topics.json");
checked++;
if (!hashedData.some((r) => /^h\/topics\./.test(r))) fails.push("topics.json is not among the hashed bundles");
checked++;
for (const stray of all.filter((r) => /^data\/[^/]+$/.test(r) && r !== "data/alerts.json")) {
  fails.push(`${stray} is an unhashed file at the top of dist/data - only alerts.json belongs there`);
}

/* ------------------------------------------------- 5. the cache rules */

/* Every header rule that sets Cache-Control, as [pattern, value]. */
const toml = readFileSync(path.join(ROOT, "netlify.toml"), "utf8");
const rules = [];
for (const m of toml.matchAll(/\[\[headers\]\]\s*\n\s*for\s*=\s*"([^"]+)"\s*\n\s*\[headers\.values\]([\s\S]*?)(?=\n\[\[|$)/g)) {
  const cc = m[2].match(/Cache-Control\s*=\s*"([^"]+)"/);
  if (cc) rules.push([m[1], cc[1]]);
}
checked++;
if (rules.length < 8) fails.push(`only ${rules.length} Cache-Control rules found in netlify.toml`);

/* Netlify's splat matches across segments. Good enough for these patterns. */
const matches = (pattern, p) => new RegExp("^" + pattern.split("*").map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*") + "$").test(p);

for (const rel of all) {
  const p = "/" + rel;
  const hit = rules.filter(([pat]) => matches(pat, p));
  checked++;
  if (hit.length > 1) {
    fails.push(`${p} matches ${hit.length} Cache-Control rules (${hit.map((h) => h[0]).join(", ")}) - Netlify's precedence is undocumented, so rules must not overlap`);
    continue;
  }
  const value = hit[0]?.[1] || "";
  const hashed = /^(site\/(js|css)\/|data\/h\/)/.test(rel);
  if (hashed && !/immutable/.test(value)) fails.push(`${p} is content-hashed but its Cache-Control is "${value || "(none)"}"`);
  if (!hashed && /immutable/.test(value)) fails.push(`${p} is not content-hashed but is marked immutable`);
  if (/^(site\/index\.html|site\/sw\.js|data\/alerts\.json)$/.test(rel) && value !== "no-cache") {
    fails.push(`${p} must be no-cache, got "${value || "(none)"}"`);
  }
}

console.log("DIST\n");
for (const f of fails) console.log("  not ok " + f);
if (!fails.length) {
  console.log(`  ok   ${checked} references and cache rules agree across ${all.length} files in dist/`);
}
console.log(`\n${fails.length ? 0 : 1} passed, ${fails.length} failed`);
if (fails.length) process.exit(1);
