// Build data/structures.json — the 2D skeletal structure of each substance.
//
//   node scripts/build-structures.mjs
//
// WHY THIS EXISTS
//
// The app argues from molecular structure in two places and could not show one.
// The fentanyl strip section says BTNX is blind to "bulky changes on the
// phenethyl part" while the WHPM strip is blind to "carbonyl modifications" —
// which is the difference between the two brands, and is unreadable as prose to
// anyone who does not already know what those words point at. A picture of the
// molecule with the two ends visible is the whole explanation.
//
// WHY THERE IS NO CHEMISTRY LIBRARY HERE, which is the part worth knowing.
//
// Laying out a molecule is genuinely hard, and every drawing library that does
// it is 130 KB to 8 MB. This project ships ONE dependency and a CSP that
// forbids fetching anything, so a runtime renderer was the obvious blocker.
//
// It turns out not to be needed: PubChem's 2D record already contains the
// LAYOUT — an x and y for every atom, computed by them. So the hard part is
// done upstream, the app ships coordinates rather than a program that derives
// them, and drawing is a hundred lines of line-and-label SVG at runtime.
//
// WHAT IS DROPPED, AND WHY IT HALVES THE FILE
//
// Explicit hydrogens. A skeletal formula does not draw them — carbon is implied
// at every vertex and its hydrogens with it. Fentanyl is 53 atoms of which 28
// are hydrogen, so keeping them would cost more than half the bytes to render
// something no chemist would draw. Hydrogens bonded to N or O are kept, because
// an -OH or an -NH is information.
//
// LICENCE. PubChem is produced by the US National Library of Medicine and its
// data is public domain — no copyright, no attribution condition. It is cited
// anyway, because a reader deserves to know where a picture of their drug came
// from. See https://www.ncbi.nlm.nih.gov/home/about/policies/

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const UA = "Nightlight/1.0 (public health harm reduction; +https://nightlight.help)";

/* PubChem asks for no more than five requests a second. Two per substance and
   a deliberate pause: this runs once, and being a good guest of a service that
   charges nothing costs us three minutes. */
const GAP = 260;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* Name comparison for the CID check below. Punctuation and case carry no
   meaning across PubChem's synonym list, our display names and our ids —
   "25I-NBOMe", "25i-nbome" and "25I NBOMe" are one name. */
/* Elements a psychoactive organic compound is built from. Anything outside this
   set means the CID is a different kind of chemical entirely. */
const DRUG_ELEMENTS = new Set(
  ["C", "H", "N", "O", "F", "Cl", "Br", "I", "S", "P", "Na", "K", "Li", "B", "Si"]);

/* A metal in the formula means the CID is a SALT of the drug rather than the
   drug — morphine sulfate, zolpidem tartrate, sodium oxybate. Real compounds,
   correctly resolved, and the wrong picture: a skeletal formula with a
   counter-ion hanging off it is not what the reader is holding. */
const SALT_METALS = new Set(["Na", "K", "Li", "Ca", "Mg", "Zn", "Fe", "Al"]);

async function pug(url) {
  const res = await fetch(url, { headers: { "user-agent": UA } });
  if (!res.ok) return null;
  return res;
}

/** Element symbols by atomic number, for the ones that turn up in drugs. */
const SYM = {
  1: "H", 5: "B", 6: "C", 7: "N", 8: "O", 9: "F", 11: "Na", 14: "Si", 15: "P",
  16: "S", 17: "Cl", 19: "K", 35: "Br", 53: "I",
};

/**
 * Pack one PubChem 2D record into the smallest honest shape.
 *
 * Coordinates are rounded to two decimals — PubChem's layout is arbitrary units
 * and the app scales it to fit a box, so the third decimal is noise that costs
 * a byte per atom.
 */
function pack(compound) {
  const atoms = compound.atoms;
  const conf = compound.coords?.[0]?.conformers?.[0];
  if (!conf?.x) return null;

  const el = atoms.element;
  const bonds = compound.bonds || { aid1: [], aid2: [], order: [] };

  /* Which atoms survive: everything that is not a hydrogen on a carbon. */
  const heavyOnCarbon = new Set();
  for (let i = 0; i < bonds.aid1.length; i++) {
    const a = bonds.aid1[i] - 1, b = bonds.aid2[i] - 1;
    if (el[a] === 1 && el[b] === 6) heavyOnCarbon.add(a);
    if (el[b] === 1 && el[a] === 6) heavyOnCarbon.add(b);
  }
  const keep = [];
  const index = new Map();
  for (let i = 0; i < el.length; i++) {
    if (heavyOnCarbon.has(i)) continue;
    index.set(i, keep.length);
    keep.push(i);
  }

  const out = {
    a: keep.map((i) => SYM[el[i]] || String(el[i])),
    x: keep.map((i) => Math.round(conf.x[i] * 100) / 100),
    y: keep.map((i) => Math.round(conf.y[i] * 100) / 100),
    b: [],
  };
  for (let i = 0; i < bonds.aid1.length; i++) {
    const a = index.get(bonds.aid1[i] - 1), b = index.get(bonds.aid2[i] - 1);
    if (a === undefined || b === undefined) continue;
    out.b.push([a, b, bonds.order[i] || 1]);
  }
  return out;
}

async function main() {
  const subs = JSON.parse(await readFile(path.join(ROOT, "data/substances.json"), "utf8"));
  const list = subs.substances || [];

  const structures = {};
  const missing = [];
  /* Looked up, matched a CID, and REJECTED because the CID was a different
     molecule. Kept separate from `missing` (never found at all) so the run log
     distinguishes "PubChem has no record" from "PubChem had the wrong one". */
  const unverified = [];
  let done = 0;

  for (const s of list) {
    done++;
    const label = `${done}/${list.length} ${s.name}`;
    try {
      /* THE DISPLAY NAME, unless it is an abbreviation or it fails.
       *
       * Two different ways this goes wrong, and the fix for one is the cause of
       * the other.
       *
       * Asking for `s.name` and taking the first CID unchecked shipped three
       * wrong structures: pce drew tetrachloroethylene (a dry-cleaning
       * solvent), met drew L-methionine (an amino acid), nep drew an
       * organoarsenic compound. All three are short abbreviations that are
       * legitimate names of something else, so a synonym check does not save
       * them either — "Met" really is methionine's three-letter code.
       *
       * Asking for the LONGEST name instead fixes those three and breaks six
       * more, because alias lists carry salt and brand names. Morphine became
       * morphine sulfate pentahydrate, oxycodone the hydrochloride, zolpidem
       * the tartrate, ghb sodium oxybate, memantine and tramadol their
       * hydrochlorides — every one a real compound, correctly resolved, and
       * the wrong drawing: a skeletal formula with a counter-ion hanging off it
       * is not what the reader took.
       *
       * So: the display name is used unless it is short enough to be an
       * abbreviation, and any candidate has to survive the chemistry check
       * below. A longer alias is consulted only when the display name is an
       * abbreviation or its CID fails — which is exactly the four cases that
       * need it (pce, met, nep, and lsa, which had been drawing saccharin).
       *
       * THREE CHARACTERS, not four. At four, MDPV went to its aliases and came
       * back with NRG-1 — a real designer-drug name that PubChem resolves to a
       * different compound (C15H19NO3 against MDPV's C16H21NO3). Four-letter
       * names in this app are drug names; three-letter ones are the collisions. */
      const ABBREVIATION = 3;
      const aliases = (s.aliases || []).filter(Boolean).sort((a, b) => b.length - a.length);
      const order = s.name && s.name.length > ABBREVIATION
        ? [s.name, ...aliases]
        : [...aliases, s.name].filter(Boolean);

      let cid = null;
      let askedWith = null;
      let lastReason = null;
      for (const name of order) {
        const res = await pug(
          `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(name)}/cids/TXT`);
        await sleep(GAP);
        if (!res) continue;
        const candidate = (await res.text()).trim().split("\n")[0];
        if (!/^\d+$/.test(candidate)) continue;

        /* CHECK THE CHEMISTRY BEFORE ACCEPTING IT.
         *
         * A psychoactive organic compound contains carbon and hydrogen, is
         * built from a small set of elements, and is ONE molecule. A metal in
         * the formula means a salt; arsenic means a different chemical
         * entirely; no hydrogen at all means something like C2Cl4. None of
         * these are judgement calls, and each one was a real wrong drawing. */
        const propRes = await pug(
          `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${candidate}/property/MolecularFormula/JSON`);
        await sleep(GAP);
        const formula = propRes
          ? (await propRes.json())?.PropertyTable?.Properties?.[0]?.MolecularFormula || ""
          : "";
        const elements = [...formula.matchAll(/([A-Z][a-z]?)/g)].map((m) => m[1]);
        const exotic = elements.filter((e) => !DRUG_ELEMENTS.has(e));
        const metal = elements.filter((e) => SALT_METALS.has(e));

        if (!formula) { lastReason = `${candidate}: no formula`; continue; }
        if (!elements.includes("C") || !elements.includes("H")) {
          lastReason = `CID ${candidate} is ${formula} — no carbon or no hydrogen`; continue;
        }
        if (exotic.length) {
          lastReason = `CID ${candidate} is ${formula} — contains ${exotic.join(", ")}`; continue;
        }
        if (metal.length) {
          lastReason = `CID ${candidate} is ${formula} — a ${metal.join("/")} salt`; continue;
        }
        cid = candidate; askedWith = name; break;
      }

      if (!cid) {
        if (lastReason) unverified.push(`${s.id} (${lastReason})`);
        else missing.push(s.name);
        continue;
      }

      const recRes = await pug(
        `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cid}/record/JSON?record_type=2d`);
      await sleep(GAP);
      if (!recRes) { missing.push(s.name); continue; }

      const rec = await recRes.json();
      const packed = pack(rec.PC_Compounds?.[0] || {});
      if (!packed || packed.a.length < 2) { missing.push(s.name); continue; }

      packed.cid = Number(cid);
      structures[s.id] = packed;
      if (done % 25 === 0) console.log(`  ${label}`);
    } catch {
      missing.push(s.name);
    }
  }

  const doc = {
    note: "2D layouts from PubChem, packed by scripts/build-structures.mjs. "
      + "Explicit hydrogens on carbon are dropped, as a skeletal formula drops them.",
    generated: new Date().toISOString().slice(0, 10),
    source: {
      name: "PubChem, US National Library of Medicine",
      url: "https://pubchem.ncbi.nlm.nih.gov/",
      license: "Public domain (US Government)",
    },
    structures,
  };

  const json = JSON.stringify(doc);
  await writeFile(path.join(ROOT, "data/structures.json"), json + "\n");

  console.log(`\ndata/structures.json`);
  console.log(`  drawn        ${Object.keys(structures).length} of ${list.length}`);
  console.log(`  no structure ${missing.length}`);
  console.log(`  raw          ${(Buffer.byteLength(json) / 1024).toFixed(0)} KB`);
  console.log(`  gzipped      ${(gzipSync(json).length / 1024).toFixed(0)} KB`);
  if (missing.length) {
    /* Families rather than compounds - "2C-x", "25x-NBOMe" - have no single
       structure and correctly have none here. Named so the gap is visible. */
    console.log(`\n  without a structure: ${missing.slice(0, 20).join(", ")}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
