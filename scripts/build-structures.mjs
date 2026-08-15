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
  let done = 0;

  for (const s of list) {
    done++;
    const label = `${done}/${list.length} ${s.name}`;
    try {
      const cidRes = await pug(
        `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(s.name)}/cids/TXT`);
      await sleep(GAP);
      if (!cidRes) { missing.push(s.name); continue; }
      const cid = (await cidRes.text()).trim().split("\n")[0];
      if (!/^\d+$/.test(cid)) { missing.push(s.name); continue; }

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
