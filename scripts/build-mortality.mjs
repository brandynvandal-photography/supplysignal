// Build data/mortality.json - county overdose death trend.
//
// CDC's provisional county dataset (gb4e-yj24) gives a 12-month rolling count
// of drug overdose deaths per county. Comparing the newest window against the
// same window a year earlier answers one useful question: is this getting
// worse or better here?
//
// Public domain, no key, no attribution required. Fetched server-side and
// bundled like everything else - despite CDC allowing browser requests, a
// client-side call would tell CDC's servers which county each reader cares
// about, which is the leak this whole app is built to avoid. See PRIVACY.md §1.
//
// HANDLE WITH CARE. This is a death count. It is provisional, it lags reality
// by months, and counts of 1-9 are suppressed for confidentiality, so a small
// county showing nothing is a privacy rule, not an absence of deaths. The UI
// must say so. It is context, never a verdict on a place.
//
//   node scripts/build-mortality.mjs

import { readFileSync, writeFileSync } from "node:fs";

const API = "https://data.cdc.gov/resource/gb4e-yj24.json";
const UA = "Nightlight/1.0 (public health harm reduction; +https://nightlight.help)";

const q = async (params) => {
  const url = `${API}?${new URLSearchParams(params)}`;
  const res = await fetch(url, { headers: { "user-agent": UA } });
  if (!res.ok) throw new Error(`CDC ${res.status}: ${url}`);
  return res.json();
};

/* Newest available 12-month window. */
const [{ monthendingdate: latest }] = await q({
  $select: "monthendingdate",
  $order: "monthendingdate DESC",
  $limit: "1",
});

/* Same window one year earlier, for direction of travel.
   Decrement the year in the string rather than round-tripping through Date:
   these timestamps carry no timezone, so `new Date()` reads them as LOCAL and
   `toISOString()` hands back a UTC-shifted key that matches no row. */
const priorKey = `${Number(latest.slice(0, 4)) - 1}${latest.slice(4)}`;

const [now, before] = await Promise.all([
  q({ $where: `monthendingdate='${latest}'`, $limit: "5000" }),
  q({ $where: `monthendingdate='${priorKey}'`, $limit: "5000" }),
]);

const pad = (f) => String(f).padStart(5, "0");
const val = (r) =>
  r.provisional_drug_overdose == null ? null : Number(r.provisional_drug_overdose);

if (!before.length) {
  console.warn(
    `[warn] no rows for the prior window ${priorKey} - year-over-year ` +
    `comparison will be omitted. (A month-end that does not exist a year ` +
    `earlier, e.g. Feb 29, will do this.)`
  );
}

const prevBy = new Map();
for (const r of before) prevBy.set(pad(r.fips), val(r));

const gaz = JSON.parse(readFileSync("data/counties.json", "utf8"));
const known = new Set(gaz.counties.map((c) => c.fips));

/* Population, so a count can become a rate.
 *
 * 65 deaths means something entirely different in a county of 55,000 than in
 * one of 5 million, and the block was showing the bare count - which invites
 * exactly the comparison it cannot support. Per 100,000 is the standard
 * denominator for this and it is what every published overdose figure uses.
 *
 * A FLAT CSV, not the Census API. api.census.gov now answers "Missing Key" on
 * every endpoint including ACS and PEP, and a keyed dependency is the wrong
 * trade for a build anybody should be able to run - the CDC source above needs
 * no key either. This file is the same public-domain estimate the API serves,
 * published as CSV, and it needs nothing.
 *
 * POPESTIMATE2024 is the vintage-2024 estimate; the mortality window ends
 * 2025-12-31, so the rate pairs a 2025 death count with a 2024 denominator.
 * That is how CDC's own provisional rates are computed while the newer
 * estimate is unpublished, and county populations do not move fast enough for
 * the mismatch to matter at this precision. The UI states the vintage. */
const POP_CSV =
  "https://www2.census.gov/programs-surveys/popest/datasets/2020-2024/counties/totals/co-est2024-alldata.csv";

const pop = new Map();
let popVintage = null;
try {
  const res = await fetch(POP_CSV, { headers: { "user-agent": UA } });
  if (!res.ok) throw new Error(`Census ${res.status}`);
  /* latin1: the file is not UTF-8 — Doña Ana County, NM breaks a UTF-8 decode
     and takes the rest of the parse with it. */
  const text = new TextDecoder("latin1").decode(await res.arrayBuffer());
  const [head, ...rows] = text.split(/\r?\n/);
  const cols = head.split(",");
  const iSum = cols.indexOf("SUMLEV");
  const iSt = cols.indexOf("STATE");
  const iCty = cols.indexOf("COUNTY");
  const iPop = cols.indexOf("POPESTIMATE2024");
  if (iSum < 0 || iSt < 0 || iCty < 0 || iPop < 0) throw new Error("columns moved");
  popVintage = 2024;
  for (const line of rows) {
    if (!line) continue;
    const f = line.split(",");
    /* 050 is a county; 040 is the state total row, which shares the state FIPS
       and a COUNTY of 000 and would otherwise overwrite nothing but is not a
       county. */
    if (f[iSum] !== "050") continue;
    const fips = `${f[iSt].padStart(2, "0")}${f[iCty].padStart(3, "0")}`;
    const n = Number(f[iPop]);
    if (Number.isFinite(n) && n > 0) pop.set(fips, n);
  }
} catch (e) {
  /* Not fatal. The count and the trend are the load-bearing numbers; the rate
     is context on top of them, and a build that fails because a Census URL
     moved would take the death figures down with it. */
  console.error(`population: ${e.message} — rates omitted this build`);
  pop.clear();
  popVintage = null;
}

const counties = {};
let reported = 0, suppressed = 0, unmatched = 0, rated = 0;

for (const r of now) {
  const fips = pad(r.fips);
  if (!known.has(fips)) { unmatched++; continue; }

  const n = val(r);
  const p = prevBy.get(fips) ?? null;
  const pp = pop.get(fips) ?? null;

  if (n == null) {
    /* Suppressed, not zero. Recorded explicitly so the UI can say which it is.
       Population still rides along: it is a public fact about the place and is
       useful on the page even when the death count is withheld. */
    counties[fips] = { s: true, ...(pp != null ? { pop: pp } : {}) };
    suppressed++;
    continue;
  }
  reported++;
  if (pp != null) rated++;
  counties[fips] = { n, ...(p != null ? { p } : {}), ...(pp != null ? { pop: pp } : {}) };
}

const payload = {
  generated: new Date().toISOString(),
  asOf: latest.slice(0, 10),
  comparedTo: priorKey.slice(0, 10),
  source: {
    name: "CDC NCHS — provisional county drug overdose deaths",
    url: "https://data.cdc.gov/d/gb4e-yj24",
    license: "US public domain",
  },
  ...(popVintage ? {
    popSource: {
      name: `US Census Bureau — county population estimates, vintage ${popVintage}`,
      url: "https://www.census.gov/programs-surveys/popest.html",
      license: "US public domain",
      vintage: popVintage,
    },
  } : {}),
  caveats: [
    "Provisional counts. They lag by several months and are revised upward as investigations close.",
    "A 12-month rolling total, not a monthly count.",
    "Counts of 1 to 9 are suppressed for confidentiality. Suppressed is not zero.",
    "Deaths are counted where they occurred, which is not always where the person lived.",
    ...(popVintage ? [
      `Rates use Census population estimates for ${popVintage}, a year earlier than the death window.`,
    ] : []),
  ],
  counties,
};

writeFileSync("data/mortality.json", JSON.stringify(payload));

const kb = (Buffer.byteLength(JSON.stringify(payload)) / 1024).toFixed(0);
console.log(
  `window:      12 months ending ${payload.asOf}\n` +
  `compared to: ${payload.comparedTo}\n` +
  `counties with a reported count: ${reported}\n` +
  `counties suppressed (1-9 deaths): ${suppressed}\n` +
  `counties with a population, so a rate: ${rated}\n` +
  `rows not in gazetteer: ${unmatched}\n` +
  `size: ${kb} KB`
);
