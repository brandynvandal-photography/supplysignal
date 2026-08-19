/* The preload list in index.html is app.js's static import list.
 *
 * WHY THIS EXISTS
 *
 * app.js is a module script at the foot of the body. The browser cannot see
 * its imports until it has fetched and parsed app.js, so on a cold open the
 * shell's module graph arrived in serial waves: app.js, then the five modules
 * it imports, then the view. index.html now carries one
 * <link rel="modulepreload"> per static import so the preload scanner fetches
 * them alongside the stylesheet, and that is the whole saving - one wave
 * instead of two.
 *
 * Two lists of the same thing drift, and here the drift is silent in both
 * directions. A module preloaded but no longer imported is a wasted request on
 * every boot of every device, with nothing in the UI to show it. An import not
 * preloaded is a round trip that has quietly come back, which no test that
 * only reads the source could notice. So both lists are read out of the files
 * and compared as sets.
 *
 * Only STATIC imports. The views, search, the map and the rest are dynamic
 * imports on purpose - loaded when a route or a control asks for them - and a
 * preload for every one of them would pull the entire app on every open, which
 * is the opposite of what the list is for.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(path.join(ROOT, p), "utf8");

const fails = [];

/* Comments stripped first: app.js documents the import it deliberately does
   NOT make (kindness.js), and a scanner that reads its own documentation as
   code would demand a preload for it. */
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const app = strip(read("site/js/app.js"));
const html = read("site/index.html");

/* Static imports: `import ... from "./x.js"` and bare `import "./x.js"`, at the
   top level. Dynamic import("...") calls are deliberately not matched. */
const imports = [...app.matchAll(/^\s*import\s+(?:[\w*{},\s]+\s+from\s+)?["']([^"']+)["']/gm)]
  .map((m) => m[1])
  .map((spec) => path.posix.normalize(path.posix.join("/site/js", spec)))
  .sort();

const preloads = [...html.matchAll(/<link\s+rel="modulepreload"\s+href="([^"]+)"/g)]
  .map((m) => m[1])
  .sort();

if (!imports.length) fails.push("no static imports found in site/js/app.js - the regex is wrong, not the file");
if (!preloads.length) fails.push("no <link rel=\"modulepreload\"> in site/index.html");

const missing = imports.filter((x) => !preloads.includes(x));
const extra = preloads.filter((x) => !imports.includes(x));
if (missing.length) fails.push(`app.js imports these statically but index.html does not preload them: ${missing.join(", ")}`);
if (extra.length) fails.push(`index.html preloads these but app.js no longer imports them statically: ${extra.join(", ")}`);

/* Each preloaded path must be a real file under site/, or the preload is a
   404 on every boot - which, like everything else on this list, shows nowhere. */
for (const p of preloads) {
  try { readFileSync(path.join(ROOT, p.replace(/^\//, ""))); }
  catch { fails.push(`preloaded ${p} does not exist`); }
}

/* The preloads have to be in <head>, ahead of the module script that would
   otherwise be the first thing to name these files - a preload that appears
   after app.js is parsed has nothing left to win. */
const headEnd = html.indexOf("</head>");
const appTag = html.search(/<script type="module" src="\/site\/js\/app\.js">/);
const lastPreload = html.lastIndexOf('rel="modulepreload"');
if (headEnd < 0 || appTag < 0) fails.push("could not find </head> or the app.js module script in site/index.html");
else if (lastPreload > headEnd) fails.push("a modulepreload sits outside <head>");
else if (lastPreload > appTag) fails.push("a modulepreload comes after the app.js module script");

/* The blocking head script must be an absolute /site/ path like every other
   shell reference. Written relative it resolved against /alerts to
   /js/native-flag.js, a 404 that blocked first paint on every web boot. */
const flag = html.match(/<script src="([^"]+native-flag\.js)"><\/script>/);
if (!flag) fails.push("native-flag.js script tag not found in site/index.html");
else if (!flag[1].startsWith("/site/")) fails.push(`native-flag.js is referenced as "${flag[1]}"; it must be /site/js/native-flag.js or the web boots through a blocking 404`);

console.log("PRELOAD\n");
for (const f of fails) console.log("  not ok " + f);
if (!fails.length) {
  console.log(`  ok   index.html preloads exactly app.js's ${imports.length} static imports, in <head>, ahead of the module script`);
}
console.log(`\n${fails.length ? 0 : 1} passed, ${fails.length} failed`);
if (fails.length) process.exit(1);
