/* URL scheme.
 *
 * The SECTION is in the path (/alerts, /test, /drugs). Everything a reader
 * SELECTS - a county, a substance - stays in the fragment.
 *
 * That split is the whole point and it is not cosmetic. A path is transmitted
 * and lands in the host's access log; a fragment never leaves the browser.
 * PRIVACY.md section 1 calls a log containing "IP -> 47065" a disaster, and
 * section 3 promises county and substance live after the #. So /alerts is
 * loggable, /alerts#/47065 is not, and nothing a reader picks may ever move
 * left of that #.
 *
 * Pure on purpose: every function here takes a {pathname, hash} rather than
 * reading `location`, so the whole scheme - including the legacy forms that
 * cannot be changed after the fact - is testable without a browser. app.js
 * supplies the real location and the history calls.
 */

/* Path segment <-> view id. They differ where the visible tab differs from the
   internal name: the tab reads "Drugs" and the code has always said
   `substances`, and SOS has always been `help`. The path follows the label,
   because the path is the half a reader sees and shares. */
export const PATHS = {
  alerts: "alerts",
  test: "test",
  drugs: "substances",
  learn: "learn",
  support: "support",
  sos: "help",
  after: "after",
  heat: "heat",
  emerging: "emerging",
  policy: "policy",
  supervision: "supervision",
  sex: "sex",
  stimulants: "stimulants",
  about: "about",
  donate: "donate",
};

export const SEGMENTS = Object.fromEntries(
  Object.entries(PATHS).map(([seg, id]) => [id, seg])
);

export const DEFAULT_DAYS = 90;

/* decodeURIComponent throws on a truncated escape - a lone "%", "%E0%A4%A" -
   and nothing above caught it. canonicalize() runs before the first render and
   route() reads the URL outside its own try/catch, so one malformed fragment
   rejected the boot promise and left the static loading skeleton on screen
   forever, with aria-busy="true" and no error. Reproduced live against
   /sos#/%E0%A4%A: the overdose page renders nothing at all.
   A segment that will not decode is passed through as written; it will simply
   fail to match a route, which is the correct outcome for a malformed URL. */
const decodeSeg = (s) => { try { return decodeURIComponent(s); } catch { return s; } };

const split = (hash) =>
  String(hash || "").replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeSeg);

/** Sub-route -> view state. `parts` is everything after the section. */
export function decode(tab, parts) {
  if (tab === "alerts") {
    if (parts[0] === "map") {
      return { tab, map: true, focus: /^\d{5}$/.test(parts[1] || "") ? parts[1] : null };
    }
    return {
      tab,
      fips: /^\d{5}$/.test(parts[0] || "") ? parts[0] : null,
      days: Number(parts[1]) || DEFAULT_DAYS,
    };
  }
  // `sub` carries a second segment, currently only /drugs#/class/<slug>.
  return { tab, id: parts[0] || null, sub: parts[1] || null };
}

/**
 * Both URL shapes parse, and both have to.
 *
 * Path form is what the app produces now. Hash form is still load-bearing
 * three ways: the Capacitor build has no server to rewrite /alerts into
 * anything, every one of the 3,231 per-county RSS feeds publishes
 * nightlight.help/#/47065, and links people already sent each other are in
 * messages nobody can edit.
 */
export function parseRoute({ pathname = "/", hash = "" } = {}, pathRouting = true) {
  const seg = String(pathname).replace(/^\/+|\/+$/g, "");
  const parts = split(hash);

  if (pathRouting && PATHS[seg]) return decode(PATHS[seg], parts);

  if (/^\d{5}$/.test(parts[0] || "")) {
    return { tab: "alerts", fips: parts[0], days: Number(parts[1]) || DEFAULT_DAYS };
  }
  const id = SEGMENTS[parts[0]] ? parts[0] : (PATHS[parts[0]] || "alerts");
  return decode(id, parts.slice(1));
}

/**
 * "#/tab/rest" -> the URL to navigate to.
 *
 * Views still speak the old hash language. Translating here rather than at
 * every call site keeps the scheme in one file and lets the native and web
 * builds read the same source.
 */
export function toUrl(hash, pathRouting = true) {
  const parts = split(hash);

  if (!parts.length) return pathRouting ? "/alerts" : "#/alerts";
  if (/^\d{5}$/.test(parts[0])) {
    return pathRouting ? `/alerts#/${parts.join("/")}` : `#/${parts.join("/")}`;
  }
  const id = SEGMENTS[parts[0]] ? parts[0] : (PATHS[parts[0]] || "alerts");
  const rest = parts.slice(1);
  if (!pathRouting) return `#/${[id, ...rest].join("/")}`;
  return `/${SEGMENTS[id]}` + (rest.length ? `#/${rest.join("/")}` : "");
}

/**
 * The canonical URL for whatever a reader arrived on.
 *
 * Old links land here constantly and none of them can be edited after the
 * fact: /site/ and /site/#/test from anything bookmarked, #/47065 from every
 * RSS feed, #/tab links already sent. They all parse - that is what
 * parseRoute's second branch is for - but leaving the old shape in the address
 * bar means the next thing the reader copies is the old shape again.
 */
export function canonicalUrl({ pathname = "/", hash = "" } = {}, pathRouting = true) {
  if (!pathRouting) return null;
  const seg = String(pathname).replace(/^\/+|\/+$/g, "");
  const rest = split(hash);
  const asHash = PATHS[seg] ? `#/${[seg, ...rest].join("/")}` : (hash || "#/alerts");
  return toUrl(asHash, true);
}
