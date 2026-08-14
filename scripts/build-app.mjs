// Assemble www/ — the web root a Capacitor build ships.
//
//   node scripts/build-app.mjs
//
// WHY THIS EXISTS
//
// On the web, the app lives at /site/ and its datasets at /data/, siblings.
// site/js/data.js fetches "../data/<name>.json" and site/js/i18n.js fetches
// "../data/i18n/<code>.json", both resolved against the document base of
// /site/ — so they land on /data/. That works because Netlify publishes the
// repo root.
//
// A Capacitor app has ONE web root. Point webDir at site/ and every dataset
// 404s, because data/ is above it and nothing above webDir is copied into the
// bundle. The app would launch, render its shell, and show empty screens
// everywhere — which is close to the 2.1 rejection this project has had once
// already.
//
// So: stage a directory where the app is at the root and data/ sits beside it.
// The relative paths then still resolve, because "../data/x.json" against a
// base of "/" clamps to "/data/x.json" (RFC 3986 remove_dot_segments drops a
// leading "..", it does not escape the root). That means NO source changes —
// the same files serve the web and the app, and there is no second code path
// to keep in sync.
//
// WHAT IS DELIBERATELY LEFT OUT, and why it matters:
//   data/counties/    per-county files. The client never fetches one — sw.js
//                     refuses to cache them precisely because a per-county URL
//                     is the leak this app is built to avoid. Shipping them
//                     would put 3,231 filenames in the bundle for nothing.
//   feeds/            per-county RSS, for external readers. Same reasoning.
//   data/.cache.json  scraper HTTP etags. Internal state.
//   data/.rotation.json  the source-rotation cursor. Internal state.
//   data/runs.json    scan telemetry. Never fetched by the client.
//
// Everything else in data/ is a national bundle, byte-identical for every
// user, which is the whole privacy design — and putting it INSIDE the app is
// strictly better than fetching it: no network at all for a lookup, and the
// app works from a cold start with no signal.

import { cp, rm, mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "www");

/* Per-county or internal. See the header for why each one is excluded. */
const SKIP_IN_DATA = new Set([
  "counties",          // directory: per-county files
  ".cache.json",
  ".rotation.json",
  ".medex.json",       // one-look-per-data-state cache
  "runs.json",
]);

async function dirSize(dir) {
  let total = 0;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    total += entry.isDirectory() ? await dirSize(p) : (await stat(p)).size;
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

  /* The app, at the root of the bundle. */
  await cp(path.join(ROOT, "site"), OUT, { recursive: true });

  /* The national bundles, beside it, so "../data/..." still resolves. */
  const dataOut = path.join(OUT, "data");
  await mkdir(dataOut, { recursive: true });
  let shipped = 0, skipped = 0;
  for (const entry of await readdir(path.join(ROOT, "data"), { withFileTypes: true })) {
    if (SKIP_IN_DATA.has(entry.name)) { skipped++; continue; }
    const from = path.join(ROOT, "data", entry.name);
    await cp(from, path.join(dataOut, entry.name), { recursive: true });
    shipped++;
  }

  /* A marker the app can read to know it is running from a bundle rather than
     off the network. Nothing depends on it yet; it exists so the alerts
     refresh and the Quick Exit branch have something honest to key off that is
     not user-agent sniffing. */
  await writeFile(
    path.join(OUT, "build.json"),
    JSON.stringify({ packaged: true, builtFrom: "scripts/build-app.mjs" }, null, 2) + "\n"
  );

  const total = await dirSize(OUT);
  console.log(`www/ assembled`);
  console.log(`  app       ${kb(await dirSize(path.join(ROOT, "site")))}`);
  console.log(`  data      ${kb(await dirSize(dataOut))}  (${shipped} entries, ${skipped} skipped)`);
  console.log(`  TOTAL     ${kb(total)}`);
  if (total > 40 * 1024 * 1024) {
    console.warn(`  WARNING: over 40 MB. The App Store cellular download limit is 200 MB,`);
    console.warn(`  but a bundle this size is worth questioning before it ships.`);
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
