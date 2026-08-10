#!/usr/bin/env node
/**
 * Gate 3, nightly pass. Alerts age out of the window over time; this moves
 * them to archive/ so reads never surface them, while keeping the record.
 */

import path from "node:path";
import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { readJson, writeJson } from "./store.mjs";
import { withinWindow } from "./recency.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const p = (...a) => path.join(ROOT, ...a);

const settings = await readJson(p("config/settings.json"));
const days = settings.recency.windowDays;

let files = [];
try {
  files = (await readdir(p("data/counties"))).filter((f) => f.endsWith(".json"));
} catch {
  console.log("no county data yet");
  process.exit(0);
}

let aged = 0, kept = 0;
const archive = {};

for (const f of files) {
  const file = p("data/counties", f);
  const doc = await readJson(file, null);
  if (!doc?.clusters) continue;

  const fresh = doc.clusters.filter((c) => withinWindow(c.eventDate, days));
  const stale = doc.clusters.filter((c) => !withinWindow(c.eventDate, days));

  if (stale.length) {
    aged += stale.length;
    for (const c of stale) {
      const year = String(c.eventDate).slice(0, 4);
      (archive[year] ||= []).push({ ...c, fips: doc.fips });
    }
    await writeJson(file, {
      ...doc,
      clusters: fresh,
      coverage: { ...doc.coverage, lastAged: new Date().toISOString() },
    });
  }
  kept += fresh.length;
}

for (const [year, items] of Object.entries(archive)) {
  const file = p("archive", `${year}.json`);
  const prev = await readJson(file, { clusters: [] });
  const seen = new Set(prev.clusters.map((c) => c.id));
  await writeJson(file, {
    clusters: [...prev.clusters, ...items.filter((c) => !seen.has(c.id))],
  });
}

console.log(JSON.stringify({ aged, kept, archivedYears: Object.keys(archive) }));
