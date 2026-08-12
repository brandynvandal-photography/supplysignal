/**
 * Git is the database. Every run writes JSON and commits; `git diff` between
 * commits IS the new-alert detection, and history is a free audit trail.
 */

import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";

const DISCLAIMER =
  "Aggregated from public reporting and not independently verified. " +
  "Many changes in local drug supply are never publicly announced, and reporting lags reality. " +
  "No alerts does not mean a safe supply.";

export async function readJson(p, fallback) {
  try {
    if (!existsSync(p)) return fallback;
    return JSON.parse(await readFile(p, "utf8"));
  } catch {
    return fallback;
  }
}

export async function writeJson(p, obj) {
  await mkdir(path.dirname(p), { recursive: true });
  await writeFile(p, JSON.stringify(obj, null, 2) + "\n", "utf8");
}

export async function writeCounty(root, county, clusters, coverage) {
  const p = path.join(root, "data", "counties", `${county.fips}.json`);
  const prev = await readJson(p, { clusters: [] });
  const prevIds = new Set((prev.clusters || []).map((c) => c.id));
  const newIds = clusters.filter((c) => !prevIds.has(c.id)).map((c) => c.id);

  await writeJson(p, {
    fips: county.fips,
    name: county.name,
    state: county.state,
    clusters,
    coverage: { ...coverage, disclaimer: DISCLAIMER },
    newSinceLastRun: newIds,
  });

  return { newIds, total: clusters.length };
}

export async function writeIndex(root, entries) {
  await writeJson(path.join(root, "data", "index.json"), {
    generated: new Date().toISOString(),
    disclaimer: DISCLAIMER,
    counties: entries,
  });
}

const esc = (s) =>
  String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Per-county RSS. Free notifications with zero infrastructure. */
export async function writeCountyFeed(root, county, clusters, siteUrl) {
  const items = clusters
    .slice(0, 25)
    .map(
      (c) => `    <item>
      <title>[${c.severity.toUpperCase()}] ${esc(c.headline)}</title>
      <link>${esc(c.sources?.[0]?.url || siteUrl)}</link>
      <guid isPermaLink="false">${esc(c.id)}</guid>
      <pubDate>${new Date(c.eventDate).toUTCString()}</pubDate>
      <description>${esc(
        `${c.substances?.join(", ") || "unspecified"} — ${c.summary} (${c.sourceCount} source${
          c.sourceCount > 1 ? "s" : ""
        }). ${DISCLAIMER}`
      )}</description>
    </item>`
    )
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Supply Check — ${esc(county.name)}, ${esc(county.state)}</title>
    <link>${siteUrl}/#/${county.fips}</link>
    <description>${esc(DISCLAIMER)}</description>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>
`;
  const p = path.join(root, "feeds", `${county.fips}.xml`);
  await mkdir(path.dirname(p), { recursive: true });
  await writeFile(p, xml, "utf8");
}

/**
 * One national bundle of every live cluster, which is what the site actually
 * reads.
 *
 * The per-county files above still exist - they are a clean API surface and
 * they drive the RSS feeds - but the browser must never request one. Fetching
 * `data/counties/47065.json` writes "this IP looked up Hamilton County" into
 * the host's access log, and on a static host the operator cannot turn that
 * logging off. Shipping one identical bundle to everyone means the log shows
 * only that somebody opened the site. See PRIVACY.md §1.
 */
export async function writeAlertsBundle(root, { windowDays, coverage }) {
  const dir = path.join(root, "data", "counties");
  if (!existsSync(dir)) return { clusters: 0, bytes: 0 };

  const cutoff = Date.now() - windowDays * 86400000;
  const clusters = [];

  for (const file of await readdir(dir)) {
    if (!file.endsWith(".json")) continue;
    const doc = await readJson(path.join(dir, file), null);
    if (!doc?.clusters) continue;
    for (const c of doc.clusters) {
      if (Date.parse(c.eventDate) >= cutoff) clusters.push(c);
    }
  }

  const rank = { critical: 0, elevated: 1, advisory: 2 };
  clusters.sort(
    (a, b) =>
      rank[a.severity] - rank[b.severity] || String(b.eventDate).localeCompare(a.eventDate)
  );

  const payload = {
    generated: new Date().toISOString(),
    windowDays,
    disclaimer: DISCLAIMER,
    coverage,
    clusters,
  };

  const p = path.join(root, "data", "alerts.json");
  await writeJson(p, payload);

  // Guardrail: the privacy design tolerates a big bundle, but not an unbounded
  // one. If this trips, shard by REGION (multi-state groups) - never by county,
  // which would put the leak straight back.
  const gz = gzipSync(Buffer.from(JSON.stringify(payload))).length;
  if (gz > 600 * 1024) {
    console.warn(
      `[bundle] alerts.json is ${(gz / 1024).toFixed(0)} KB gzipped, over the ` +
      `600 KB threshold. Shard by region - see PRIVACY.md §1.`
    );
  }
  return { clusters: clusters.length, bytes: gz };
}

export async function appendReview(root, items) {
  const p = path.join(root, "review", "pending.json");
  const prev = await readJson(p, { items: [] });
  const seen = new Set(prev.items.map((i) => i.url));
  const merged = [...prev.items, ...items.filter((i) => !seen.has(i.url))].slice(-500);
  await writeJson(p, { updated: new Date().toISOString(), items: merged });
}

export async function writeRunLog(root, log) {
  const p = path.join(root, "data", "runs.json");
  const prev = await readJson(p, { runs: [] });
  const runs = [log, ...prev.runs].slice(0, 168); // one week of hourly runs
  await writeJson(p, { runs });
}

export { DISCLAIMER };
