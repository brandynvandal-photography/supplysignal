// Stage dist/ — exactly what the web is allowed to reach.
//
//   node scripts/build-site.mjs
//
// WHY THIS EXISTS
//
// netlify.toml used to publish the repository root and keep server-side files
// off the web with a DENYLIST: a list of forced-404 redirect rules over
// /src/*, /config/*, /review/* and the rest. That is the wrong shape of
// control, and it did not hold.
//
// Netlify matches redirect rules CASE-SENSITIVELY. Verified against production
// on 2026-08-14:
//
//   /src/ingest.mjs        404          /Src/ingest.mjs        200
//   /config/settings.json  404          /Config/settings.json  200
//   /review/seen.json      404          /Review/seen.json      200
//   /src%2Fingest.mjs      200   (percent-encoding the slash, too)
//
// One capital letter defeated the only access control on the deploy. And the
// deeper problem is the direction: a denylist ships every NEW top-level
// directory public by default, so the next person to add one has to remember a
// rule that nothing will remind them about.
//
// So this inverts it. Only what is listed here is uploaded. A file that is not
// named cannot be served however it is spelled, escaped, or cased, because it
// is not there. netlify.toml keeps its 404 rules as defence in depth for
// anything that slips into dist/ by accident.
//
// WHAT IS PUBLIC, AND WHY EACH ONE:
//   site/         the app
//   data/         its national bundles - loaded by relative path, so data/ has
//                 to stay a sibling of site/. Internal state is excluded below.
//   feeds/        per-county RSS, published deliberately for external readers
//   privacy/      App Store Connect requires a reachable privacy policy URL
//   app-support/  App Store Connect requires a reachable support URL
//   index.html    the no-JavaScript fallback at /
//   404.html      the page every denied path resolves to
//
// Everything else - src/, config/, scripts/, test/, docs/, review/, archive/,
// .github/, package.json, node_modules/ - simply is not copied.

import { cp, rm, mkdir, readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "dist");

/** The allowlist. Anything not named here is never uploaded. */
export const PUBLIC = [
  "site",
  "data",
  "feeds",
  "privacy",
  "app-support",
  "index.html",
  "404.html",
];

/* Internal state that lives inside data/ and must not ship. Same reasoning as
   scripts/build-app.mjs: scraper etags, the rotation cursor, the one-look
   cache and the run log are bookkeeping no reader ever fetches. */
export const SKIP_IN_DATA = new Set([
  ".cache.json",
  ".rotation.json",
  ".medex.json",
  "runs.json",
]);

/* The content datasets ship ONLY inside data/topics.json.
 *
 * Leaving the individual files deployed would mean a future screen could fetch
 * one directly and reinstate the exact leak the bundle exists to close - a
 * request naming the page the reader opened - with nothing failing. They are
 * kept in the repo, because they are the editable source; they just do not go
 * out. See scripts/build-topics.mjs. */
async function topicFiles() {
  const { TOPICS } = await import("./build-topics.mjs");
  return new Set(TOPICS.map((t) => `${t}.json`));
}

async function dirSize(dir) {
  let total = 0;
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    total += e.isDirectory() ? await dirSize(p) : (await stat(p)).size;
  }
  return total;
}
const kb = (b) => `${(b / 1024).toFixed(0)} KB`;

async function main() {
  if (!existsSync(path.join(ROOT, "site", "index.html"))) {
    throw new Error("site/index.html not found — run this from the repo root");
  }

  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });

  let copied = 0;
  for (const entry of PUBLIC) {
    const from = path.join(ROOT, entry);
    if (!existsSync(from)) {
      /* feeds/ does not exist until the first ingest run. Everything else
         missing is a real problem worth failing on. */
      if (entry === "feeds") continue;
      throw new Error(`allowlisted path is missing: ${entry}`);
    }
    if (entry === "data") {
      const dataOut = path.join(OUT, "data");
      await mkdir(dataOut, { recursive: true });
      const topics = await topicFiles();
      for (const e of await readdir(from, { withFileTypes: true })) {
        if (SKIP_IN_DATA.has(e.name) || topics.has(e.name)) continue;
        await cp(path.join(from, e.name), path.join(dataOut, e.name), { recursive: true });
      }
    } else {
      await cp(from, path.join(OUT, entry), { recursive: true });
    }
    copied++;
  }

  /* Fail loudly if anything server-side made it in. This is the assertion the
     denylist could not make: it is a statement about what EXISTS, not about
     what a redirect rule happens to match. */
  const FORBIDDEN = ["src", "config", "scripts", "test", "docs", "review",
                     "archive", "node_modules", "www", ".github", ".git",
                     "package.json", "package-lock.json", "netlify.toml"];
  const present = new Set(await readdir(OUT));
  const leaked = FORBIDDEN.filter((f) => present.has(f));
  if (leaked.length) throw new Error(`server-side paths leaked into dist/: ${leaked.join(", ")}`);

  console.log("dist/ staged");
  for (const e of [...present].sort()) {
    const p = path.join(OUT, e);
    const s = (await stat(p)).isDirectory() ? await dirSize(p) : (await stat(p)).size;
    console.log(`  ${e.padEnd(14)} ${kb(s)}`);
  }
  console.log(`  ${"TOTAL".padEnd(14)} ${kb(await dirSize(OUT))}   (${copied} allowlisted paths)`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
