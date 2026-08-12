/* Per-substance reagent reactions, from PsychonautWiki's API at build time.
 *
 *   node scripts/build-reagents.mjs
 *
 * A separate bundle rather than part of build-substances so this can be
 * regenerated without refetching and rewriting the entire substance index.
 * Merged onto substances at load time in site/js/data.js, same as
 * descriptions.json.
 *
 * The upstream shape is awkward and this file is where it gets tamed:
 *   - reagent names arrive as internal keys ("marq_desc") - mapped to the
 *     names printed on actual reagent bottles;
 *   - colors arrive coded ("green3", "black2") with duplicates - stripped to
 *     plain words and deduped, order preserved (order IS the reaction:
 *     yellow -> green is information);
 *   - empty color lists mean "no data", not "no reaction", and are dropped.
 *     PW encodes a true no-reaction as isPositive: false.
 *
 * Same licence as the substance data: CC BY-SA 4.0, attributed in-app. */

import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "data", "reagents.json");
const API = "https://api.psychonautwiki.org/";

/* Must match build-substances.mjs exactly, or the merge silently misses. */
const slug = (s) =>
  String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const REAGENT_NAMES = {
  marq: "Marquis", meck: "Mecke", mand: "Mandelin", lieb: "Liebermann",
  froe: "Froehde", ehrl: "Ehrlich", simon: "Simon's", scott: "Scott",
  hofm: "Hofmann", gall: "Gallic", folin: "Folin", zimm: "Zimmermann",
};

function reagentName(raw) {
  const key = String(raw || "").replace(/_desc$/, "");
  if (REAGENT_NAMES[key]) return REAGENT_NAMES[key];
  // Unknown key: readable fallback, never a blank
  return key.charAt(0).toUpperCase() + key.slice(1);
}

/** "green3" -> "green"; dedupe consecutive repeats, keep order. */
function cleanColors(list) {
  const out = [];
  for (const c of list || []) {
    let name = String(c?.name || "").replace(/\d+$/, "").trim();
    if (name === "grey") name = "gray";   // US spelling app-wide; PW is inconsistent
    if (name && out[out.length - 1] !== name) out.push(name);
  }
  return out;
}

const QUERY = `{
  substances(limit: 1000) {
    name
    reagents {
      results {
        reagent { name }
        startColors { name }
        endColors { name }
        isPositive
      }
    }
  }
}`;

const res = await fetch(API, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ query: QUERY }),
});
if (!res.ok) throw new Error(`PsychonautWiki ${res.status}`);
const json = await res.json();
if (json.errors) throw new Error(JSON.stringify(json.errors).slice(0, 300));

const bySlug = {};
let covered = 0;

for (const s of json.data.substances) {
  const rows = [];
  for (const r of s.reagents?.results || []) {
    const start = cleanColors(r.startColors);
    const end = cleanColors(r.endColors);
    const name = reagentName(r.reagent?.name);

    if (!start.length && !end.length) {
      // Explicit no-reaction is worth showing; missing data is not.
      if (r.isPositive === false) rows.push({ reagent: name, none: true });
      continue;
    }
    // End state only when it differs - "yellow -> yellow" is noise.
    const to = end.length && end.join("|") !== start.join("|") ? end : null;
    rows.push({ reagent: name, colors: start.length ? start : end, ...(to ? { to } : {}) });
  }
  if (rows.length) { bySlug[slug(s.name)] = rows; covered++; }
}

/* Plant and fungal MATERIAL is dropped, and the reason is upstream: PW records
 * reagent colors per COMPOUND, with no idea what matrix the compound is in.
 * Applied to a mushroom or a bud, those colors describe an isolated molecule
 * nobody is holding, and the app renders them under the heading "expected
 * reagent reactions" - which promises a result the chemistry cannot give.
 *
 * What the sources actually say, all read directly:
 *   - DanceSafe: "Organic material (like plant matter and fungi) is difficult,
 *     if not impossible, to test with at-home tools", and on cannabis "Testing
 *     weed with reagents will not give meaningful results in almost all cases."
 *   - Bunk Police: "plant material cannot be tested with the spot kits."
 *   - Ehrlich is indole-generic, so ordinary button mushrooms go purple from
 *     free tryptophan - and so does DEATH CAP, which contains an indole too.
 *     Drug checkers in New Zealand also got NO reaction from confirmed
 *     psilocybin species, and a reaction on the cap but not the stem of the
 *     same mushroom.
 *   - The "Cann" (4-aminophenol) test distinguishes THC-rich from CBD-rich
 *     cannabis. Its blue result - the one this file was publishing - is a
 *     documented false positive for thyme and oregano.
 *
 * One entry made the point on its own: psilocybe-cubensis published "Mecke ->
 * brown, Simons -> brown", and brown is what these reagents do to organic
 * matter generally. That is a non-reaction printed as a result.
 *
 * Suppressed HERE rather than in the view so regenerating cannot quietly put
 * them back. Isolated alkaloids keep their tables - ibogaine is a compound,
 * iboga root bark would not be. */
const PLANT_OR_FUNGAL = new Set([
  "cannabis", "tetrahydrocannabinol", "psilocybin-mushrooms", "psilocybe-cubensis",
]);
const dropped = [];
for (const id of Object.keys(bySlug)) {
  if (PLANT_OR_FUNGAL.has(id)) { delete bySlug[id]; dropped.push(id); covered--; }
}
if (dropped.length) console.log(`suppressed plant/fungal matrices: ${dropped.join(", ")}`);

await writeFile(OUT, JSON.stringify({
  note: "Generated by scripts/build-reagents.mjs from PsychonautWiki (CC BY-SA 4.0). Do not hand-edit.",
  generated: new Date().toISOString(),
  /* Rendered in place of a color table for these - see PLANT_OR_FUNGAL above. */
  plantOrFungal: [...PLANT_OR_FUNGAL],
  reagents: bySlug,
}, null, 1));

console.log(`reagent reactions for ${covered} substances -> ${path.relative(ROOT, OUT)}`);
