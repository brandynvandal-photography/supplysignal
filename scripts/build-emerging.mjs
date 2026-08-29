/* Early warning: substances appearing elsewhere, ahead of local reporting.
 *
 * Two national feeds, fetched HERE at build time and bundled. The browser never
 * touches either one - see PRIVACY.md. Run by the same GitHub Action as the
 * other ingests.
 *
 *   node scripts/build-emerging.mjs
 *
 * WHAT THIS IS NOT
 * ----------------
 * Neither source is county-level, and neither describes anyone's local supply.
 * Health Canada's file is law-enforcement SEIZURES in Canada; Health Canada
 * says plainly it "may not be representative of all drug seizures in Canada or
 * of substances circulating on the illicit drug market". CFSRE's alerts are
 * national US.
 *
 * The value is lead time, not prevalence: xylazine, then medetomidine, then the
 * nitazenes each surfaced in Canadian forensic surveillance before comparable
 * US signal existed. So this build keeps ONLY the early-warning payload and
 * deliberately discards the rest:
 *
 *   - Health Canada: only DRUG_ALERT_TRIGGER = 1, "first detection of a
 *     substance of concern". The volume and prevalence files are NOT ingested
 *     at all - they are the part most likely to be misread as "how much of this
 *     is around", and they carry the least meaning for a US reader.
 *   - Province is dropped and rolled up to national. A provincial breakdown
 *     tells someone in Ohio nothing and adds a lot of misreading surface.
 *   - CFSRE: title, date and link only. Their abstracts are creative prose
 *     under a thin licence (see LICENCES below), so they are not copied.
 *
 * LICENCES
 * --------
 * Health Canada infobase CSVs are NOT under the Open Government Licence. They
 * fall under canada.ca terms: reproduction permitted for NON-COMMERCIAL
 * purposes with attribution of title, author and source URL. This app is free
 * and non-commercial. If that ever changes, this feed must be dropped or
 * re-licensed in writing.
 *
 * CFSRE grants no redistribution rights anywhere on their site. Titles, dates
 * and links are facts and may be aggregated; their report PDFs are NOT
 * mirrored and their abstract text is NOT copied.
 */

import { writeFile, mkdir } from "node:fs/promises";
import { stableStamp } from "./stable.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "data", "emerging.json");

const DAS = "https://health-infobase.canada.ca/src/data/DAS";
const CFSRE_RSS = "https://www.cfsre.org/nps-discovery/public-alerts?format=feed&type=rss";

/* cfsre.org rejects a default client UA with 403, and rejects HEAD even with a
   browser UA. GET with a browser UA only. */
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/126.0 Safari/537.36";

async function get(url, label) {
  const res = await fetch(url, { headers: { "user-agent": UA, accept: "*/*" } });
  if (!res.ok) throw new Error(`${label}: HTTP ${res.status} for ${url}`);
  return res.text();
}

/* ------------------------------------------------------------------- csv */

/** Minimal RFC-4180 reader. Quoted fields matter here: SECONDARY_SUBSTANCE
 *  _REPORTED holds comma-separated codes inside one quoted cell. */
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') { quoted = true; continue; }
    if (c === ",") { row.push(field); field = ""; continue; }
    if (c === "\r") continue;
    if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; continue; }
    field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }

  const header = rows.shift().map((h) => h.trim().replace(/^﻿/, ""));
  return rows
    .filter((r) => r.length && r.some((v) => v !== ""))
    .map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? "").trim()])));
}

/* -------------------------------------------------------- health canada */

async function healthCanada() {
  const [alertsCsv, dictCsv] = await Promise.all([
    get(`${DAS}/map/new_drug_alert_data.csv`, "DAS alerts"),
    get(`${DAS}/newLayout/ex_DASList.csv`, "DAS substance dictionary"),
  ]);

  /* Columns are LIMS (the code used in the alert file) and Name.EN. Not the
     CODE/ENGLISH you might assume - checked against the live header. Rows with
     an empty LIMS exist and must be skipped rather than keyed on "". */
  const dict = new Map();
  for (const r of parseCsv(dictCsv)) {
    const code = (r.LIMS || "").trim();
    const name = (r["Name.EN"] || "").trim();
    if (code && name) dict.set(code.toUpperCase(), name);
  }
  if (!dict.size) throw new Error("substance dictionary parsed to zero entries");
  const nameOf = (code) => dict.get(String(code).trim().toUpperCase()) || null;

  const rows = parseCsv(alertsCsv)
    // 1 = "first detection of a substance of concern". This is the whole point;
    // trigger 2 ("unusual form") is not an early-warning signal.
    .filter((r) => String(r.DRUG_ALERT_TRIGGER).trim() === "1");

  /* Roll up to substance. One row per substance with its FIRST detection date
     and how many notifications have mentioned it since - never a rate, never a
     province. */
  const bySub = new Map();
  for (const r of rows) {
    const date = r.DATE;
    if (!date || Number.isNaN(Date.parse(date))) continue;

    const codes = [r.PRIMARY_SUBSTANCE_REPORTED, ...(r.SECONDARY_SUBSTANCE_REPORTED || "").split(",")]
      .map((c) => c.trim()).filter(Boolean);

    for (const code of codes) {
      const name = nameOf(code);
      if (!name) continue;                     // unresolvable code: skip, never guess
      const cur = bySub.get(name) || { name, first: date, mentions: 0 };
      if (date < cur.first) cur.first = date;
      cur.mentions++;
      bySub.set(name, cur);
    }
  }

  return [...bySub.values()]
    .sort((a, b) => b.first.localeCompare(a.first))
    .map((s) => ({
      kind: "first-detection",
      source: "hc",
      substance: s.name,
      date: s.first,
      mentions: s.mentions,
    }));
}

/* ---------------------------------------------------------------- cfsre */

const decode = (s) =>
  s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
   .replace(/<[^>]+>/g, " ")
   .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
   .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ")
   .replace(/\s+/g, " ").trim();

async function cfsre() {
  const xml = await get(CFSRE_RSS, "CFSRE public alerts");
  const items = [];

  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const block = m[1];
    const pick = (tag) => {
      const t = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
      return t ? decode(t[1]) : null;
    };
    const title = pick("title");
    const link = pick("link");
    const pub = pick("pubDate");
    const when = pub ? new Date(pub) : null;
    if (!title || !link || !when || Number.isNaN(+when)) continue;

    /* Title, date and link only. The <description> abstract is their prose and
       is deliberately not copied - see LICENCES in the header. */
    items.push({
      kind: "alert",
      source: "cfsre",
      title,
      url: link,
      date: when.toISOString().slice(0, 10),
    });
  }
  return items.sort((a, b) => b.date.localeCompare(a.date));
}

/* ----------------------------------------------------------------- main */

const results = await Promise.allSettled([healthCanada(), cfsre()]);
const [hc, cf] = results;

for (const [label, r] of [["Health Canada", hc], ["CFSRE", cf]]) {
  if (r.status === "rejected") console.error(`  ! ${label} failed: ${r.reason.message}`);
}
if (results.every((r) => r.status === "rejected")) {
  console.error("Both feeds failed - refusing to write an empty file over good data.");
  process.exit(1);
}

const doc = {
  generated: new Date().toISOString(),
  /* Rendered in the UI. Attribution is a licence condition for Health Canada,
     not a courtesy. */
  /* Global systems worth a human's eyes, with no fetchable feed. Listed as
     link-outs, never ingested:
       - EUDA's EU Early Warning System is the widest tripwire there is (1000+
         NPS monitored) but euda.europa.eu 403s every automated client tried,
         and full EWS alerts are member-state restricted.
       - UNODC's EWA is a JS portal with no feed.
     Note for future readers: "early warning from Mexico/China" is not a thing
     any system provides - origin countries publish no checking data. Early
     warning comes from where drugs are USED and tested, which is what Canada,
     CFSRE, and the EU each are. */
  globalLinks: [
    { name: "EU Early Warning System on new substances", author: "European Union Drugs Agency",
      url: "https://www.euda.europa.eu/publications/topic-overviews/catalogue-page/topic-overview-eu-early-warning-system-nps_en",
      note: "Monitors over a thousand new substances across Europe. New synthetic opioids often appear in European data around when they reach North America - a second continent's tripwire." },
    { name: "UNODC Early Warning Advisory", author: "United Nations Office on Drugs and Crime",
      url: "https://www.unodc.org/LSS/Home/NPS",
      note: "The global registry of newly identified substances." },
  ],
  sources: [
    {
      id: "hc",
      name: "Drug Analysis Service",
      author: "Health Canada",
      url: "https://health-infobase.canada.ca/drug-analysis-service/drug-notification-map.html",
      scope: "Canada, national",
      note: "Substances identified in seizures submitted to Canada's national drug lab. " +
            "Seizure data does not describe what is circulating in any US community.",
    },
    {
      id: "cfsre",
      name: "NPS Discovery public alerts",
      author: "Center for Forensic Science Research & Education",
      url: "https://www.cfsre.org/nps-discovery/public-alerts",
      scope: "United States, national",
      note: "Expert alerts on newly identified substances. National in scope, not local.",
    },
  ],
  firstDetections: hc.status === "fulfilled" ? hc.value : [],
  alerts: cf.status === "fulfilled" ? cf.value : [],
};

await mkdir(path.dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify(stableStamp(OUT, doc), null, 2));

console.log(`first detections (Canada): ${doc.firstDetections.length}`);
console.log(`public alerts (US):        ${doc.alerts.length}`);
console.log(`wrote ${path.relative(ROOT, OUT)}`);
