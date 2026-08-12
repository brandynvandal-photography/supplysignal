/**
 * Resolve free text to a county FIPS code using the local gazetteer.
 * No geocoding API, no cost. Ambiguity is resolved by state context, and
 * anything that stays ambiguous is dropped rather than guessed.
 */

let INDEX = null;

export function buildIndex(countiesJson) {
  const byName = new Map(); // "hamilton" -> [{fips,name,state}]
  const byFull = new Map(); // "hamilton county|tn" -> entry

  for (const c of countiesJson.counties) {
    const bare = c.name
      .toLowerCase()
      .replace(
        /\s+(city and borough|census area|municipality|municipio|district|parish|borough|island|county|city)$/,
        ""
      )
      .trim();
    if (!byName.has(bare)) byName.set(bare, []);
    byName.get(bare).push(c);
    byFull.set(`${c.name.toLowerCase()}|${c.state.toLowerCase()}`, c);
  }

  INDEX = { byName, byFull, states: countiesJson.states, all: countiesJson.counties };
  return INDEX;
}

function stateFromText(text) {
  if (!INDEX) return null;
  for (const [abbr, name] of Object.entries(INDEX.states)) {
    if (text.includes(name.toLowerCase())) return abbr;
  }
  // Abbreviation only with a comma before it: "Chattanooga, TN"
  const m = text.match(/,\s*([A-Z]{2})\b/);
  if (m && INDEX.states[m[1]]) return m[1];
  return null;
}

/**
 * @returns {{fips, name, state, method}|null}
 */
export function geotag(item, hintFips = null, hintState = null) {
  if (!INDEX) throw new Error("geotag index not built");

  // A county-scoped query already knows its answer.
  if (hintFips) {
    const c = INDEX.all.find((x) => x.fips === hintFips);
    if (c) return { ...c, method: "query_scope" };
  }

  const raw = `${item.title} ${item.body || ""}`;
  const text = raw.toLowerCase();
  const state = hintState || stateFromText(text);

  // Pass 1: explicit "<name> County" mention.
  // Take up to 3 words immediately preceding the keyword and test the longest
  // suffix first, so "overdose spike in Hamilton County" resolves to "hamilton"
  // rather than swallowing the whole preceding phrase.
  const candidates = [];
  const kw = /\b(county|parish|borough|census area|municipality)\b/g;
  let m;
  while ((m = kw.exec(text)) !== null) {
    const before = text
      .slice(0, m.index)
      .replace(/[^a-z .'-]/g, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    for (let n = Math.min(3, before.length); n >= 1; n--) {
      const bare = before.slice(before.length - n).join(" ");
      const list = INDEX.byName.get(bare);
      if (!list) continue;
      if (list.length === 1) {
        candidates.push({ ...list[0], method: "county_name" });
      } else if (state) {
        const inState = list.find((c) => c.state === state);
        if (inState) candidates.push({ ...inState, method: "county_name+state" });
      }
      break; // longest match wins; stop shortening
    }
  }
  if (candidates.length === 1) return candidates[0];
  if (candidates.length > 1) {
    const inState = state && candidates.find((c) => c.state === state);
    if (inState) return inState;
    return null; // genuinely ambiguous - do not guess a location
  }

  // Pass 2: state-level only. Kept as a state rollup, not attributed to a county.
  if (state) {
    return { fips: null, name: null, state, method: "state_only" };
  }

  return null;
}
