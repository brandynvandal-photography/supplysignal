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

/* Longest name first, and the raw text for the abbreviation branch.
 *
 * Two bugs lived in the old four lines.
 *
 * "Virginia" is a substring of "West Virginia", and the state map is ordered
 * by abbreviation, so VA was tested before WV and EVERY West Virginia article
 * matched Virginia first. The two states share no county names, so any WV
 * county whose bare name is ambiguous nationally could never resolve - 38 of
 * 55 of them. "Kansas" inside "Arkansas" and inside "Kansas City" did the same
 * thing to Missouri.
 *
 * And the abbreviation fallback was dead code. Its own documented example,
 * "Chattanooga, TN", cannot match: callers pass an already-lowercased string,
 * and the pattern requires [A-Z]{2}. It never fired once. It takes the raw
 * text now.
 *
 * Sorted once at build time rather than per call. */
let STATES_BY_LENGTH = null;

function stateFromText(text, raw = "") {
  if (!INDEX) return null;
  if (!STATES_BY_LENGTH) {
    STATES_BY_LENGTH = Object.entries(INDEX.states)
      .map(([abbr, name]) => [abbr, name.toLowerCase()])
      .sort((a, b) => b[1].length - a[1].length);
  }

  /* Word-boundary, so "kansas" cannot match inside "arkansas", and longest
     first, so "west virginia" wins over "virginia" wherever both appear. */
  for (const [abbr, name] of STATES_BY_LENGTH) {
    const re = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
    if (re.test(text)) return abbr;
  }

  // Abbreviation only with a comma before it: "Chattanooga, TN"
  const m = String(raw || text).match(/,\s*([A-Z]{2})\b/);
  if (m && INDEX.states[m[1]]) return m[1];
  return null;
}

/**
 * @returns {{fips, name, state, method}|null}
 */
export function geotag(item, hintFips = null, hintState = null) {
  if (!INDEX) throw new Error("geotag index not built");

  const raw = `${item.title} ${item.body || ""}`;
  const text = raw.toLowerCase();
  const state = hintState || stateFromText(text, raw);

  /* hintFips is a TIEBREAKER, not an answer.
   *
   * It used to return immediately, before a single word of the item was read.
   * hintFips is set for every result Google News returns for a county's
   * query - and Google does not enforce the quoted phrases, so an article
   * about a different county, or a different state, was filed under whichever
   * county happened to be querying. Every ambiguity safeguard below was
   * unreachable for the pipeline's highest-volume source.
   *
   * Now the text speaks first. The hint is accepted when the text says
   * nothing, or when it agrees; where the text names a DIFFERENT state the
   * item is dropped rather than filed somewhere it does not belong. */
  const hinted = hintFips ? INDEX.all.find((x) => x.fips === hintFips) : null;
  if (hinted && state && state !== hinted.state) return null;

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

  /* Pass 2: the querying county, as a fallback rather than an override.
   *
   * Reached only when the text named no county of its own AND did not name a
   * different state - both checked above. That is the case hintFips is
   * genuinely good evidence for: Google returned this item for this county's
   * query and nothing in the text contradicts it. */
  if (hinted) return { ...hinted, method: "query_scope" };

  // Pass 3: state-level only. Kept as a state rollup, not attributed to a county.
  if (state) {
    return { fips: null, name: null, state, method: "state_only" };
  }

  return null;
}
