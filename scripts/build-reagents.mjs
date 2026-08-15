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

/* Upstream keys -> the key this file ships. ASCII identifiers, not labels:
   flowcharts.json references these, the picker builds its list from them, and
   the OVERRIDES below patch rows by them. site/js/reagentnames.js turns them
   into what a reader sees, which is where Morris and Simon's live.

   Two of these were WRONG and neither had ever fired: the API sends `simons`
   and `foli`, and the map was keyed on `simon` and `folin`. So both fell to a
   fallback that just capitalised the raw key, and "Simons" and "Foli" shipped.
   `morr`, `roba` and `cann` were never mapped at all. Verified against the
   live API, which sends exactly: cann ehrl foli froe gall hofm lieb mand marq
   meck morr roba scott simons zimm. */
const REAGENT_KEYS = {
  marq: "Marquis", meck: "Mecke", mand: "Mandelin", lieb: "Liebermann",
  froe: "Froehde", ehrl: "Ehrlich", simons: "Simons", scott: "Scott",
  hofm: "Hofmann", gall: "Gallic", foli: "Foli", zimm: "Zimmermann",
  morr: "Morr", roba: "Roba",
  /* `cann` is deliberately absent. It appears on exactly one substance (PCP,
     as a no-reaction), and there is no confident name for it — shipping a row
     labelled "Cann" gives a reader an abbreviation they cannot act on, and
     guessing at "Cannabis reagent" is the kind of invention this file's
     sourcing rules forbid. Dropped, and counted below so a future reagent
     appearing upstream gets noticed rather than silently shipped. */
};

function reagentKey(raw) {
  return REAGENT_KEYS[String(raw || "").replace(/_desc$/, "")] || null;
}

/* PsychonautWiki reports some pairs TWICE with different results, and the two
 * readings are not always the same observation seen to different depths.
 *
 * 6 of the 21 duplicates are prefixes — ["pink"] and ["pink","blue"], one
 * observer stopping earlier than the other — and the longer one simply wins.
 * The other 15 genuinely disagree: 25C-NBOMe on Mandelin is yellow-red-brown
 * in one and yellow-green-brown in the other; pethidine on Mecke is NO
 * REACTION in one and yellow-orange in the other.
 *
 * Those are carried as ALTERNATIVES rather than merged. Concatenating them
 * would invent a sequence neither source reported, and dropping either would
 * eliminate a substance on a reading somebody did publish. `colors` stays the
 * union so the matcher — which only asks "does this color appear" — keeps
 * agreeing with both, and `alts` holds the readings intact for display. */
function mergeDuplicates(rows) {
  const by = new Map();
  const sig = (r) => (r.colors || []).join("|") + (r.none ? "|none" : "");
  for (const r of rows) {
    const cur = by.get(r.reagent);
    if (!cur) { by.set(r.reagent, { ...r }); continue; }

    const a = sig(cur), b = sig(r);
    if (a === b) continue;                                   // exact repeat
    if (b.startsWith(a)) { by.set(r.reagent, { ...r }); continue; }   // r is deeper
    if (a.startsWith(b)) continue;                            // cur is deeper

    const alts = cur.alts ? [...cur.alts] : [strip(cur)];
    alts.push(strip(r));
    const merged = { reagent: r.reagent, alts };
    const colors = [...new Set(alts.flatMap((x) => x.colors || []))];
    if (colors.length) merged.colors = colors;
    if (alts.some((x) => x.none)) merged.none = true;
    by.set(r.reagent, merged);
  }
  return [...by.values()];
}

function strip(r) {
  const o = {};
  if (r.colors?.length) o.colors = r.colors;
  if (r.to) o.to = r.to;
  if (r.none) o.none = true;
  return o;
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

const unnamed = new Map();
let mergedPairs = 0;

for (const s of json.data.substances) {
  const rows = [];
  for (const r of s.reagents?.results || []) {
    const start = cleanColors(r.startColors);
    const end = cleanColors(r.endColors);
    const name = reagentKey(r.reagent?.name);
    if (!name) {
      const raw = String(r.reagent?.name || "?").replace(/_desc$/, "");
      unnamed.set(raw, (unnamed.get(raw) || 0) + 1);
      continue;
    }

    if (!start.length && !end.length) {
      // Explicit no-reaction is worth showing; missing data is not.
      if (r.isPositive === false) rows.push({ reagent: name, none: true });
      continue;
    }
    // End state only when it differs - "yellow -> yellow" is noise.
    const to = end.length && end.join("|") !== start.join("|") ? end : null;
    rows.push({ reagent: name, colors: start.length ? start : end, ...(to ? { to } : {}) });
  }
  const deduped = mergeDuplicates(rows);
  mergedPairs += rows.length - deduped.length;
  if (deduped.length) { bySlug[slug(s.name)] = deduped; covered++; }
}

if (unnamed.size) {
  console.warn("dropped reagents with no confident name: "
    + [...unnamed].map(([k, n]) => `${k} (${n} row${n === 1 ? "" : "s"})`).join(", "));
}
console.log(`merged ${mergedPairs} duplicate reagent row(s)`);

/* EVERY REAGENT THE FLOWCHARTS NAME MUST EXIST HERE, or the failure is silent
 * and it is the safe-looking kind nobody investigates.
 *
 * The two halves are joined by a bare string. If upstream renames a key — or
 * if the map above is edited to a name the charts do not use — every step on
 * that reagent stops resolving, `compare` returns `unknown` for all 207
 * substances, and unknown never eliminates anything. So the app gets quieter
 * and more permissive rather than visibly broken. This map already shipped two
 * dead entries for a year (`simon`, `folin`) for exactly that reason.
 *
 * Fails the build rather than warning: a chart step nothing can match is not a
 * degraded feature, it is a test the app claims to run and does not. */
{
  const { readFileSync } = await import("node:fs");
  const charts = JSON.parse(readFileSync("data/flowcharts.json", "utf8"));
  const shipped = new Set(Object.values(bySlug).flat().map((r) => r.reagent));
  const wanted = new Set();
  for (const f of charts.flows || []) for (const s of f.steps || []) wanted.add(s.reagent);
  for (const b of charts.unknown?.branches || []) {
    for (const t of b.then || []) wanted.add(t.reagent);
  }
  if (charts.unknown?.first) wanted.add(charts.unknown.first);
  const missing = [...wanted].filter((r) => !shipped.has(r));
  if (missing.length) {
    throw new Error(`data/flowcharts.json names reagents this build does not `
      + `produce: ${missing.join(", ")}. Every chart step on them would silently `
      + `match nothing. Fix REAGENT_KEYS or the chart.`);
  }
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

/* ------------------------------------------------------- overrides --------
 *
 * Corrections applied ON TOP of PsychonautWiki, each with the source that
 * disagrees and the reason. Nothing here is a hand-edit of data/reagents.json —
 * that file stays generated, and every divergence from upstream is visible in
 * this map and in the diff.
 *
 * WHY THESE TWO. Both are FAINT reactions, and a faint reaction is exactly what
 * one chart records as a colour and another records as nothing. PsychonautWiki
 * marks both as no reaction; DanceSafe's reagent flowcharts record a colour;
 * and per the maintainer, who distributes these kits, DanceSafe's charts list
 * BOTH outcomes for MDA on Simon's and for cocaine on Marquis.
 *
 * So neither source is being overruled. The row carries `none: true` AND the
 * colours, which reagentmatch.js reads as "either reading matches" — meaning
 * neither observation can eliminate the substance. That is the honest shape for
 * a reaction that genuinely presents both ways, and it is strictly safer than
 * either source alone: PsychonautWiki's version alone eliminates cocaine for
 * anybody reporting a pink Marquis, and DanceSafe's alone eliminates it for
 * anybody reporting nothing.
 *
 * The date check that matters, because "upstream is just stale" was the first
 * theory and it is not supported: DanceSafe's revision is 2023, and
 * PsychonautWiki's cocaine article was edited in November 2025 and its MDA
 * article in December 2024 — both AFTER — and still record no reaction. This is
 * a genuine difference of observation, not a missed update.
 */
/* ONE ENTRY PER SUBSTANCE. A second `cocaine:` key here does not merge, it
   REPLACES — and it did, silently: adding the Morris correction below as its
   own block deleted the Marquis one above it, and the build went on reporting
   that it had applied its overrides. The reagentmatch tests caught it because
   they assert the chemistry rather than the count. Add reagents to the
   substance that is already here; do not add a second block for it. */
const OVERRIDES = {
  cocaine: {
    Marquis: {
      none: true, colors: ["peach", "pink"],
      /* NO "orange" HERE, and it was mine. DanceSafe records peach or light
         pink; the ten-word table has no word for peach, so peach was rounded
         to its two nearest words and shipped as ["pink","orange"]. But
         reagentmatch.js ALREADY does that rounding on the reader's side —
         TABLE_ALIAS maps peach to [orange, pink] — so the rounding was applied
         twice, and the second one put a bright-orange Marquis into cocaine's
         row. Nobody ever observed an orange cocaine Marquis: it is the word
         peach, spelled wrong, twice.

         And bright orange is not an omission on the chart, it is an EXCLUSION.
         Chart 3 routes peach and light pink to Morris and cocaine, and bright
         orange to Liebermann and the amphetamine side. Keeping orange here let
         a bright-orange Marquis match cocaine at 4 of 4 and outrank
         amphetamine, which is the reported bug.

         Zero loss on the readings that matter: peach still agrees through the
         alias, pink agrees, no-reaction agrees. Only a flat "orange" stops
         agreeing, and the picker offers peach as its own choice so nobody
         holding cocaine has to round a faint blush to orange. */
      why: "PsychonautWiki records no reaction; DanceSafe's 2023 chart records a "
         + "light pink or peach. Both are kept: the reaction is faint and is "
         + "reported both ways. Bright orange is deliberately NOT here — the "
         + "chart routes it to the amphetamine branch, and reagentmatch.js "
         + "already widens a reported peach to cover it.",
      source: "DanceSafe reagent flowcharts, 2023 revision",
    },
    /* Found by a test rather than by reading: data/flowcharts.json carries
       DanceSafe's sequences, and a check that the two sources cannot flatly
       contradict each other on a shared pair flagged this one. The table
       would have eliminated cocaine on precisely the reading the flowchart
       opens its cocaine test by telling the reader to expect. */
    Morr: {
      colors: ["blue", "pink", "green"],
      why: "PsychonautWiki records pink/green; DanceSafe's 2023 chart opens its "
         + "cocaine test with Morris and records BRIGHT BLUE, on two separate "
         + "charts. Both are kept — a reader following the flowchart must not "
         + "have cocaine eliminated by the color the flowchart told them to "
         + "expect.",
      source: "DanceSafe reagent flowcharts, 2023 revision",
    },
  },
  mda: {
    Simons: {
      none: true, colors: ["gray", "green"],
      why: "PsychonautWiki records no reaction; DanceSafe's 2023 chart records a "
         + "dark gray/green. Their flowchart lists both, which is what makes "
         + "Simon's a weaker MDA/MDMA discriminator than it is usually given "
         + "credit for.",
      source: "DanceSafe reagent flowcharts, 2023 revision",
    },
  },
  heroin: {
    /* MAGENTA, spelled. The chart's word for heroin's Marquis is magenta, and
       the upstream ten-word vocabulary has no way to say it — it arrives as
       brown/purple. With match-time aliasing gone, a reader who picks magenta
       matches whatever the data actually says, so the data has to say it. The
       upstream readings are kept alongside rather than replaced. */
    Marquis: {
      colors: ["magenta", "brown", "purple"],
      why: "PsychonautWiki records brown/purple; DanceSafe's 2023 chart records "
         + "magenta. Both are kept — magenta is a reading the ten-word table "
         + "cannot express, and a reader who sees it must not be told it "
         + "contradicts heroin.",
      source: "DanceSafe reagent flowcharts, 2023 revision",
    },
    /* Same origin as cocaine's Morris row above — the two-source check. */
    Froehde: {
      colors: ["red", "brown", "purple", "black"],
      why: "PsychonautWiki records purple/black; DanceSafe's 2023 chart records "
         + "reddish-brown at the same step of the heroin flow. Both are kept.",
      source: "DanceSafe reagent flowcharts, 2023 revision",
    },
  },
  "2c-b": {
    /* OLIVE, for the same reason as heroin's magenta. */
    Marquis: {
      colors: ["olive", "yellow", "green"],
      why: "PsychonautWiki records yellow/green; DanceSafe's 2023 chart records "
         + "dark lime green. Both are kept — olive is the picker's word for "
         + "that shade and the ten-word table has no way to record it.",
      source: "DanceSafe reagent flowcharts, 2023 revision",
    },
  },
};

let applied = 0;
for (const [id, byReagent] of Object.entries(OVERRIDES)) {
  const rows = bySlug[id];
  if (!rows) { console.warn(`override for unknown substance: ${id}`); continue; }
  for (const [reagent, patch] of Object.entries(byReagent)) {
    const i = rows.findIndex((r) => r.reagent === reagent);
    const row = { reagent, none: patch.none, colors: patch.colors,
                  override: { why: patch.why, source: patch.source } };
    if (i >= 0) rows[i] = row; else rows.push(row);
    applied++;
  }
}
console.log(`applied ${applied} sourced override(s) over PsychonautWiki`);

await writeFile(OUT, JSON.stringify({
  note: "Generated by scripts/build-reagents.mjs from PsychonautWiki (CC BY-SA 4.0), "
      + "with sourced overrides listed in that file. Do not hand-edit.",
  generated: new Date().toISOString(),
  /* Rendered in place of a color table for these - see PLANT_OR_FUNGAL above. */
  plantOrFungal: [...PLANT_OR_FUNGAL],
  reagents: bySlug,
/* Minified, matching what is committed. Pretty-printing this file makes a
   two-substance correction land as a nine-thousand-line diff, which hides the
   change it is supposed to show — and it ships to every reader, so the bytes
   are not free either. */
}));

console.log(`reagent reactions for ${covered} substances -> ${path.relative(ROOT, OUT)}`);
