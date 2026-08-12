/* Link rot watch.
 *
 *   node scripts/check-links.mjs            # report
 *   node scripts/check-links.mjs --strict   # exit 1 if anything is DEAD
 *
 * The hand-curated files carry ~130 outbound URLs: drug-checking programs,
 * crisis lines, FDA labels, harm reduction orgs. They are the fastest-rotting
 * content in the app, and a dead link here is not cosmetic - it is someone in
 * a crisis tapping "find a program near you" and landing on nothing.
 *
 * Rot found by hand in one afternoon: testri.org stopped resolving,
 * DanceSafe's chapter directory 404'd, and both canonical FDA opioid+benzo
 * safety pages vanished. Nobody would have noticed for months.
 *
 * THE KEY DISTINCTION this makes, which a naive checker gets wrong:
 *
 *   DEAD    - 404, 410, DNS failure, connection refused. Fix or remove.
 *   GUARDED - 403/429 from a bot filter. The page is FINE in a browser.
 *             cfsre.org, nyc.gov, cdc.gov PDFs and nastad.org all do this.
 *             Treating these as dead would delete good links; treating them
 *             as fine would hide real failures. They are reported separately
 *             and never fail the build.
 *
 * Requests are same-origin-irrelevant here: this runs in CI, never in a
 * browser, so no reader's IP ever touches these hosts. */

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(ROOT, "data");
const STRICT = process.argv.includes("--strict");

/* Generated bundles are excluded: their links come from upstream feeds and
   churn by design. Only hand-curated files are checked. */
const SKIP = new Set([
  "alerts.json", "emerging.json", "substances.json", "combos.json",
  "reagents.json", "mortality.json", "regional.json", "places.json",
  "places-rural.json", "counties.json", "county-shapes.json",
  "adjacency.json", "runs.json", "index.json",
]);

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/126.0 Safari/537.36";

/** Every http(s) URL in a JSON tree, with the path that led to it. */
function harvest(node, file, at = "", out = []) {
  if (typeof node === "string") {
    if (/^https?:\/\//.test(node)) out.push({ url: node, file, at });
  } else if (Array.isArray(node)) {
    node.forEach((v, i) => harvest(v, file, `${at}[${i}]`, out));
  } else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) harvest(v, file, at ? `${at}.${k}` : k, out);
  }
  return out;
}

async function probe(url) {
  const ctl = AbortController ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => ctl.abort(), 45000) : null;
  try {
    /* GET, not HEAD: several of these hosts reject HEAD outright even when the
       page is fine (cfsre.org does exactly this). */
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: { "user-agent": UA, accept: "*/*" },
      signal: ctl?.signal,
    });
    /* The body matters, not just the code. A parked domain answers 200 with a
       stub, which every status-only checker on earth calls healthy. */
    let body = "";
    try { body = (await res.text()).slice(0, 20000); } catch {}
    return {
      status: res.status, finalUrl: res.url,
      parked: looksParked(res, body),
      challenged: looksChallenged(res, body),
    };
  } catch (e) {
    return { status: 0, error: e.name === "AbortError" ? "timeout" : e.message };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/* Parked-domain signatures.
 *
 * urbansurvivorsunion.org shipped in this app for months pointing at a drug
 * user union. It answers 200 - so this checker passed it - with a 114-byte
 * body whose entire content is a script redirecting to /lander. It is a
 * monetized parking page. That is strictly worse than a 404: a 404 tells the
 * reader the thing is gone, while this hands someone looking for a peer-run
 * union an ad page and looks deliberate.
 *
 * Two independent tests, because either alone misfires: an explicit parking
 * marker, or a body too small to be a real page with no title to speak of.
 * A genuine content page fails neither. */
const PARK_MARKERS = [
  /window\.location(\.href)?\s*=\s*["'`]\/lander/i,
  /sedoparking|parkingcrew|bodis\.com|afternic|dan\.com|hugedomains/i,
  /this\s+domain\s+(name\s+)?(is|may\s+be)\s+for\s+sale/i,
  /buy\s+this\s+domain/i,
];

/* Bot challenges that answer 200 instead of 403.
 *
 * These look identical to a parking stub from the outside - small body, no
 * title, a script and an iframe - and the first version of the parked check
 * duly accused APA.org of being a squatter. That is the exact false
 * accusation this file was written to avoid, so challenges are identified
 * first and routed to GUARDED, where a human can see the page is fine in a
 * browser. */
const CHALLENGE_MARKERS = [
  /_Incapsula_Resource|incapsula/i,
  /cf-browser-verification|challenge-platform|cdn-cgi\/challenge/i,
  /just a moment\.\.\.|checking your browser|enable javascript and cookies/i,
  /ak-bmsc|akamai.*bot|distil_r_captcha/i,
];

function looksChallenged(res, body) {
  return res.ok && CHALLENGE_MARKERS.some((re) => re.test(body));
}

function looksParked(res, body) {
  /* Strictly 200. library.samhsa.gov answers 202 with an empty body - a queue
     or WAF response, not a squatter - and the length test happily condemned
     it. Parking pages always render something at 200; that is the whole point
     of parking. */
  if (res.status !== 200) return false;
  if (!body.length) return false;
  if (looksChallenged(res, body)) return false;
  if (PARK_MARKERS.some((re) => re.test(body))) return true;
  /* Only reached for a page that is small, untitled, and NOT a challenge. */
  const hasTitle = /<title>\s*\S[^<]*<\/title>/i.test(body);
  return body.length < 1200 && !hasTitle;
}

const files = (await readdir(DATA)).filter((f) => f.endsWith(".json") && !SKIP.has(f));
const links = [];
for (const f of files) {
  const json = JSON.parse(await readFile(path.join(DATA, f), "utf8"));
  harvest(json, f, "", links);
}

/* Dedupe: the same FDA label is cited from several places. */
const byUrl = new Map();
for (const l of links) {
  if (!byUrl.has(l.url)) byUrl.set(l.url, []);
  byUrl.get(l.url).push(`${l.file}:${l.at}`);
}

console.log(`checking ${byUrl.size} unique URLs from ${files.length} hand-curated files\n`);

const dead = [], guarded = [], moved = [], ok = [], parked = [];
const entries = [...byUrl.entries()];

/* Small concurrency: polite to the nonprofits on this list, and fast enough. */
const LIMIT = 6;
for (let i = 0; i < entries.length; i += LIMIT) {
  await Promise.all(entries.slice(i, i + LIMIT).map(async ([url, where]) => {
    let r = await probe(url);
    /* One retry before condemning anything. health.maryland.gov answers in
       ~30s under load and was reported dead on a first-pass timeout - a false
       accusation here means deleting a working drug-checking program. */
    if (r.status === 0) r = await probe(url);
    const row = { url, where, ...r };
    if (r.parked) parked.push(row);
    else if (r.status === 0 || r.status === 404 || r.status === 410) dead.push(row);
    else if (r.status === 403 || r.status === 429 || r.challenged) guarded.push(row);
    else if (r.status >= 400) dead.push(row);
    else {
      // A redirect that lands somewhere structurally different is worth knowing.
      if (r.finalUrl && new URL(r.finalUrl).hostname !== new URL(url).hostname) moved.push(row);
      ok.push(row);
    }
  }));
}

const show = (label, rows) => {
  if (!rows.length) return;
  console.log(`${label} (${rows.length})`);
  for (const r of rows) {
    console.log(`  ${String(r.status || r.error).padEnd(8)} ${r.url}`);
    console.log(`           cited by: ${r.where.join(", ")}`);
    if (r.finalUrl && r.finalUrl !== r.url) console.log(`           -> ${r.finalUrl}`);
  }
  console.log("");
};

show("PARKED - answers 200 but is a domain-parking stub. Worse than a 404.", parked);
show("DEAD - fix or remove", dead);
show("MOVED to another host - verify the destination is still right", moved);
show("GUARDED by a bot filter - almost certainly fine in a browser", guarded);

console.log(`${ok.length} ok · ${guarded.length} guarded · ${moved.length} moved · ` +
            `${dead.length} dead · ${parked.length} parked`);

/* Parked fails the build alongside dead. It is not a lesser problem: a dead
   link tells the reader the thing is gone, a parked one hands them an ad page
   dressed as the resource they asked for. */
if (STRICT && (dead.length || parked.length)) {
  const n = dead.length + parked.length;
  console.error(`\n${n} broken link(s). A reader tapping one of these gets nothing, ` +
                `or worse, gets something pretending to be the thing they wanted.`);
  process.exitCode = 1;
}
