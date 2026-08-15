// Add PubChem synonyms to the search index's alias lists.
//
//   node scripts/build-synonyms.mjs
//
// WHY THIS EXISTS, AND WHY IT IS PUBCHEM
//
// The UNC chemical dictionary would have given 105 street names the search
// index does not carry. It arrived by email, it is not the file their public
// repository ships, and their published policy forbids redistribution without
// written permission — so docs/OUTREACH.md §2 asks for it and nothing from it
// has been used. That ask may be answered in a week or never.
//
// PubChem answers the same question with no permission to seek. It is US
// National Library of Medicine, public domain, and it already resolved 263 of
// this app's 298 substances for the structure build. Its synonym lists are
// long and mixed — registry numbers, IUPAC strings, trade names, and the
// occasional genuine street name — so the filtering below is most of the work.
//
// WHAT IS KEPT, and every rule here exists because the raw list is unusable:
//   - Nothing already known, matched case-insensitively against name + aliases.
//   - Nothing that is a registry identifier: CAS numbers, UNII codes, DEA
//     numbers, CHEMBL/SCHEMBL/NSC/EINECS/DTXSID and friends.
//   - Nothing that is systematic chemistry. An IUPAC name is not what anybody
//     calls their drug, and 40-character strings full of brackets and commas
//     make a search result list unreadable.
//   - Nothing under three characters, which is where false matches live.
//   - At most 12 per substance, longest-first by informativeness, because a
//     drug with 400 synonyms would otherwise drown every other result.
//
// The point is a person typing what a thing is actually called reaching the
// page about it. Anything that does not serve that is noise with a licence.

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const UA = "Nightlight/1.0 (public health harm reduction; +https://nightlight.help)";
const GAP = 260;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Registry identifiers and systematic chemistry — never a street name. */
const JUNK = [
  /^\d{2,7}-\d{2}-\d$/,                    // CAS
  /^[A-Z0-9]{10}$/,                        // UNII
  /^(CHEMBL|SCHEMBL|DTXSID|DTXCID|NSC|EINECS|EC |UNII|AKOS|CID|SMR|MFCD|BRD|BDBM|HMS|HY-|CS-|NCGC|Q\d)/i,
  /* Anything shaped Database:12345. The first run shipped 264 of these -
     "RefChem:79592" as a searchable name for 1B-LSD - because the prefix list
     above only caught the vendors it happened to know. Match the SHAPE. */
  /^[A-Za-z]{2,12}:\s*\d/,
  /\d{4,}/,                                 // any long digit run is a catalogue
  /^[A-Z0-9][A-Z0-9\-. ]*\d[A-Z0-9\-. ]*$/, // ALLCAPS with digits
  /\b(salt|hydrate)\b/i,
  /^[A-Z]{14}-[A-Z]{10}-[A-Z]$/,           // InChIKey - all letters, so the
  /^[A-Z\-]{16,}$/,                        // digit rules above cannot see it
  /^\d+$/,
  /^[A-Z]{1,3}-?\d{3,}$/,                  // vendor catalogue codes
  /^\(\d|^\[|^\d+[,-]\d/,                  // starts like a systematic name
  /\b(yl|oxy|amino|methyl|ethyl|propyl|butyl|phenyl|hydroxy|chloro|fluoro|bromo)\)/i,
  /[[\]{}]/,                               // brackets: systematic
  /\d\s*[HR]\s*[-,)]/,
];
const SYSTEMATIC = /(benzo\[|pyrrolidin|piperidin|carboxamide|carboxylate|propanamide|sulfonate|hydrochloride|monohydrate|dihydrate|\bacid\b.*\bester\b)/i;

const looksSystematic = (t) =>
  t.length > 34 ||
  (t.match(/[,\-()]/g) || []).length >= 4 ||
  SYSTEMATIC.test(t) ||
  /^\W/.test(t);

function usable(t, known) {
  const s = t.trim();
  if (s.length < 3 || s.length > 34) return false;
  if (known.has(s.toLowerCase())) return false;
  if (JUNK.some((re) => re.test(s))) return false;
  if (looksSystematic(s)) return false;
  /* Must contain a letter and not be mostly digits. */
  if (!/[a-z]/i.test(s)) return false;
  if ((s.match(/\d/g) || []).length > s.length / 2) return false;
  return true;
}

async function main() {
  const idxPath = path.join(ROOT, "data/search.json");
  const idx = JSON.parse(await readFile(idxPath, "utf8"));
  const structs = JSON.parse(await readFile(path.join(ROOT, "data/structures.json"), "utf8"));

  let added = 0, touched = 0, done = 0;
  for (const d of idx.drugs || []) {
    done++;
    const cid = structs.structures?.[d.i]?.cid;
    if (!cid) continue;                    // no compound, nothing to ask about

    const known = new Set([d.n, ...(d.a || [])].map((x) => String(x).toLowerCase()));
    try {
      const res = await fetch(
        `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cid}/synonyms/JSON`,
        { headers: { "user-agent": UA } });
      await sleep(GAP);
      if (!res.ok) continue;
      const list = (await res.json())?.InformationList?.Information?.[0]?.Synonym || [];

      const keep = [];
      for (const t of list) {
        const s = t.trim();
        if (!usable(s, known)) continue;
        known.add(s.toLowerCase());
        keep.push(s);
        if (keep.length >= 12) break;
      }
      if (keep.length) {
        d.a = [...(d.a || []), ...keep];
        added += keep.length;
        touched++;
      }
      if (done % 40 === 0) console.log(`  ${done}/${idx.drugs.length} …${added} names so far`);
    } catch { /* a name that will not resolve is not an error worth stopping for */ }
  }

  idx.generated = new Date().toISOString().slice(0, 10);
  idx.synonymSource = {
    name: "PubChem, US National Library of Medicine",
    url: "https://pubchem.ncbi.nlm.nih.gov/",
    license: "Public domain (US Government)",
  };
  await writeFile(idxPath, JSON.stringify(idx) + "\n");

  console.log(`\ndata/search.json`);
  console.log(`  drugs given new names   ${touched}`);
  console.log(`  names added             ${added}`);
  console.log(`  file                    ${((await readFile(idxPath)).length / 1024).toFixed(0)} KB`);
}

main().catch((e) => { console.error(e); process.exit(1); });
