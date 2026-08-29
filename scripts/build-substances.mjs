// Build data/substances.json - dose, duration, and interaction data.
//
// This runs at BUILD time and commits a static file. It is never called from
// the browser, and that is a privacy decision, not a performance one: a live
// query to api.psychonautwiki.org would hand a third party a request that
// means "this IP is looking up fentanyl right now". See PRIVACY.md §2.
//
// Sources and why each one:
//   PsychonautWiki  CC BY-SA 4.0  the only source with PARSED NUMERIC doses and
//                                 durations, plus per-substance interactions.
//                                 Whole dataset arrives in a single request.
//   openFDA         CC0/public    the FDA Boxed Warning on combining opioids
//                                 with benzodiazepines. Government-authoritative
//                                 and license-free, which matters on a public
//                                 health site more than it would anywhere else.
//   Erowid          link only     reuse needs written permission and their
//                                 robots.txt requires permission to crawl, so
//                                 this script never fetches erowid.org. Links
//                                 are generated, not scraped.
//
//   node scripts/build-substances.mjs

import { writeFileSync } from "node:fs";
import { stableStamp } from "./stable.mjs";

const PW_API = "https://api.psychonautwiki.org/";
const FDA_API = "https://api.fda.gov/drug/label.json";

const UA = "Nightlight/1.0 (public health harm reduction; +https://nightlight.help)";

/* ------------------------------------------------------------ PsychonautWiki */

// One request, whole dataset. `limit` well above the ~373 substances that exist.
const QUERY = `{
  substances(limit: 1000) {
    name commonNames url
    class { chemical psychoactive }
    addictionPotential
    tolerance { full half zero }
    roas {
      name
      dose { units threshold light { min max } common { min max } strong { min max } heavy }
      duration {
        onset { min max units } comeup { min max units } peak { min max units }
        offset { min max units } total { min max units }
      }
    }
    dangerousInteractions { name }
    unsafeInteractions { name }
    uncertainInteractions { name }
  }
}`;

async function fetchPsychonaut() {
  const res = await fetch(PW_API, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": UA },
    body: JSON.stringify({ query: QUERY }),
  });
  if (!res.ok) throw new Error(`PsychonautWiki ${res.status}`);
  const json = await res.json();
  if (json.errors) throw new Error(`PsychonautWiki: ${JSON.stringify(json.errors).slice(0, 300)}`);
  return json.data.substances.filter(Boolean);
}

/* --------------------------------------------------------------- normalize */

const num = (n) => (typeof n === "number" && Number.isFinite(n) ? Math.round(n * 100) / 100 : null);
const range = (r) => (r && (r.min != null || r.max != null) ? [num(r.min), num(r.max)] : null);

/** Compact a duration leg to [min, max, units], dropping empties. */
function dur(d) {
  if (!d || (d.min == null && d.max == null)) return null;
  return [num(d.min), num(d.max), d.units || null];
}

function normalizeRoa(r) {
  const dose = r.dose && {
    units: r.dose.units || null,
    threshold: num(r.dose.threshold),
    light: range(r.dose.light),
    common: range(r.dose.common),
    strong: range(r.dose.strong),
    heavy: num(r.dose.heavy),
  };
  const hasDose = dose && Object.values(dose).some((v, i) => i > 0 && v != null);

  const d = r.duration || {};
  const duration = {
    onset: dur(d.onset), comeup: dur(d.comeup), peak: dur(d.peak),
    offset: dur(d.offset), total: dur(d.total),
  };
  const hasDur = Object.values(duration).some(Boolean);

  if (!hasDose && !hasDur) return null;
  return {
    name: r.name || "unknown",
    dose: hasDose ? dose : null,
    duration: hasDur ? duration : null,
  };
}

const slug = (s) =>
  String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/* ------------------------------------------------------------------ Erowid
   Links only. Erowid's namespace is not derivable from the substance - fentanyl
   lives under /pharms/ while ketamine is under /chemicals/ - and probing to
   find out would be crawling, which their robots.txt forbids without written
   permission. So: a small hand-verified table, and a search link for the rest.
   Xylazine deliberately has no entry; it has no Erowid vault. */
const EROWID_VAULT = {
  mdma: "chemicals/mdma", lsd: "chemicals/lsd", ketamine: "chemicals/ketamine",
  cocaine: "chemicals/cocaine", heroin: "chemicals/heroin", dxm: "chemicals/dxm",
  ghb: "chemicals/ghb", mescaline: "chemicals/mescaline", psilocin: "plants/mushrooms",
  cannabis: "plants/cannabis", nitrous: "chemicals/nitrous",
  fentanyl: "pharms/fentanyl", alprazolam: "pharms/alprazolam",
  oxycodone: "pharms/oxycodone", methadone: "pharms/methadone",
  diazepam: "pharms/diazepam", tramadol: "pharms/tramadol",
  methamphetamine: "chemicals/meth", amphetamine: "chemicals/amphetamines",
};

function erowidUrl(name) {
  const k = slug(name).replace(/-/g, "");
  const path = EROWID_VAULT[k];
  if (path) {
    const leaf = path.split("/")[1];
    return `https://www.erowid.org/${path}/${leaf}.shtml`;
  }
  // A normal search link. No crawling, and it degrades honestly when Erowid
  // has nothing - which is the case for xylazine, among others.
  return `https://www.erowid.org/search.php?q=${encodeURIComponent(name)}`;
}

/* ----------------------------------------------------------------- openFDA
   CC0. We pull the Boxed Warning - FDA's strongest - for the drug classes
   behind most overdose deaths, and attach it as an authoritative overlay on
   top of the community-sourced interaction lists. */
const FDA_TARGETS = [
  { key: "opioid-benzo", generic: "fentanyl" },
  { key: "benzo", generic: "alprazolam" },
];

async function fetchBoxedWarning(generic) {
  const url =
    `${FDA_API}?search=openfda.generic_name:"${generic}"+AND+_exists_:boxed_warning&limit=1`;
  try {
    const res = await fetch(url, { headers: { "user-agent": UA } });
    if (!res.ok) return null;
    const j = await res.json();
    const text = j.results?.[0]?.boxed_warning?.[0];
    if (!text) return null;
    return String(text).replace(/\s+/g, " ").trim();
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------- main */

const pw = await fetchPsychonaut();
console.log(`PsychonautWiki: ${pw.length} substances`);

const substances = pw
  .map((s) => {
    const roas = (s.roas || []).map(normalizeRoa).filter(Boolean);
    const inter = {
      dangerous: (s.dangerousInteractions || []).map((i) => i.name).filter(Boolean),
      unsafe: (s.unsafeInteractions || []).map((i) => i.name).filter(Boolean),
      uncertain: (s.uncertainInteractions || []).map((i) => i.name).filter(Boolean),
    };
    const hasAnything =
      roas.length || inter.dangerous.length || inter.unsafe.length || s.addictionPotential;
    if (!hasAnything) return null;

    return {
      id: slug(s.name),
      name: s.name,
      aliases: [...new Set((s.commonNames || []).filter((n) => n && n !== s.name))].slice(0, 12),
      class: {
        chemical: s.class?.chemical || [],
        psychoactive: s.class?.psychoactive || [],
      },
      roas,
      interactions: inter,
      addiction: s.addictionPotential || null,
      tolerance: s.tolerance
        ? { full: s.tolerance.full || null, half: s.tolerance.half || null, zero: s.tolerance.zero || null }
        : null,
      links: { psychonautwiki: s.url || null, erowid: erowidUrl(s.name) },
    };
  })
  .filter(Boolean)
  .sort((a, b) => a.name.localeCompare(b.name));

const warnings = {};
for (const t of FDA_TARGETS) {
  const text = await fetchBoxedWarning(t.generic);
  if (text) warnings[t.key] = { source: "openFDA", generic: t.generic, text };
  console.log(`openFDA boxed warning [${t.key}]: ${text ? `${text.length} chars` : "not found"}`);
}

const payload = {
  generated: new Date().toISOString(),
  attribution: [
    {
      source: "PsychonautWiki",
      url: "https://psychonautwiki.org/",
      license: "CC BY-SA 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
      note:
        "Dose, duration, tolerance and interaction data. This file is a derived " +
        "database and is offered under the same CC BY-SA 4.0 license.",
    },
    {
      source: "openFDA",
      url: "https://open.fda.gov/",
      license: "CC0 1.0 (US public domain)",
      licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
      note: "FDA Boxed Warning text.",
    },
    {
      source: "Erowid",
      url: "https://www.erowid.org/",
      license: "All rights reserved — linked, not reproduced",
      note: "No Erowid content is stored or copied. Outbound links only.",
    },
  ],
  warnings,
  substances,
};

writeFileSync("data/substances.json",
  JSON.stringify(stableStamp("data/substances.json", payload)));

const withDose = substances.filter((s) => s.roas.some((r) => r.dose)).length;
const withDanger = substances.filter((s) => s.interactions.dangerous.length).length;
const kb = (Buffer.byteLength(JSON.stringify(payload)) / 1024).toFixed(0);
console.log(
  `\nsubstances: ${substances.length}\n` +
  `  with dose data:            ${withDose}\n` +
  `  with dangerous interactions: ${withDanger}\n` +
  `  size: ${kb} KB`
);
