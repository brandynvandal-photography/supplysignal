/* Where to donate.
 *
 * Nearly everything on this site is somebody else's work. The dose tables come
 * from PsychonautWiki, the combination matrix from TripSit, the reagent colors
 * from DanceSafe, the naloxone guidance from health departments, the syringe
 * program listings from the programs themselves. This app collects and arranges
 * it; it does not produce it. This page is the list of organizations behind
 * those sources, with a link to give to each of them directly.
 *
 * WHAT IS DELIBERATELY NOT HERE.
 *
 * Crisis and domestic-violence hotlines are cited all over this app and none of
 * them are on this page. A donate button beside a number somebody is calling at
 * the worst hour of their life is the wrong object on the wrong screen, and the
 * ask does not become appropriate just because it is one screen further away.
 * They keep their citations; they do not get a collection tin.
 *
 * Government agencies, journals and manufacturers are also absent, for the
 * duller reason that there is nothing to give them.
 *
 * NOTHING HERE ROUTES THROUGH US. Every link goes to the organization's own
 * donation page, and the build strips tracking parameters - utm_*, refcode,
 * sourceid - off every URL before it lands in the data file, so the page can
 * say that and have it be true. There is no referral code anywhere in this
 * repository and there is not going to be one.
 *
 * EVERY LINK WAS FETCHED. A donate link that 404s is worse than no link: it
 * spends somebody's intention to give and returns nothing. See
 * scripts/build-donate.mjs for how each URL was confirmed, and
 * test/donate.test.mjs for what is enforced on every build.
 */

import { h, extLink, callout, jumpNav, disclosure } from "../ui.js";
import * as data from "../data.js";

/* The groups, in the order they render. `key` matches what the build assigns
   from the datasets an organization is cited in - not a judgment made here,
   so a new citation moves an organization without anybody editing this file. */
const GROUPS = [
  {
    key: "harm",
    id: "sec-harm",
    title: "Harm reduction, drug checking and naloxone",
    blurb:
      "The organizations whose published work this app is mostly built out of — "
      + "reagent charts, test strip guidance, syringe access, naloxone by mail.",
  },
  {
    key: "support",
    id: "sec-support",
    title: "Support, recovery and community",
    blurb:
      "Cited on the support and community pages: peer groups, clinics, and "
      + "organizations serving people this app's other sources tend to leave out.",
  },
  {
    key: "policy",
    id: "sec-policy",
    title: "Policy, law and research",
    blurb:
      "Cited where this app explains what the law actually says, or where a "
      + "figure came from a study rather than an agency.",
  },
];

export async function render(route, ctx) {
  const wrap = h("div");
  const doc = (ctx?.data || data).donate ? await (ctx?.data || data).donate() : { orgs: [] };
  const orgs = (doc.orgs || []).filter((o) => o && o.name && o.donate);

  wrap.appendChild(h("h1", null, "Where to donate"));

  const present = GROUPS.filter((g) => orgs.some((o) => o.group === g.key));
  if (present.length > 1) {
    wrap.appendChild(jumpNav(present.map((g) => ({ id: g.id, label: g.title }))));
  }

  /* Same shared opener as Alerts, Support, Test and About - see .intro. */
  wrap.appendChild(
    h("div", { class: "intro" },
      h("h2", null, "This site is other people's work"),
      h("p", null,
        "The dose ranges, the combination warnings, the reagent colors, the "
        + "naloxone steps — almost none of it was produced here. It was published "
        + "by the organizations below, and this app collects it and puts it in one "
        + "place. If any of it has been useful, they are the ones to give to."),
      h("p", null,
        "Nothing on this page routes through us. Every link goes straight to the "
        + "organization's own donation page, with tracking parameters removed. "
        + "Nightlight takes no money, from you or from them."))
  );

  if (!orgs.length) {
    wrap.appendChild(
      callout("info", "This list has not loaded",
        h("p", null,
          "It needs a connection the first time. Everything else on this site "
          + "keeps working without one."))
    );
    return wrap;
  }

  /* One sentence, and it is the honest caveat: being on this list means the
     organization published something this app cites, and nothing more. It is
     not a rating, and a reader deciding where money goes should not read it as
     one. */
  wrap.appendChild(
    callout("info", "This is a list of sources, not a ranking",
      h("p", null,
        "An organization is here because this app cites its work. That is all it "
        + "means: nothing here is a judgment about how well any of them spend "
        + "money, and the smallest ones — a van, a table at an event — are mixed "
        + "in with national bodies."))
  );

  for (const g of present) {
    const rows = orgs
      .filter((o) => o.group === g.key)
      .sort((a, b) => (b.refs || 0) - (a.refs || 0) || a.name.localeCompare(b.name));

    /* A DISCLOSURE, NOT A BARE SECTION, and the reason is the jump chips above.
       The id used to sit on the blurb paragraph, so every chip on this page
       scrolled to a <p> with no heading - which views.test.mjs calls out by
       name, because a chip that lands on nothing looks like a broken link and
       reports as one. A disclosure carries the id on an element whose summary
       IS the heading, which is what every other jump target on the site is.
       Open, because the list is the page. */
    wrap.appendChild(
      disclosure(g.id, g.title, { open: true },
        h("p", { class: "sec__note" }, g.blurb),
        h("div", { class: "card" },
          h("ul", { class: "srclist" }, rows.map((o) => orgRow(o)))))
    );
  }

  wrap.appendChild(
    h("p", { class: "sec__note" },
      `${orgs.length} organizations. Every link was fetched and checked on `
      + `${doc.checked || "the date in the data file"}.`)
  );

  return wrap;
}

/* An organization, as one line.
 *
 * The DONATE page is what the name links to, because that is what this screen
 * is for - a second link to the same organization's home page would double the
 * tap targets on a phone for no gain. The domain is printed beside it instead,
 * unlinked, so a reader can see who they are about to give money to before they
 * tap. Reading the destination is the point; a bare "Donate" link that hides
 * the domain is exactly the shape of a phishing row. */
function orgRow(o) {
  return h("li", null,
    extLink(o.donate, o.name),
    h("span", { class: "sec__note" },
      ` ${o.domain}`,
      o.refs > 1 ? ` · cited ${o.refs} times here` : " · cited once here"));
}
