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
const UA = "Nightlight/1.0 (public health harm reduction)";

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

const counties = {};
let reported = 0, suppressed = 0, unmatched = 0;

for (const r of now) {
  const fips = pad(r.fips);
  if (!known.has(fips)) { unmatched++; continue; }

  const n = val(r);
  const p = prevBy.get(fips) ?? null;

  if (n == null) {
    // Suppressed, not zero. Recorded explicitly so the UI can say which it is.
    counties[fips] = { s: true };
    suppressed++;
    continue;
  }
  reported++;
  counties[fips] = { n, ...(p != null ? { p } : {}) };
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
  caveats: [
    "Provisional counts. They lag by several months and are revised upward as investigations close.",
    "A 12-month rolling total, not a monthly count.",
    "Counts of 1 to 9 are suppressed for confidentiality. Suppressed is not zero.",
    "Deaths are counted where they occurred, which is not always where the person lived.",
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
  `rows not in gazetteer: ${unmatched}\n` +
  `size: ${kb} KB`
);
