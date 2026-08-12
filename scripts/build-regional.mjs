// Build data/regional.json - which substances belong to which part of the country.
//
// Source: the UNC Street Drug Analysis Lab's regional infographic, which is
// released CC0 (public domain). Over four years of mail-in drug checking,
// January 2022 to April 2026.
//
// Its finding is the most useful thing in this app for a county-level tool:
// of the 90 substances UNC detects routinely, only 20 turn up everywhere at
// similar rates. The other 70 are regionally concentrated, some 80-90% inside
// a single region. A national average is wrong nearly everywhere - which is
// the same argument the bordering-counties feature rests on, with evidence.
//
// Fetched at BUILD time and re-rendered by us rather than embedded. An iframe
// would be a third-party request to github.io announcing that this reader
// opened the page, which the CSP blocks and PRIVACY.md forbids.
//
//   node scripts/build-regional.mjs

import { writeFileSync } from "node:fs";

const SRC =
  "https://opioiddatalab.github.io/dataviz/regional/regional_drugs_infographic.html";

const res = await fetch(SRC, {
  headers: { "user-agent": "SupplyCheck/1.0 (public health harm reduction)" },
});
if (!res.ok) throw new Error(`UNC infographic: HTTP ${res.status}`);
const html = await res.text();

/* The page ships its dataset inline as `window.SUBSTANCES = [...]`. */
const m = html.match(/window\.SUBSTANCES\s*=\s*(\[[\s\S]*?\]);/);
if (!m) throw new Error("window.SUBSTANCES not found - the page format changed");
const raw = JSON.parse(m[1]);

const REGIONS = ["Northeast", "Midwest", "South", "West"];

const r3 = (n) => Math.round(n * 1000) / 1000;
const r1 = (n) => Math.round(n * 10) / 10;

const substances = raw
  .map((s) => ({
    name: s.name,
    // Share of all national detections that came from each region.
    share: REGIONS.map((r) => r3(s.shares?.[r] ?? 0)),
    // Detections per 1,000 samples in that region.
    rate: REGIONS.map((r) => r1(s.rates?.[r] ?? 0)),
    group: s.group || "Ubiquitous",
    desc: s.desc || "",
  }))
  .sort((a, b) => b.share[maxIdx(b.share)] - a.share[maxIdx(a.share)]);

function maxIdx(arr) {
  let bi = 0;
  for (let i = 1; i < arr.length; i++) if (arr[i] > arr[bi]) bi = i;
  return bi;
}

/* Census region for every state, so a county can be told what is characteristic
   of its own part of the country. The territories sit outside the four Census
   regions; they map to null and the UI says so rather than guessing. */
const STATE_REGION = {};
const put = (region, codes) => codes.split(" ").forEach((c) => (STATE_REGION[c] = region));
put("Northeast", "CT ME MA NH RI VT NJ NY PA");
put("Midwest", "IL IN MI OH WI IA KS MN MO NE ND SD");
put("South", "DE DC FL GA MD NC SC VA WV AL KY MS TN AR LA OK TX");
put("West", "AZ CO ID MT NV NM UT WY AK CA HI OR WA");

const counts = {};
for (const s of substances) counts[s.group] = (counts[s.group] || 0) + 1;

const payload = {
  generated: new Date().toISOString(),
  period: "January 2022 – April 2026",
  regions: REGIONS,
  stateRegion: STATE_REGION,
  groupCounts: counts,
  headline: "There is no single American drug supply. There are at least four.",
  summary:
    "Of 90 substances detected routinely in mail-in drug checking, only 20 turn " +
    "up everywhere at similar rates. The other 70 are concentrated — some 80 to " +
    "90 percent confined to a single region. A substance is counted as regional " +
    "when one region holds at least 35% of its national signal.",
  caveat:
    "This is not a random sample of the US drug supply. It is what reaches harm " +
    "reduction programs and drug-checking partners, and that coverage is uneven — " +
    "strong in some states, thin in others.",
  source: {
    name: "UNC Street Drug Analysis Lab",
    url: "https://www.opioiddata.org/",
    attribution: "UNC Street Drug Analysis Lab at opioiddata.org",
    license: "CC0 1.0 (public domain)",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
  },
  substances,
};

writeFileSync("data/regional.json", JSON.stringify(payload));

const kb = (Buffer.byteLength(JSON.stringify(payload)) / 1024).toFixed(0);
console.log(`substances: ${substances.length}`);
for (const [g, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
  console.log(`   ${String(n).padStart(3)}  ${g}`);
}
console.log(`states mapped: ${Object.keys(STATE_REGION).length}`);
console.log(`size: ${kb} KB`);
