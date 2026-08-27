/* THE DONATE PAGE ASKS FOR MONEY ON SOMEBODY ELSE'S BEHALF.
 *
 * That is a different kind of claim from the rest of this app, and it fails in
 * ways the other datasets cannot. A dose range that is slightly stale is still
 * roughly right. A donate link that is wrong is either a dead end that spends
 * somebody's intention to give and returns nothing, or - worse - it sends money
 * to the wrong place entirely.
 *
 * So the checks here are about DESTINATION rather than about prose:
 *
 *   - https, always. A donation form over http is not one to send people to.
 *   - no tracking parameters. The page tells readers nothing routes through us
 *     and that every link is clean; this is what makes the sentence checkable
 *     rather than a promise. utm_source arrived on real links from two orgs.
 *   - the destination is the organization's own domain, or a donation platform
 *     from a known list. Anything else means the link drifted.
 *   - never a homepage. Several sites point "Donate" at a front-page anchor,
 *     which is not a donation page and must not be listed as one.
 *   - no hotline, ever. The scope decision was that crisis, suicide and DV
 *     lines are cited but never solicited for. Encoded in build-donate.mjs and
 *     asserted here so re-running the builder cannot quietly undo it.
 *   - the groups in the data and the groups the view can render are the SAME
 *     set. A group present in one and not the other is a section of the page
 *     that silently never appears - the failure this suite has been bitten by
 *     before (see views.test.mjs).
 */

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CRISIS, clean } from "../scripts/build-donate.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const file = path.join(ROOT, "data", "donate.json");

let pass = 0;
const fails = [];
const ok = (name, cond) => { if (cond) pass++; else fails.push(name); };

console.log("DONATE\n");

if (!existsSync(file)) {
  console.log("  not ok data/donate.json is missing");
  console.log("\n0 passed, 1 failed");
  process.exit(1);
}

const doc = JSON.parse(readFileSync(file, "utf8"));
const orgs = doc.orgs || [];

ok("there are organizations to show", orgs.length > 0);
ok("the file records when a person last checked the links",
   /^\d{4}-\d{2}-\d{2}$/.test(String(doc.checked || "")));

/* Donation platforms an off-domain link may legitimately land on. */
const PLATFORMS = /(actblue|everyaction|every\.org|givebutter|donorbox|classy\.org|networkforgood|paypal\.com|givelively|mightycause|qgiv|kindful|funraise|zeffy|givengain|bloomerang|donately|fundraiseup|salsalabs|givecampus|tiltify|chuffed|betterunite|givepulse|aplos|anedot|charityengine|blackbaud|bbox|e-activist|engagingnetworks)/i;

const TRACKERS = /[?&](utm_[a-z]+|refcode|sourceid|fbclid|gclid|mc_cid|mc_eid)=/i;

const bad = { fields: [], scheme: [], tracker: [], home: [], offdomain: [], dupes: [] };
const seen = new Set();

for (const o of orgs) {
  const at = o?.name || o?.domain || "(unnamed)";
  if (!o?.name || !o?.domain || !o?.donate || !o?.group) { bad.fields.push(at); continue; }

  let u;
  try { u = new URL(o.donate); } catch { bad.scheme.push(at); continue; }

  if (u.protocol !== "https:") bad.scheme.push(`${at} -> ${u.protocol}`);
  if (TRACKERS.test(o.donate)) bad.tracker.push(`${at} -> ${o.donate}`);
  if (clean(o.donate) !== o.donate) bad.tracker.push(`${at} is not what clean() would write`);

  const h = u.hostname.replace(/^www\./, "");
  const ownDomain = h === o.domain || h.endsWith(`.${o.domain}`) || o.domain.endsWith(`.${h}`);
  if (!ownDomain && !PLATFORMS.test(h)) bad.offdomain.push(`${at} -> ${h}`);

  if (u.pathname.replace(/\/+$/, "") === "" && !u.search) bad.home.push(`${at} -> ${o.donate}`);

  if (seen.has(o.domain)) bad.dupes.push(o.domain);
  seen.add(o.domain);
}

ok(`every row has a name, domain, link and group (${orgs.length} rows)`, !bad.fields.length);
ok("every link is https" + (bad.scheme.length ? `: ${bad.scheme.join(", ")}` : ""), !bad.scheme.length);
ok("no link carries tracking parameters" + (bad.tracker.length ? `: ${bad.tracker.join(", ")}` : ""),
   !bad.tracker.length);
ok("no link is just a homepage" + (bad.home.length ? `: ${bad.home.join(", ")}` : ""), !bad.home.length);
ok("every link lands on the org or a known donation platform"
   + (bad.offdomain.length ? `: ${bad.offdomain.join(", ")}` : ""), !bad.offdomain.length);
ok("no organization is listed twice" + (bad.dupes.length ? `: ${bad.dupes.join(", ")}` : ""),
   !bad.dupes.length);

/* ---- hotlines are cited, never solicited for ---- */
const hotlines = orgs.filter((o) => CRISIS.has(o.domain)).map((o) => o.domain);
ok("no crisis or DV hotline has a donate link here"
   + (hotlines.length ? `: ${hotlines.join(", ")}` : ""), !hotlines.length);

/* ---- the data's groups and the view's groups are the same set ---- */
const view = readFileSync(path.join(ROOT, "site", "js", "views", "donate.js"), "utf8");
const rendered = new Set([...view.matchAll(/key:\s*"([a-z]+)"/g)].map((m) => m[1]));
const inData = new Set(orgs.map((o) => o.group));
const orphan = [...inData].filter((g) => !rendered.has(g));
ok("every group in the data has a section in the view"
   + (orphan.length ? `: ${orphan.join(", ")} would never render` : ""), !orphan.length);

/* ---- the page's own promise ---- */
ok("the view still tells readers nothing routes through us",
   /routes through us/i.test(view) && /tracking parameters removed/i.test(view));

for (const f of fails) console.log("  not ok " + f);
if (!fails.length) {
  console.log(`  ok   ${orgs.length} donate links: https, clean, on-domain, no hotlines`);
  console.log(`  ok   groups in the data and in the view agree (${[...inData].sort().join(", ")})`);
}
console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) process.exit(1);
