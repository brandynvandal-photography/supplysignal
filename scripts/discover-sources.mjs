#!/usr/bin/env node
/**
 * Socrata discovery sweep: which counties have started publishing?
 *
 *   node scripts/discover-sources.mjs            # writes review/source-candidates.json
 *   node scripts/discover-sources.mjs --dry      # prints, writes nothing
 *
 * WHY THIS EXISTS
 *
 * docs/ALERT-SOURCES.md step 7. The four medical-examiner datasets the app
 * ingests were found BY HAND, one catalog search at a time, and the survey's
 * own verdict is that the universe of counties publishing toxicology is
 * small and changes without announcement - Milwaukee and Sacramento were
 * named in a peer-reviewed survey and had already stopped; San Diego was
 * written off on a first pass and turned out to be usable. Nobody is going
 * to repeat that sweep by hand every month. This repeats it every week.
 *
 * WHAT IT DOES NOT DO
 *
 * It ingests nothing. It writes a candidate list for a person to read, and
 * the person decides. A dataset that looks like overdose toxicology can be
 * annual aggregates (Pierce County), a stale archive updated last month with
 * no new years in it (Connecticut, whose "updatedAt" is July 2026 and whose
 * newest record is December 2024), or a dashboard's href stub. The one number
 * that separates those is the newest record date, so this asks each
 * candidate's own endpoint for max(date) - an aggregate, never a row - and
 * prints it beside the catalog's claim.
 *
 * PRIVACY
 *
 * Two kinds of request, both of them about datasets rather than people: the
 * public catalog (titles, descriptions, column names) and one
 * `$select=max(col),count(*)` per candidate. No row of any dataset is ever
 * fetched here. The column NAMES are recorded because they are what tells a
 * reviewer whether a source can be used under PRIVACY.md at all - a dataset
 * whose only location column is a street address is a dataset to skip.
 *
 * A candidate the reviewer rejects goes in `dismissed` in the output file
 * with a reason, and stays out of every later run's list.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "review", "source-candidates.json");
const UA = "Nightlight source discovery (https://nightlight.help; hello@nightlight.help)";
const CATALOG = "https://api.us.socrata.com/api/catalog/v1";

/* The phrasings that found the four sources we have, plus the ones a county
   would use for the same thing. Each is one catalog request. */
export const QUERIES = [
  '"medical examiner" overdose',
  '"overdose deaths"',
  'overdose toxicology',
  'coroner overdose',
  'fentanyl deaths',
  '"drug checking"',
];

/* Words in a title or description that make a dataset worth a human's
   minute, and words that mean it is something else wearing the name. */
const WANT = /\b(overdose|toxicolog|medical examiner|coroner|fentanyl|drug[- ]related deaths|drug checking|xylazine)\b/i;
const NOISE = /\b(emergency department visits|ems|911 calls|naloxone administrations|prescri|hospital|arrests|survey|dashboard)\b/i;

/** Pick the column most likely to be the record date, or null. */
export function pickDateColumn(names = [], types = []) {
  const cols = names.map((n, i) => ({ name: n, type: types[i] || "" }));
  const dated = cols.filter((c) => /calendar_date|floating_timestamp|date/i.test(c.type));
  /* A death date beats an incident date beats a generic one; a "year" column
     is an aggregate and says nothing about freshness. */
  const rank = (c) =>
    /death/i.test(c.name) ? 0 : /incident|event|collect/i.test(c.name) ? 1 : /date/i.test(c.name) ? 2 : 3;
  const byType = dated.sort((a, b) => rank(a) - rank(b));
  if (byType.length) return byType[0].name;
  const byName = cols.filter((c) => /date/i.test(c.name) && !/year|update/i.test(c.name)).sort((a, b) => rank(a) - rank(b));
  return byName.length ? byName[0].name : null;
}

/** Keep the datasets a reviewer should see, drop the ones they should not. */
export function rankCandidates(results, { known = new Set(), dismissed = new Set() } = {}) {
  const seen = new Map();
  for (const r of results) {
    const id = r?.resource?.id;
    const domain = r?.metadata?.domain;
    if (!id || !domain) continue;
    if (known.has(id) || dismissed.has(id)) continue;
    if (seen.has(id)) continue;
    const text = `${r.resource.name || ""} ${r.resource.description || ""}`;
    if (!WANT.test(text)) continue;
    const noisy = NOISE.test(text);
    seen.set(id, {
      id, domain,
      name: r.resource.name || "",
      permalink: r.permalink || `https://${domain}/d/${id}`,
      updatedAt: r.resource.updatedAt || null,
      category: r.classification?.domain_category || null,
      description: String(r.resource.description || "").slice(0, 300),
      columns: (r.resource.columns_name || []).slice(0, 40),
      dateColumn: pickDateColumn(r.resource.columns_name, r.resource.columns_datatype),
      /* Kept, but flagged: a reviewer scanning the list should see that the
         title says "ED visits" before opening it. */
      noisy,
    });
  }
  return [...seen.values()];
}

async function getJson(url, ms = 20000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const headers = { "user-agent": UA, accept: "application/json" };
    if (process.env.SOCRATA_APP_TOKEN) headers["x-app-token"] = process.env.SOCRATA_APP_TOKEN;
    const res = await fetch(url, { headers, signal: ctl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally { clearTimeout(t); }
}

/** The newest record and the row count, as the dataset's own endpoint reports them. */
async function freshness(c) {
  if (!c.dateColumn) return { latest: null, rows: null, note: "no date column" };
  const url = `https://${c.domain}/resource/${c.id}.json?$select=max(${c.dateColumn}) AS latest, count(*) AS rows`;
  try {
    const [row] = await getJson(url, 15000);
    return { latest: row?.latest ? String(row.latest).slice(0, 10) : null, rows: row?.rows ? Number(row.rows) : null, note: null };
  } catch (e) {
    return { latest: null, rows: null, note: `freshness query failed: ${e.message}` };
  }
}

/** Dataset ids the app already ingests, so they never show up as "new". */
async function knownIds() {
  const sources = JSON.parse(await readFile(path.join(ROOT, "config", "sources.json"), "utf8"));
  const ids = new Set();
  for (const s of sources.medicalExaminers?.sources || []) {
    const m = String(s.url || "").match(/\/resource\/([a-z0-9]{4}-[a-z0-9]{4})/i);
    if (m) ids.add(m[1]);
    if (s.resource) ids.add(s.resource);
  }
  return ids;
}

async function main() {
  const dry = process.argv.includes("--dry");
  const previous = existsSync(OUT) ? JSON.parse(await readFile(OUT, "utf8")) : { dismissed: [] };
  const dismissed = new Set((previous.dismissed || []).map((d) => d.id));
  const known = await knownIds();

  const results = [];
  for (const q of QUERIES) {
    const url = `${CATALOG}?q=${encodeURIComponent(q)}&only=datasets&limit=100`;
    try {
      const j = await getJson(url);
      results.push(...(j.results || []));
    } catch (e) {
      console.error(`[discover] catalog query failed for ${q}: ${e.message}`);
    }
  }

  const candidates = rankCandidates(results, { known, dismissed });
  /* One aggregate query each, sequential and polite - these are county
     portals, not a CDN. Capped so a broad match can never fan out. */
  for (const c of candidates.slice(0, 40)) Object.assign(c, await freshness(c));
  candidates.sort((a, b) => String(b.latest || "").localeCompare(String(a.latest || "")));

  const out = {
    _note: "GENERATED weekly by scripts/discover-sources.mjs from the Socrata Discovery API. Nothing here is ingested; a person reads it. `latest` is max(date column) reported by the dataset's own endpoint - the number that separates a live source from a stale archive. To reject one for good, move it into `dismissed` with a reason.",
    generated: new Date().toISOString(),
    queries: QUERIES,
    known: [...known],
    candidates,
    dismissed: previous.dismissed || [],
  };

  const line = (c) => `${(c.latest || "-").padEnd(10)}  ${String(c.rows ?? "-").padStart(7)}  ${c.domain.padEnd(36)}  ${c.name.slice(0, 60)}${c.noisy ? "  [noisy]" : ""}`;
  console.log(`DISCOVER  ${candidates.length} candidates (${known.size} known, ${dismissed.size} dismissed)\n`);
  console.log(`${"latest".padEnd(10)}  ${"rows".padStart(7)}  ${"domain".padEnd(36)}  name`);
  for (const c of candidates) console.log(line(c));

  if (dry) return;
  await mkdir(path.dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(out, null, 2) + "\n");
  console.log(`\nwrote ${path.relative(ROOT, OUT)}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
