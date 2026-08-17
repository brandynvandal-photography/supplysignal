/* About.
 *
 * Its own page rather than a dropdown at the bottom of Support, because the
 * questions it answers - what is this, who is behind it, where do the numbers
 * come from, what does it know about me, how do I tell you it is wrong - are
 * not a subsection of "getting help". Someone deciding whether to trust this
 * enough to act on it is doing something different from someone looking for
 * a treatment program.
 *
 * Deliberately NOT in the bottom nav: five tabs already fill the bar at 375px,
 * and About does not belong beside Emergency in thumb reach. It is reached
 * from the footer, which is where people look for it.
 */

import {
  h, frag, section, callout, extLink, disclosure, jumpNav, sourcesDisclosure,
} from "../ui.js";
import * as data from "../data.js";
import { privacyBlock } from "./help.js";

export async function render(route, { go }) {
  const wrap = h("div");

  wrap.appendChild(h("h1", null, "About Nightlight"));

  wrap.appendChild(
    jumpNav([
      { id: "sec-what", label: "What it is" },
      { id: "sec-sources", label: "Where data comes from" },
      { id: "sec-updates", label: "How often it updates" },
      { id: "sec-privacy", label: "What it knows about you" },
      { id: "sec-wrong", label: "If something is wrong" },
    ])
  );

  /* Same shared opener as Alerts, Support and Test - see .intro. */
  wrap.appendChild(
    h("div", { class: "intro" },
      h("h2", null, "What this is"),
      h("p", null,
        "A free, open reference that collects what public sources have already " +
        "published about the drug supply in each US county — and puts the harm " +
        "reduction basics next to it."),
      h("p", null,
        "No account, no tracking, no ads, nothing to buy. It works offline once " +
        "loaded."))
  );


  /* ---- what it is and is not ---- */
  wrap.appendChild(
    disclosure("sec-what", "What it is, and what it is not", { open: true },
      aboutBlock2())
  );

  /* ---- provenance ---- */
  wrap.appendChild(
    sourcesDisclosure("Where this data comes from",
      await sourcesBlock())
  );

  /* ---- cadence ---- */
  wrap.appendChild(
    disclosure("sec-updates", "How often it updates", null,
      h("div", { class: "card" },
        h("ul", null,
          li("Alerts: every three hours.",
            "An automated job reads health-department and local-news feeds. Most runs it finds nothing, which is normal."),
          li("Overdose data: monthly.",
            "CDC provisional counts, which lag reality by several months and are revised."),
          li("Substance reference: weekly.",
            "Doses, durations, interactions and reagent reactions are rebuilt from their upstream sources."),
          li("Hand-checked directories: manually, and dated.",
            "Programs and phone numbers are verified by a person. An automated check flags dead links nightly, but a link that still loads can still be out of date.")),
        h("p", { class: "sec__note" },
          "Every published item carries its own date. If something looks stale, it probably is — " +
          "reporting on a local drug supply is patchy everywhere in the country.")))
  );

  /* ---- privacy: the same block the Emergency tab shows, one source of truth ---- */
  wrap.appendChild(privacyBlock());

  /* ---- corrections ---- */
  wrap.appendChild(
    disclosure("sec-wrong", "If something here is wrong", null,
      h("div", { class: "card" },
        h("p", null,
          "Please say so. A wrong number, a closed program, a claim that does not match " +
          "what you see locally."),
        h("p", null,
          "Clinical claims here are meant to carry a source you can check. If one does not, " +
          "or the source does not say what we claim it says, that is a defect."),
        callout("warn", "Before you write to us",
          h("p", null,
            "Anything you send leaves this app, and our privacy promises do not follow " +
            "it. Please leave out your own use, where you are, and anything about " +
            "anyone else. A report works fine anonymously — the page, the claim, and " +
            "what is wrong with it is all we need."))))
  );

  wrap.appendChild(
    section("Built on other people’s work", null,
      h("p", { class: "sec__note" },
        "The organizations below do the actual work, most of them on very little money."),
      h("div", { class: "chips" },
        extLink("https://harmreduction.org/", "National Harm Reduction Coalition", "btn btn--ghost btn--sm"),
        extLink("https://dancesafe.org/", "DanceSafe", "btn btn--ghost btn--sm"),
        extLink("https://psychonautwiki.org/", "PsychonautWiki", "btn btn--ghost btn--sm"),
        extLink("https://tripsit.me/", "TripSit", "btn btn--ghost btn--sm"),
        extLink("https://www.streetsafe.supply/", "UNC Street Drug Analysis Lab", "btn btn--ghost btn--sm"),
        extLink("https://nextdistro.org/", "NEXT Distro", "btn btn--ghost btn--sm")))
  );

  void go; void route;
  return wrap;
}

const li = (strong, rest) =>
  h("li", null, h("strong", null, strong), rest ? " " + rest : null);

/** What it is / is not. Longer than the Emergency-tab version, which is a
 *  one-card summary; this is the full account. */
function aboutBlock2() {
  return frag(
    h("div", { class: "card" },
      h("p", null,
        "Nightlight reads public feeds — state and county health departments, " +
        "the CDC, local news, and forensic drug-checking labs — and reorganizes what " +
        "they publish by county, alongside every county that borders it."),
      h("p", null,
        "A supply does not stop at a county line, so a warning one county over is " +
        "often the more useful one."),

      h("h3", null, "What it is not"),
      h("ul", null,
        li("Not medical advice.", "It cannot examine anyone, and it does not know your situation."),
        li("Not a safety check.", "Nothing here verifies a drug or clears it. No test, and no absence of alerts, makes anything safe."),
        li("Not a complete picture.", "Most changes in a local drug supply are never publicly announced. An empty county page means nobody published — not that nothing is happening."),
        li("Not a treatment service.", "It points at services other people run; it does not provide care.")),

      h("h3", null, "Who it is for"),
      h("p", null,
        "People who use drugs, the people who love them, and the outreach workers who " +
        "sit with both. Nothing here is conditional on wanting to stop."))
    /* The Emergency tab's short aboutBlock() is NOT reused here - it is a
       one-card summary of exactly this, and rendering both put two headings
       saying the same thing on one page. */
  );
}

/** Provenance, generated from what is actually bundled rather than a hand
 *  list that would drift out of date the first time a source changed. */
async function sourcesBlock() {
  const [subs, checking, emerging] = await Promise.all([
    data.substances().catch(() => null),
    data.checking().catch(() => null),
    data.emerging().catch(() => null),
  ]);

  const rows = [];
  for (const a of subs?.attribution || []) {
    rows.push({ name: a.source, url: a.url, note: a.note, license: a.license });
  }
  for (const s of emerging?.sources || []) {
    rows.push({ name: s.name, url: s.url, note: s.note, license: s.author });
  }

  return frag(
    h("p", { class: "sec__note" },
      "Everything is fetched when the site is built and shipped as part of the page. " +
      "Your browser never contacts any of these — that is what keeps a lookup private."),

    frag(rows.map((r) =>
      h("div", { class: "card" },
        h("h3", null, r.name),
        r.license ? h("p", { class: "card__meta" }, r.license) : null,
        r.note ? h("p", null, r.note) : null,
        r.url ? h("div", { class: "sources" }, extLink(r.url, "Source")) : null))),

    checking?.lastVerified
      ? h("p", { class: "sec__note" },
          `Hand-checked program directories were last verified ${checking.lastVerified}.`)
      : null
  );
}
