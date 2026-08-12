/* Early warning - substances turning up elsewhere, ahead of local reporting.
 *
 * This screen is deliberately walled off from the county views, and that
 * separation is the whole design.
 *
 * Neither feed is local to anyone reading this. Health Canada's file is
 * Canadian law-enforcement seizures; CFSRE's alerts are national US. Put either
 * one on a county page and a reader will take it as a statement about their
 * neighbourhood, which would be worse than showing nothing - it would
 * manufacture false confidence about a threat that may or may not be there.
 *
 * What these ARE good for is lead time. Xylazine, then medetomidine, then the
 * nitazenes each appeared in forensic surveillance before comparable local
 * signal existed. So this page answers "what should I know about before it gets
 * here", and never "what is in my area". The copy says that out loud, at the
 * top, in words rather than in a tooltip.
 *
 * No counts framed as rates, no province breakdown, no prevalence. A first
 * detection is a date and a name; that is all it honestly is. */

import { h, frag, section, callout, extLink, empty, badge } from "../ui.js";
import * as data from "../data.js";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July",
  "August", "September", "October", "November", "December"];

function monthYear(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(+d) ? iso : `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export async function render(route, { go }) {
  const doc = await data.emerging();
  const wrap = h("div");

  wrap.appendChild(
    h("button", { type: "button", class: "backlink", onClick: () => go("#/alerts") },
      h("span", { "aria-hidden": "true" }, "‹"), " Alerts")
  );

  wrap.appendChild(
    h("div", { class: "county-head" },
      h("h1", null, "Early warning"),
      h("p", { class: "classcard__hint" },
        "Substances being identified elsewhere, often before they are documented locally."))
  );

  /* The framing has to do real work here, so it is a callout rather than fine
     print, and it is the first thing on the page. */
  wrap.appendChild(
    callout("warn", "This is not about your area",
      h("p", null,
        "Everything below is ", h("strong", null, "national"),
        " — from Canada’s drug-testing lab and from a US forensic science center. " +
        "None of it says whether any of these drugs are in your county."),
      h("p", null,
        "New adulterants tend to show up in lab testing somewhere before they are " +
        "reported everywhere. This page exists so a drug is not new to you the " +
        "first time it reaches you."))
  );

  /* ---- US alerts ---- */
  if (doc.alerts?.length) {
    wrap.appendChild(
      section("Published alerts", "United States, national",
        frag(doc.alerts.map((a) =>
          h("div", { class: "card" },
            h("div", { class: "card__top" },
              badge("Alert", "neutral"),
              h("time", { class: "card__meta", datetime: a.date }, monthYear(a.date))),
            h("h3", null, a.title),
            h("div", { class: "sources" }, extLink(a.url, "Read the alert"))))))
    );
  }

  /* ---- Canadian first detections ---- */
  if (doc.firstDetections?.length) {
    const items = doc.firstDetections;
    const list = h("div");

    /* Long tail: 96 names is a wall. Show the recent ones and let the rest be
       opened deliberately - no infinite scroll, no "load more" that hides how
       much there is. */
    const RECENT = 12;
    const recent = items.slice(0, RECENT);
    const rest = items.slice(RECENT);

    const line = (d) =>
      h("div", { class: "firstdet" },
        h("span", { class: "firstdet__name" }, d.substance),
        h("span", { class: "firstdet__when" }, `first identified ${monthYear(d.date)}`));

    list.appendChild(frag(recent.map(line)));
    if (rest.length) {
      list.appendChild(
        h("details", { class: "disc" },
          h("summary", null, `${rest.length} earlier first detections`),
          h("div", null, rest.map(line)))
      );
    }

    wrap.appendChild(
      section("First detections", "Canada, national",
        h("p", { class: "sec__note" },
          "Substances Canada’s national lab identified for the first time in a sample " +
          "submitted to it. A first detection means a drug exists and has been " +
          "confirmed somewhere — not that it is common, and not that it is here."),
        list)
    );
  }

  if (!doc.alerts?.length && !doc.firstDetections?.length) {
    wrap.appendChild(
      empty("The early-warning feed didn’t load with this copy of the app.",
        "Try reloading. If it keeps happening, this copy is incomplete.")
    );
  }

  /* ---- global systems, link-out only ---- */
  if (doc.globalLinks?.length) {
    wrap.appendChild(
      section("Wider than North America", null,
        h("p", { class: "sec__note" },
          "Supply routes start in producer countries, but early warning comes from " +
          "wherever drugs are used and tested. These systems watch other continents; " +
          "neither offers a feed this app could bundle, so they are links to check, " +
          "not data shown here."),
        frag(doc.globalLinks.map((s) =>
          h("div", { class: "card" },
            h("h3", null, s.name),
            h("p", { class: "card__meta" }, s.author),
            h("p", null, s.note),
            h("div", { class: "sources" }, extLink(s.url, "Visit")))))));
  }

  /* Attribution is a licence condition for Health Canada, not a courtesy. */
  if (doc.sources?.length) {
    wrap.appendChild(
      section("Where this comes from", null,
        frag(doc.sources.map((s) =>
          h("div", { class: "card" },
            h("h3", null, s.name),
            h("p", { class: "card__meta" }, `${s.author} · ${s.scope}`),
            h("p", null, s.note),
            h("div", { class: "sources" }, extLink(s.url, "Source"))))))
    );
  }

  return wrap;
}
