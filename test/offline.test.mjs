/* The packaged app has to work with the radio off.
 *
 * This is not a nice-to-have for this audience. The overdose steps, the
 * combination warnings and the reagent charts are wanted in basements, in
 * cars, in county jail waiting rooms and at three in the morning on a dead
 * prepaid phone — the exact places a network is not. And the failure mode of a
 * missing file here is not a spinner: data.js swallows a failed fetch and
 * resolves to the fallback, so a bundle missing substances.json renders a
 * complete-looking, permanently empty Drugs tab.
 *
 * scripts/build-app.mjs already fails on a missing CSS or JS reference in the
 * shell. That covers the boot, and nothing else — a bundle can boot perfectly
 * and still have no data in it.
 *
 * So this resolves every path the running app can ask for against the staged
 * bundle: every module it imports, every dataset it loads, every locale it can
 * switch to. Anything the app can request and the bundle does not contain is a
 * screen that is blank on a plane and full on wifi, which is the one way this
 * could fail that nobody would catch in review.
 */

import { execFileSync } from "node:child_process";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WWW = path.join(ROOT, "www");

const fails = [];
let checked = 0;

/* Build it here rather than testing whatever www/ happens to be lying around.
   A stale bundle passing this test is worse than no test: it would certify a
   tree nobody is going to ship. */
execFileSync(process.execPath, [path.join(ROOT, "scripts/build-app.mjs")], { stdio: "pipe" });

/* Comments are stripped before anything is matched. site/js/locate.js opens
   with a block comment quoting the old import("../../../src/locate.mjs") that
   this file's own history is about, and a scanner that reads its own
   documentation as code reports a failure that does not exist. */
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const rel = (p) => path.relative(WWW, p);
const jsFiles = [];
(function walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith(".js")) jsFiles.push(p);
  }
})(path.join(WWW, "js"));

/* ----------------------------------------------------------- 1. modules */

/* Static and dynamic imports both, because the views are all loaded with
   import() on first navigation — a missing view file is a tab that does
   nothing, and it would not surface until somebody tapped it offline. */
for (const file of jsFiles) {
  const src = strip(readFileSync(file, "utf8"));
  const specs = [
    ...src.matchAll(/(?:^|[\s;}])import\s+(?:[\w*{},\s]+\s+from\s+)?["']([^"']+)["']/g),
    ...src.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g),
  ].map((m) => m[1]);

  for (const spec of specs) {
    checked++;
    if (/^[a-z]+:/i.test(spec) || spec.startsWith("//")) {
      fails.push(`${rel(file)} imports off-origin: ${spec}`);
      continue;
    }
    const target = path.resolve(path.dirname(file), spec.split("?")[0]);
    if (!target.startsWith(WWW)) {
      fails.push(`${rel(file)} imports outside the bundle: ${spec}`);
    } else if (!existsSync(target)) {
      fails.push(`${rel(file)} imports a file the bundle does not contain: ${spec}`);
    }
  }
}

/* ---------------------------------------------------------- 2. datasets */

const dataJs = strip(readFileSync(path.join(ROOT, "site/js/data.js"), "utf8"));

/* The bundled content datasets live inside topics.json rather than as files,
   so they are resolved against the bundle's contents, not its filenames. */
const TOPICS = [...dataJs.matchAll(/const TOPICS = new Set\(\[([\s\S]*?)\]\)/g)]
  .flatMap((m) => [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]));
if (TOPICS.length < 20) fails.push(`could not read TOPICS from data.js (found ${TOPICS.length})`);

const topicsPath = path.join(WWW, "data/topics.json");
const topics = existsSync(topicsPath) ? JSON.parse(readFileSync(topicsPath, "utf8")) : {};
if (!existsSync(topicsPath)) fails.push("the bundle has no data/topics.json — every content page is empty offline");

/* Named here because it is genuinely not shipped, so that "missing" and
   "deliberately absent" are different states rather than the same silence.
   articles.json has no generator and nothing in site/js calls articlesFor()
   or articles(); the exports return their fallbacks. If a generator is ever
   written, take the name out of this list rather than adding a file. */
const NOT_SHIPPED = new Set(["articles"]);

for (const m of dataJs.matchAll(/\bload\(\s*"([a-z0-9-]+)"/g)) {
  const name = m[1];
  checked++;
  if (NOT_SHIPPED.has(name)) continue;
  if (TOPICS.includes(name)) {
    if (!Object.prototype.hasOwnProperty.call(topics, name)) {
      fails.push(`"${name}" is a topic but is not in the bundled topics.json`);
    }
    continue;
  }
  if (!existsSync(path.join(WWW, "data", `${name}.json`))) {
    fails.push(`the app loads "${name}" and the bundle has no data/${name}.json`);
  }
}

/* Literal fetch() paths that are not routed through load(): the map's mesh,
   the locale files, anything added later. */
for (const file of [...jsFiles, path.join(ROOT, "site/js/i18n.js")]) {
  const src = strip(readFileSync(file, "utf8"));
  for (const m of src.matchAll(/fetch\(\s*[`"']([^`"'$]*)/g)) {
    const spec = m[1];
    if (!spec) continue;                        // fully interpolated; covered above
    checked++;
    if (/^[a-z]+:\/\//i.test(spec)) {
      fails.push(`${rel(file)} fetches off-origin, which cannot work offline: ${spec}`);
      continue;
    }
    /* Resolved from the document, which in the bundle is at the root — the
       same clamping build-app.mjs relies on for "../data" to land on /data. */
    const target = path.join(WWW, spec.replace(/^(\.\.\/)+/, ""));
    if (!existsSync(target)) {
      fails.push(`${rel(file)} fetches ${spec}, which the bundle does not contain`);
    }
  }
}

/* ----------------------------------------------------------- 3. locales */

/* Switching language offline used to blank the whole interface into raw dot
   paths - see the i18n note in sw.js. On the web that was a cache-rule bug; in
   the bundle it is simply whether the file is there. */
const i18nJs = readFileSync(path.join(ROOT, "site/js/i18n.js"), "utf8");
const localeBlock = i18nJs.match(/export const LOCALES = \[([\s\S]*?)\];/);
const codes = localeBlock
  ? [...localeBlock[1].matchAll(/code:\s*"([^"]+)"/g)].map((m) => m[1])
  : [];
if (!codes.length) fails.push("could not read LOCALES from i18n.js");
for (const code of codes) {
  checked++;
  if (!existsSync(path.join(WWW, "data/i18n", `${code}.json`))) {
    fails.push(`the app offers ${code} and the bundle has no data/i18n/${code}.json`);
  }
}

/* ------------------------------------------------------------- 4. shell */

/* Nothing outside the bundle may be referenced by the document either. The CSP
   forbids it, but a <link> to a font that silently does not load is a layout
   nobody tested rather than an error anybody sees. */
const routesJs = readFileSync(path.join(ROOT, "site/js/routes.js"), "utf8");
const pathBlock = routesJs.match(/export const PATHS = \{([\s\S]*?)\};/);
const ROUTES = pathBlock
  ? new Set([...pathBlock[1].matchAll(/^\s*([a-z]+):/gm)].map((m) => m[1]))
  : new Set();
if (!ROUTES.size) fails.push("could not read PATHS from routes.js");

const html = readFileSync(path.join(WWW, "index.html"), "utf8");
for (const m of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
  const v = m[1];
  if (v.startsWith("#") || v.startsWith("data:")) continue;
  checked++;
  if (/^[a-z]+:/i.test(v)) {
    fails.push(`index.html references an off-origin asset: ${v}`);
    continue;
  }
  const p = v.replace(/^\//, "");
  /* An extensionless absolute path is a ROUTE, not a file - the tab bar ships
     real <a href="/alerts"> so the app degrades to navigable links before
     app.js has loaded, and so the OS treats them as links. Nothing serves them
     inside the bundle: Capacitor's router returns index.html for any path
     without a file extension, which is what makes a deep link open offline.
     What can be checked here is that each one is a route the app knows - a
     mistyped tab href would otherwise land on the shell and render nothing. */
  if (!path.extname(p)) {
    if (!ROUTES.has(p)) fails.push(`index.html links to /${p}, which is not a route in routes.js`);
    continue;
  }
  if (!existsSync(path.join(WWW, p))) {
    fails.push(`index.html references ${v}, which the bundle does not contain`);
  }
}

/* The marker the app reads to know it is running from a bundle. */
checked++;
if (!existsSync(path.join(WWW, "build.json"))) {
  fails.push("www/build.json is missing — nothing can tell packaged from web");
}

/* -------------------------------------------------------------- 5. size */

/* Not correctness, but the reason offline is possible at all: it all fits. If
   this stops being true the answer is to question the bundle, not to start
   fetching pieces of it at runtime. */
const size = (dir) => readdirSync(dir, { withFileTypes: true }).reduce((t, e) => {
  const p = path.join(dir, e.name);
  return t + (e.isDirectory() ? size(p) : readFileSync(p).length);
}, 0);
const mb = size(WWW) / 1024 / 1024;
if (mb > 40) fails.push(`the bundle is ${mb.toFixed(0)} MB`);

console.log("OFFLINE\n");
for (const f of fails) console.log("  not ok " + f);
if (!fails.length) {
  console.log(`  ok   all ${checked} paths the app can request are inside the ${mb.toFixed(1)} MB bundle`);
}
console.log(`\n${fails.length ? 0 : 1} passed, ${fails.length} failed`);
if (fails.length) process.exit(1);
