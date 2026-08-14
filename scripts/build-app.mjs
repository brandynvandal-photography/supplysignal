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

import { cp, rm, mkdir, readdir, stat, writeFile, readFile } from "node:fs/promises";
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
  /* Same reasoning as the web deploy: content ships only inside topics.json,
     so a screen cannot quietly fetch a page-naming file again. */
  const { TOPICS } = await import("./build-topics.mjs");
  const topicFiles = new Set(TOPICS.map((t) => `${t}.json`));

  for (const entry of await readdir(path.join(ROOT, "data"), { withFileTypes: true })) {
    if (SKIP_IN_DATA.has(entry.name) || topicFiles.has(entry.name)) { skipped++; continue; }
    const from = path.join(ROOT, "data", entry.name);
    await cp(from, path.join(dataOut, entry.name), { recursive: true });
    shipped++;
  }

  /* The shell's asset paths are absolute (/site/css/app.css) because on the
     web the document is served at /alerts, /test and the rest, where a
     relative href would resolve against / and 404.
     
     In this bundle the app IS at the root, so those same absolute paths point
     at /site/... which does not exist here - and the failure is total and
     silent: no stylesheet, no module, a blank white screen with Quick Exit and
     SOS both inert. Verified by building and resolving every reference against
     the staged tree. Rewrite them to root-absolute on the way in. */
  const shell = path.join(OUT, "index.html");
  const html = await readFile(shell, "utf8");
  let fixed = html.replace(/(["'])\/site\//g, "$1/");
  if (fixed === html && /\/site\//.test(html)) {
    throw new Error("index.html still references /site/ after rewrite");
  }

  /* One origin, added HERE and nowhere else.
   *
   * site/js/data.js refreshes alerts.json from nightlight.help when the
   * packaged app has signal, because alerts are the one thing in this bundle
   * that goes stale (see refreshAlerts). On the website that is same-origin
   * and needs no permission. In the bundle the document is served from
   * capacitor://localhost, so 'self' is the app - and connect-src 'self'
   * blocks the request with nothing in the UI to show for it.
   *
   * The relaxation is applied to the COPY, so site/index.html keeps
   * connect-src 'self' exactly as test/privacy.test.mjs requires and the
   * website's policy is untouched. test/offline.test.mjs asserts the bundle
   * adds this one origin and nothing else, and that it is the same origin the
   * code actually fetches - so widening it further, or pointing the fetch
   * somewhere the policy does not allow, fails the build rather than shipping
   * a feature that silently does nothing. */
  const ALLOW = "https://nightlight.help";
  const withConnect = fixed.replace(
    /connect-src 'self'/,
    `connect-src 'self' ${ALLOW}`
  );
  if (withConnect === fixed) {
    throw new Error("connect-src 'self' not found in index.html — the alerts refresh would be blocked in the app");
  }
  fixed = withConnect;

  await writeFile(shell, fixed);

  /* Fail loudly rather than shipping a bundle that cannot boot. */
  const missing = [];
  for (const m of fixed.matchAll(/(?:href|src)="(\/[^"]+\.(?:css|js|png|webmanifest))"/g)) {
    if (!existsSync(path.join(OUT, m[1]))) missing.push(m[1]);
  }
  if (missing.length) {
    throw new Error(`bundle references files it does not contain: ${missing.join(", ")}`);
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
