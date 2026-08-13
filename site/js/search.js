/* Search.
 *
 * Runs entirely on the device, over two bundled files. There is no endpoint and
 * there must never be one: a query here is the most revealing thing a reader
 * could send anywhere. "fentanyl", "will i get arrested if i call 911", "i hurt
 * someone" — each is a sentence about somebody's life. See PRIVACY.md §1.
 *
 * Order of precedence, and the reasoning for it:
 *
 *   1. INTENT. Hand-curated question phrasings, because the queries people
 *      actually type are questions, not keywords, and no amount of text
 *      matching turns "how long does weed stay in your system" into the right
 *      destination. Twenty-five intents outperform the whole index for the
 *      queries that matter most.
 *   2. SLANG. "tranq" is xylazine; "blues" is fentanyl. Alias lists cover the
 *      drug's own names; this covers what the supply is called.
 *   3. EXACT / PREFIX matches on drug names and aliases.
 *   4. Destinations from the index, prefix before word-start before substring.
 *   5. FUZZY, and only when everything above returned nothing. Running edit
 *      distance eagerly makes every result mushy - it is a rescue for a typo,
 *      not a ranking signal.
 */

import * as data from "./data.js";

const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

/* Bounded Levenshtein: stops as soon as the distance exceeds `max`, because a
   full matrix over 300 drug names on every keystroke is wasted work. */
function within(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      if (cur[j] < best) best = cur[j];
    }
    if (best > max) return false;
    prev = cur;
  }
  return prev[b.length] <= max;
}

let INDEX = null;
let INTENTS = null;

async function load() {
  if (!INDEX) INDEX = await data.searchIndex();
  if (!INTENTS) INTENTS = await data.searchIntents();
  return { INDEX, INTENTS };
}

/** Warm the bundles without blocking. Safe to call repeatedly. */
export function prefetch() { load().catch(() => {}); }

function drugResult(d, why) {
  return { kind: "Drug", label: d.n, route: `#/substances/${d.i}`, why };
}

export async function search(term, limit = 10) {
  const q = norm(term);
  if (q.length < 2) return [];
  const { INDEX: idx, INTENTS: intents } = await load();
  const out = [];
  const taken = new Set();

  /* Deduped on the LABEL alone, not on label+route.
     The same title legitimately appears in more than one data file - "Never
     Use Alone" is in the hotlines, the communities directory and the sitting
     guide - and three identical rows pointing at three pages reads as a bug
     even though each is technically a different destination. First match wins,
     which given the ordering above means the highest-ranked one does. */
  const push = (r) => {
    const key = norm(r.label);
    if (!key || taken.has(key)) return;
    /* Second rule, complementary to the first: two DIFFERENT labels that land
       on the same heading are a duplicate from the reader's side, however
       different they look in the index - "Heat exhaustion" and "Spotting heat
       exhaustion and heat stroke" both scroll to sec-spot. Only applied when
       there is an anchor. Entries with no anchor land on the top of a page and
       are genuinely separate destinations; collapsing those would leave a
       search for a drug class showing one row for all of Drugs. */
    const dest = r.anchor ? `${r.route}#${r.anchor}` : null;
    if (dest && taken.has(dest)) return;
    taken.add(key);
    if (dest) taken.add(dest);
    out.push(r);
  };

  /* 1. Intent. Matched on whole phrasings both ways, so "arrested 911" finds
        "will i get arrested if i call 911" and vice versa. */
  for (const it of intents.intents || []) {
    if ((it.q || []).some((p) => {
      const np = norm(p);
      if (np === q) return true;
      if (q.includes(np)) return true;      // they typed more around the phrase
      /* A phrasing CONTAINING the query only counts for a multi-word query.
         Otherwise "narcan" hijacks "where to get narcan" and "fentanyl"
         hijacks "fentanyl test strips" - a single word should reach the thing
         it names, not a question that happens to mention it. */
      return q.includes(" ") && np.includes(q);
    })) {
      push({ kind: "Answer", label: it.label, route: it.route, anchor: it.anchor, why: it.why });
    }
  }

  /* 2. Slang, exact token match only - "g" should not match everything. */
  const slangId = (intents.slang || {})[q];
  if (slangId) {
    const d = (idx.drugs || []).find((x) => x.i === slangId);
    if (d) push(drugResult(d, `Also called “${term.trim()}”`));
  }

  /* 3. Drugs by name and alias. */
  const starts = [], contains = [];
  for (const d of idx.drugs || []) {
    const n = norm(d.n);
    if (n === q) { push(drugResult(d)); continue; }
    if (n.startsWith(q)) { starts.push(drugResult(d)); continue; }
    const alias = (d.a || []).find((a) => norm(a) === q || norm(a).startsWith(q));
    if (alias) { starts.push(drugResult(d, `Also called “${alias}”`)); continue; }
    if (n.includes(q)) contains.push(drugResult(d));
  }
  starts.forEach(push);

  /* 4. Destinations. */
  const dStart = [], dWord = [], dIn = [];
  for (const e of idx.entries || []) {
    const t = norm(e.t);
    const r = { kind: e.k, label: e.t, route: e.r, anchor: e.a };
    if (t.startsWith(q)) dStart.push(r);
    else if (t.includes(` ${q}`)) dWord.push(r);
    else if (t.includes(q)) dIn.push(r);
  }
  dStart.forEach(push); dWord.forEach(push);
  contains.forEach(push); dIn.forEach(push);

  /* 5. Fuzzy, only if nothing above matched at all. */
  if (!out.length && q.length >= 4) {
    const max = q.length > 7 ? 2 : 1;
    for (const d of idx.drugs || []) {
      /* Aliases matter more than names here. Nobody mistypes "alprazolam";
         they type "xanex", and the thing that is one letter away is the
         alias, not the drug's formal name. */
      const hit = within(q, norm(d.n), max)
        || (d.a || []).some((a) => within(q, norm(a), max));
      if (hit) push(drugResult(d, "Did you mean this?"));
      if (out.length >= limit) break;
    }
    if (!out.length) {
      for (const e of idx.entries || []) {
        if (within(q, norm(e.t), max)) {
          push({ kind: e.k, label: e.t, route: e.r, anchor: e.a, why: "Did you mean this?" });
        }
        if (out.length >= limit) break;
      }
    }
  }

  return out.slice(0, limit);
}
