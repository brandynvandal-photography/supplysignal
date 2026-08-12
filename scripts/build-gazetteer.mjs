// Reconcile data/counties.json against the boundary file.
//
// The shipped gazetteer predates the shapes file, which matters more than it
// sounds. Three FIPS codes in it were abolished years ago, and the two that
// replaced them are missing entirely - so Kusilvak Census Area, AK and Oglala
// Lakota County, SD (both Native-majority, both carrying serious overdose
// burden) could not be searched or geotagged at all. Separately, every US
// territory has boundary data present but no gazetteer entry, so Puerto Rico's
// 78 municipios were unreachable while "Near me" would happily resolve a San
// Juan coordinate to a FIPS code that 404s.
//
// Names come from us-atlas, which is the same source the boundary file was
// built from, so the two stay in lockstep. Existing entries are preserved
// as-is - Alaska's suffixes (Borough / Census Area / Municipality / City and
// Borough) are irregular and already correct here, and are not worth
// re-deriving.
//
//   npm pack us-atlas && tar xzf us-atlas-*.tgz
//   node scripts/build-gazetteer.mjs path/to/package/counties-10m.json

import { readFileSync, writeFileSync } from "node:fs";

const SRC = process.argv[2];
if (!SRC) {
  console.error("usage: node scripts/build-gazetteer.mjs <counties-10m.json>");
  process.exit(1);
}

const topo = JSON.parse(readFileSync(SRC, "utf8"));
const gaz = JSON.parse(readFileSync("data/counties.json", "utf8"));

/* state FIPS prefix -> postal abbr, taken from the topology's own state layer */
const TERRITORY_ABBR = {
  72: "PR", 78: "VI", 66: "GU", 60: "AS", 69: "MP",
};
const NAME_TO_ABBR = Object.fromEntries(
  Object.entries(gaz.states).map(([abbr, name]) => [name, abbr])
);
const TERRITORY_NAME = {
  PR: "Puerto Rico",
  VI: "U.S. Virgin Islands",
  GU: "Guam",
  AS: "American Samoa",
  MP: "Northern Mariana Islands",
};

const prefixToAbbr = {};
for (const s of topo.objects.states.geometries) {
  const id = String(s.id).padStart(2, "0");
  const nm = s.properties?.name;
  prefixToAbbr[id] = TERRITORY_ABBR[Number(id)] || NAME_TO_ABBR[nm] || null;
}

/** County-equivalent suffix. Only applied to entries we are ADDING. */
function withSuffix(bare, state, fips) {
  const explicit = {
    "02158": "Kusilvak Census Area",
    "46102": "Oglala Lakota County",
  };
  if (explicit[fips]) return explicit[fips];

  switch (state) {
    case "LA": return `${bare} Parish`;
    case "PR": return `${bare} Municipio`;
    case "AS": return `${bare} District`;
    case "MP": return `${bare} Municipality`;
    case "VI": return `${bare} Island`;
    case "GU": return bare;               // 66010 is simply "Guam"
    case "DC": return bare;
    default:   return `${bare} County`;
  }
}

const existing = new Map(gaz.counties.map((c) => [c.fips, c]));
const shapeIds = new Set(
  topo.objects.counties.geometries.map((g) => String(g.id).padStart(5, "0"))
);

const added = [], removed = [], renamed = [];
const out = [];

for (const g of topo.objects.counties.geometries) {
  const fips = String(g.id).padStart(5, "0");
  const state = prefixToAbbr[fips.slice(0, 2)];
  if (!state) continue;

  const bare = g.properties?.name;
  const prev = existing.get(fips);

  if (prev) {
    // Keep the curated name, but repair encoding damage. The authoritative
    // bare name is compared against the existing one with its suffix removed;
    // if they differ only by mangled bytes, rebuild from the good name.
    const suffix = prev.name.slice(bare.length);
    const looksMangled = /[^\x20-\x7E]/.test(prev.name) && bare && !prev.name.includes(bare);
    if (looksMangled) {
      const tail = prev.name.match(
        /\s+(County|Parish|Borough|Census Area|Municipality|City and Borough|city|Municipio|Island|District)$/
      );
      const fixed = bare + (tail ? tail[0] : "");
      renamed.push([fips, prev.name, fixed]);
      out.push({ fips, name: displayName(fixed), state: prev.state });
    } else {
      out.push({ fips, name: displayName(prev.name), state: prev.state });
      void suffix;
    }
  } else {
    const name = withSuffix(bare, state, fips);
    added.push([fips, name, state]);
    out.push({ fips, name: displayName(name), state });
  }
}

for (const c of gaz.counties) {
  if (!shapeIds.has(c.fips)) removed.push([c.fips, c.name, c.state]);
}

out.sort((a, b) => a.fips.localeCompare(b.fips));

const states = { ...gaz.states };
for (const [abbr, name] of Object.entries(TERRITORY_NAME)) states[abbr] = name;

writeFileSync("data/counties.json", JSON.stringify({ states, counties: out }));

/* ---- report ---- */
const byState = {};
for (const [f, n, s] of added) (byState[s] = byState[s] || []).push(`${f} ${n}`);

console.log(`counties: ${gaz.counties.length} -> ${out.length}`);
console.log(`states/territories: ${Object.keys(gaz.states).length} -> ${Object.keys(states).length}\n`);

console.log(`REMOVED (abolished, absent from boundary data) — ${removed.length}`);
for (const [f, n, s] of removed) console.log(`   ${f}  ${n}, ${s}`);

console.log(`\nRENAMED (encoding repair) — ${renamed.length}`);
for (const [f, a, b] of renamed) console.log(`   ${f}  ${JSON.stringify(a)} -> ${JSON.stringify(b)}`);

console.log(`\nADDED — ${added.length}`);
for (const [s, list] of Object.entries(byState)) {
  console.log(`   ${s} (${list.length}): ${list.slice(0, 3).map((x) => x.split(" ").slice(1).join(" ")).join(", ")}${list.length > 3 ? ", …" : ""}`);
}
