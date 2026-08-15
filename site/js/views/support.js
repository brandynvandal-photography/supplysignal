/* Recovery, mental health, trauma, and where to get supplies.
 *
 * The hardest part of this view is tone, not structure. It sits inside a harm
 * reduction tool, which means it is written for someone who is curious about
 * options - never as pressure to quit, and never as a judgement on anyone
 * still using. Two rules follow from that:
 *
 *   1. Nothing here is framed as a condition for deserving the rest of the
 *      site. Someone can read the alerts and testing pages forever and never
 *      open this one, and that is a legitimate way to use this.
 *   2. Recovery is not treated as a synonym for abstinence. Medication is
 *      treatment, using less is a real outcome, and wanting help with what is
 *      underneath counts on its own.
 *
 * Content lives in data/support.json so it can be edited and translated
 * without touching code.
 */

import {
  h, frag, clear, section, callout, extLink, empty, disclosure, jumpNav, badge, group, safeHref,
  sourceSink,
} from "../ui.js";
import * as data from "../data.js";
import { saferUseBlock } from "./help.js";
import { communitiesBlock } from "../communities.js";

export async function render() {
  /* Started together, awaited later - see the note in views/substances.js. */
  [data.checking(), data.communities()].forEach((p) => p.catch(() => {}));

  const g = await data.support();
  if (!g) {
    return empty("This section could not load.", "Check your connection and try again.");
  }

  SRC = sourceSink();          // fresh per render; see the note on sourceRow
  const wrap = h("div");
  wrap.appendChild(h("h1", null, "Support"));

  /* A letter, not a callout.
     As a filled info panel with a headline this read as a banner - a notice
     ABOUT the reader rather than something written TO them - and a banner is
     the one register this page cannot afford, because it is the page where
     someone decides whether this site is an offer or an instruction. So: the
     same soft wash and left rule as the Alerts welcome, and prose that
     addresses the reader directly. No severity tint either; there is nothing
     here to warn anyone about.

     No opening line in bold. It was doing a headline's job under a different
     name - the eye landed on it, read a statement, and skipped the paragraphs
     that actually say the thing. Straight into the body means the first words
     read are "Maybe you want to stop", which is the offer itself rather than
     an announcement of one.

     Placed BELOW the jump nav. At the top it was the first and largest thing
     on the page, so someone who came looking for a phone number had to read a
     paragraph about how they are allowed to feel before reaching anything
     actionable. The nav goes first; this is here for whoever slows down. */
  const letter = h("div", { class: "letter" },
    ...g.framing.body.map((p) => h("p", null, p)),
    /* Quiet, not bold. Bolding this made it read as the terms and
       conditions on the offer above it. */
    h("p", { class: "letter__close" }, g.framing.close));

  wrap.appendChild(
    jumpNav([
      { id: "grp-help", label: "Finding help" },
      { id: "grp-now", label: "Staying safer now" },
      { id: "sec-trauma", label: "Trauma" },
      { id: "sec-pregnancy", label: "Pregnant or parenting" },
      { id: "sec-loved", label: "Someone you love" },
      { id: "sec-communities", label: "Finding your people" },
    ])
  );

  wrap.appendChild(letter);

  /* Two doors into the After page, high on Support because the people who
     need it are usually looking for something else when they realise it
     exists. It is a link rather than a nested section: the content is long,
     it serves three different readers, and burying it inside a page about
     treatment would misfile it as a treatment step. */
  wrap.appendChild(
    h("a", { class: "bigptr", href: "#/after" },
      h("span", { class: "bigptr__hd" }, "After an overdose"),
      h("span", { class: "bigptr__sub" },
        "What happens next for whoever it happened to, and for whoever was in " +
        "the room — plus support for people the usual help isn’t built for."))
  );

  /* ---- what is underneath ---- */
  /* Framing only, open and short. Trauma used to nest inside this - a single
     child sitting in a parent's 32px of body padding, which read as an
     orphaned row floating in space rather than as a subsection. It is its own
     top-level section again, RENAMED so it no longer collides with this
     block's title (the pair previously read "What is often underneath" and
     "What sits underneath", which is why it was nested in the first place). */
  wrap.appendChild(
    disclosure("sec-underneath", g.underneath.headline, { open: true },
      h("div", { class: "card" },
        ...g.underneath.body.map((p) => h("p", null, p)),
        h("p", { class: "sec__note" }, g.underneath.note)))
  );

  wrap.appendChild(
    sectionOrPending("sec-trauma", "Trauma and mental health", g.trauma, renderTrauma)
  );

  /* Pregnancy and parenting.
   *
   * Adoption was the original ask and this is deliberately not that. The
   * organisations offering "adoption support" to pregnant people who use drugs
   * include crisis pregnancy centres that are not neutral about the outcome,
   * and putting a coercive referral inside an app whose promise is that
   * nothing here is conditional would be worse than the gap.
   *
   * The need underneath it is legal, and it is answerable: what a hospital
   * notification actually is, whether stopping medication is safer (it is not),
   * what a Plan of Safe Care means, and where state law diverges. */
  if (g.pregnancy) {
    const P = g.pregnancy;
    wrap.appendChild(
      disclosure("sec-pregnancy", P.headline, null,
        h("p", { class: "sec__note" }, P.intro),
        frag(P.items.map((x) =>
          h("div", { class: "card" },
            h("h3", null, x.t),
            h("p", null, x.b),
            x.note ? h("p", { class: "sec__note" }, x.note) : null,
            SRC.add(x.sources)))),
        P.gap ? h("p", { class: "sec__note" }, P.gap) : null,
        P.lastVerified
          ? h("p", { class: "sec__note" }, `Checked ${P.lastVerified}.`) : null));
  }

  wrap.appendChild(
    group("grp-help", "Finding help",
      "Treatment, getting through the door, people who have been there, and what to do about cost.", [
        sectionOrPending("sec-options", "Treatment options", g.options, renderOptions),
        sectionOrPending("sec-getting", "Getting services", g.getting, renderGetting),
        sectionOrPending("sec-peer", "Peer support", g.peer, renderPeer),
        /* Cost sits inside this group rather than last on the page: it is the
           barrier people assume is final, so it belongs beside the things it
           is a barrier to. */
        disclosure("sec-cost", g.cost.headline, null,
          h("div", { class: "card" },
            h("p", null, g.cost.body),
            h("p", null, h("strong", null, g.cost.note)))),
      ],
      /* The preview list. Without it this collapses to a title and a chevron,
         which is the failure ui.js:293 documents. */
      ["Treatment options", "Getting services", "Peer support", "If you cannot pay"])
  );

  wrap.appendChild(
    group("grp-now", "Staying safer right now",
      "Supplies, checking what you have, and lowering the odds — no decisions required.", [
        sectionOrPending("sec-supplies", "Getting supplies", g.supplies, renderSupplies),
        await checkingBlock(),
        saferUseBlock(),
      ],
      ["Getting supplies", "Getting your supply checked", "If you are going to use"])
  );

  /* Not a group(). With one child, group() returns that child and throws away
     the id, the title and the blurb - so the "Someone you love" jump chip
     pointed at an element that never existed and did nothing when tapped, and
     two reader-facing strings had never once rendered. The block carries its
     own heading, so it goes in directly and the chip points at sec-loved. */
  wrap.appendChild(lovedBlock(g));

  /* The culturally-specific directory. Last of the sections because it is the
     one people arrive looking for by name rather than stumble into - and
     because everything above it is the general case it exists to qualify. */
  const communities = await communitiesBlock();
  if (communities) wrap.appendChild(communities);

  /* No About link here. It lives in the footer, which is on every page and is
     where people look for it - a second copy at the foot of Support was just
     the old dropdown wearing a different hat. */

  const sources = SRC.render();
  if (sources) wrap.appendChild(sources);

  return wrap;
}

/** Render a section, or a plain note if its data has not been added yet. */
function sectionOrPending(id, title, payload, renderer) {
  if (!payload) {
    return disclosure(id, title, null,
      h("div", { class: "card" },
        h("p", { class: "sec__note" },
          "Being verified. This section is populated from checked sources rather " +
          "than written from memory, so it appears once every link and phone " +
          "number has been confirmed.")));
  }
  return disclosure(id, title, null, renderer(payload));
}

/* --------------------------------------------------------------- sections */

function renderOptions(o) {
  return frag(
    o.intro ? h("p", null, o.intro) : null,
    (o.medications || []).map((m) =>
      h("div", { class: "card" },
        h("h3", null, m.name),
        h("p", null, m.what),
        m.how ? h("p", null, h("strong", null, "How to start: "), m.how) : null,
        m.note ? h("p", { class: "sec__note" }, m.note) : null,
        sourceRow(m.sources))),
    o.evidence
      ? callout("info", "What the evidence shows", h("p", null, o.evidence.body),
          sourceRow(o.evidence.sources))
      : null,
    o.stimulants
      ? h("div", { class: "card" },
          h("h3", null, "Stimulants"),
          h("p", null, o.stimulants.body),
          sourceRow(o.stimulants.sources))
      : null
  );
}

function renderGetting(x) {
  return frag(
    x.intro ? h("p", null, x.intro) : null,
    (x.routes || []).map((r) =>
      h("div", { class: "card" },
        h("h3", null, r.name),
        h("p", null, r.what),
        h("div", { class: "chips" },
          r.url ? extLink(r.url, r.linkText || "Open", "btn btn--ghost btn--sm") : null,
          r.phone
            ? h("a", { class: "btn btn--ghost btn--sm", href: `tel:${r.phone.replace(/\D/g, "")}` },
                r.phone)
            : null))),
    (x.lines || []).length
      ? frag(
          h("h3", null, "Lines for specific people"),
          h("div", { class: "hotline" },
            x.lines.map((l) =>
              /* safeHref, not the raw URL. This was the one place a shipped
                 org link reached an href without the http/https allowlist -
                 harmless with hand-curated data, but the allowlist is
                 defense-in-depth against a future CSP regression and it only
                 works if it has no exceptions. */
              h("a", { href: l.phone ? `tel:${l.phone.replace(/\D/g, "")}` : safeHref(l.url),
                       ...(l.url && !l.phone ? { target: "_blank", rel: "noopener noreferrer", referrerpolicy: "no-referrer" } : {}) },
                h("span", null,
                  h("span", { class: "lbl" }, l.name),
                  l.who ? h("span", { class: "sub" }, l.who) : null,
                  /* Hours, but only where a line is NOT round-the-clock.
                     Most of this list is 24/7 and says so in `who`, so silence
                     was reading as always-on - which sent a trans reader to a
                     number that does not answer on a Saturday night. */
                  l.hours ? h("span", { class: "sub sub--hours" }, l.hours) : null,
                  /* Who can send police is not a footnote. An unmarked entry
                     next to Trans Lifeline's stated no-dispatch policy reads
                     as vetted rather than undocumented, which is backwards. */
                  l.dispatch ? h("span", { class: "sub sub--dispatch" }, l.dispatch) : null),
                h("span", { class: "num" }, l.phone || "Open")))))
      : null
  );
}

function renderPeer(p) {
  return frag(
    p.intro ? h("p", null, p.intro) : null,
    p.medicationNote
      ? callout("warn", "Before you walk in", h("p", null, p.medicationNote))
      : null,
    (p.groups || []).map((gp) =>
      h("details", { class: "acc" },
        h("summary", null, h("span", null, gp.name)),
        h("div", { class: "acc__body" },
          h("p", null, gp.what),
          gp.medication ? h("p", null, h("strong", null, "On medication? "), gp.medication) : null,
          gp.url ? h("div", { class: "chips" }, extLink(gp.url, "Find a meeting", "btn btn--ghost btn--sm")) : null)))
  );
}

function renderTrauma(t) {
  return frag(
    t.intro ? h("p", null, t.intro) : null,
    t.aces
      ? h("div", { class: "card" },
          h("h3", null, t.aces.title),
          h("p", null, t.aces.body),
          t.aces.caveat ? h("p", { class: "sec__note" }, t.aces.caveat) : null,
          sourceRow(t.aces.sources))
      : null,
    (t.approaches || []).length
      ? frag(h("h3", null, "Treatments with evidence behind them"),
          h("div", { class: "card" },
            h("ul", null, t.approaches.map((a) =>
              h("li", null, h("strong", null, a.name), " — ", a.what)))))
      : null,
    (t.experiences || []).length
      ? frag(
          h("h3", null, "Support for specific experiences"),
          (t.experiences || []).map((e) =>
            h("div", { class: "card" },
              h("h3", null, e.name),
              e.what ? h("p", null, e.what) : null,
              h("div", { class: "chips" },
                e.url ? extLink(e.url, e.linkText || "Open", "btn btn--ghost btn--sm") : null,
                e.phone
                  ? h("a", { class: "btn btn--ghost btn--sm", href: `tel:${e.phone.replace(/\D/g, "")}` }, e.phone)
                  : null))))
      : null
  );
}

function renderSupplies(s) {
  const group = (title, list, tone) =>
    !list?.length ? null : frag(
      h("h3", null, title),
      list.map((v) =>
        h("div", { class: "card" },
          h("div", { class: "card__top" },
            h("span", { class: `badge badge--${tone}` }, v.cost),
            v.delivery ? h("span", { class: "card__meta" }, v.delivery) : null),
          h("h3", null, v.name),
          v.what ? h("p", null, v.what) : null,
          h("div", { class: "chips" },
            v.url ? extLink(v.url, "Open", "btn btn--ghost btn--sm") : null))));

  return frag(
    s.intro ? h("p", null, s.intro) : null,
    // Free first, always. Many people reading this cannot pay, and burying
    // free options under vendors is its own kind of barrier.
    group("Free", s.free, "ok"),
    // Peer-run sits high on the page deliberately. For a lot of people these
    // are the only services that have ever treated them decently, and they are
    // usually the fastest route to supplies without ID or an explanation.
    s.grassroots
      ? frag(
          h("h3", null, "Peer-run and grassroots"),
          h("p", { class: "sec__note" }, s.grassroots.intro),
          s.grassroots.items.map((v) =>
            h("div", { class: "card" },
              h("div", { class: "card__top" },
                h("span", { class: "badge badge--ok" }, v.cost),
                v.delivery ? h("span", { class: "card__meta" }, v.delivery) : null),
              h("h3", null, v.name),
              v.what ? h("p", null, v.what) : null,
              h("div", { class: "chips" },
                v.url ? extLink(v.url, "Open", "btn btn--ghost btn--sm") : null))),
          s.grassroots.note ? h("p", { class: "sec__note" }, s.grassroots.note) : null
        )
      : null,
    s.byState ? stateLookup(s.byState) : null,
    group("Directories — find something near you", s.directories, "neutral"),
    group("Paid", s.paid, "neutral"),
    s.closed
      ? callout("warn", s.closed.title,
          h("ul", null, s.closed.items.map((i) => h("li", null, i))))
      : null,
    s.legalNote ? callout("warn", "Check your state first", h("p", null, s.legalNote)) : null,
    s.lastVerified
      ? h("p", { class: "sec__note" },
          `State programs verified ${s.lastVerified}. These change often — ` +
          `test strip programs especially, since federal grant money can no ` +
          `longer be used to buy them.`)
      : null
  );
}

/**
 * "What does my state offer?"
 *
 * A tier rather than 50 links. Most state naloxone pages block automated
 * checking, so a link list here would rot invisibly - and several already
 * have. Routing through a finder that is actively maintained is more honest
 * than a wall of URLs nobody re-verifies.
 */
function stateLookup(bs) {
  const NAMES = {
    AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
    CO: "Colorado", CT: "Connecticut", DE: "Delaware", DC: "District of Columbia",
    FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois",
    IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana",
    ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan",
    MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana",
    NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
    NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota",
    OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
    RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota",
    TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia",
    WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
  };

  const byCode = new Map();
  for (const t of bs.tiers) for (const c of t.states) byCode.set(c, t);

  const out = h("div", { role: "status", "aria-live": "polite" });
  const sel = h("select", { class: "input", "aria-label": "Your state" },
    h("option", { value: "" }, "Choose your state…"),
    Object.entries(NAMES)
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([code, name]) => h("option", { value: code }, name)));

  sel.addEventListener("change", () => {
    clear(out);
    if (!sel.value) return;
    const tier = byCode.get(sel.value);
    if (!tier) {
      out.appendChild(callout("info", "Not confirmed either way",
        h("p", null,
          "We could not verify a statewide mail program here. The national " +
          "finder above still covers you, and a local syringe service program " +
          "is usually the fastest route.")));
      return;
    }
    out.appendChild(
      h("div", { class: "card" },
        h("div", { class: "card__top" },
          h("span", { class: `badge badge--${tier.tone}` }, tier.label)),
        h("h3", null, NAMES[sel.value]),
        tier.note ? h("p", null, tier.note) : null,
        h("div", { class: "chips" },
          extLink("https://nextdistro.org/statefinder", "Open the state finder", "btn btn--ghost btn--sm")))
    );
  });

  return frag(
    h("h3", null, "What your state offers"),
    h("p", { class: "sec__note" }, bs.intro),
    h("div", { class: "filter" }, h("div", { class: "filter__row" }, sel)),
    out
  );
}

/* Collected to one list at the foot of the page rather than rendered where
   cited - see sourceSink in ui.js, and note what deliberately stays inline
   (every organization link in the directory is a destination, not a source). */
let SRC = sourceSink();

function sourceRow(sources) {
  return SRC.add(sources);
}

/* Where to get a sample actually checked. Hand-verified directory (see
   data/checking.json) - the fastest-rotting data in the app, which is why
   every entry carries a lastVerified date and the section shows it. */
async function checkingBlock() {
  const d = await data.checking();
  if (!d) return h("span");

  const entry = (e) =>
    h("div", { class: "card" },
      h("div", { class: "card__top" },
        e.st ? badge(e.st, "neutral") : null,
        h("h3", null, e.name)),
      h("p", null, e.access),
      e.anon ? h("p", { class: "sec__note" }, e.anon) : null,
      e.caveat ? h("p", { class: "sec__note" }, e.caveat) : null,
      h("div", { class: "sources" },
        extLink(e.url, "Website"),
        e.results ? extLink(e.results, "Published results") : null,
        e.locator ? extLink(e.locator, "Find a site") : null,
        e.social ? extLink(e.social, "Instagram") : null));

  return disclosure("sec-checking", "Getting your supply checked", null,
    h("p", { class: "sec__note" }, d.reality),

    h("h3", null, "Mail-in and national"),
    frag(d.national.map(entry)),

    h("h3", null, "State and city programs"),
    frag(d.programs.map(entry)),

    h("h3", null, "Community and grassroots"),
    d.grassroots ? h("p", { class: "sec__note" }, d.grassroots.note) : null,
    d.grassroots ? frag(d.grassroots.orgs.map(entry)) : null,

    h("h3", null, "Find something closer"),
    h("div", { class: "chips" },
      d.locators.map((l) => extLink(l.url, l.name, "btn btn--ghost btn--sm"))),

    callout("info", "Is the equipment legal where you are?",
      h("p", null, d.legality.text),
      h("div", { class: "sources" },
        d.legality.sources.map((x) => extLink(x.url, x.name)))),

    h("p", { class: "sec__note" },
      `Every link above was checked alive on ${d.lastVerified}. Programs change ` +
      "fast — if one is gone, the locators are the fallback."));
}

/* For the person who loves someone who uses.
 *
 * The design brief names three audiences - people who use drugs, the people
 * who love them, and outreach workers - and until now the second had nothing
 * addressed to them.
 *
 * The hard part is that this section could very easily violate the app's own
 * rules. Advice for families is where coercion hides: "set boundaries" and
 * "stop enabling" are the socially approved answers, and both are ways of
 * making contact conditional. So this leads with the evidence rather than the
 * instinct - CRAFT engages about two-thirds of people whose families were
 * told nothing would work, against 13% for Al-Anon-style facilitation and 23%
 * for staged confrontation - and every item is phrased as something the
 * reader can do, never as leverage to apply to someone else.
 *
 * Note also what it does NOT do: it never tells a family how to get someone
 * into treatment as the goal. Recovery is not a synonym for abstinence here
 * for the person using, and it cannot quietly become one when their mother is
 * the one reading. */
function lovedBlock(g) {
  const L = g.loved;
  if (!L) return h("span");

  const item = (x, kind) =>
    h("div", { class: `lovedrow lovedrow--${kind}` },
      h("h4", null,
        h("span", { class: "lovedrow__mark", "aria-hidden": "true" }, kind === "do" ? "✓" : "✕"),
        x.t),
      h("p", null, x.b));

  return disclosure("sec-loved", L.headline, null,
    h("p", { class: "sec__note" }, L.intro),

    callout("info", L.keeping.title,
      h("p", null, L.keeping.body),
      h("div", { class: "sources" },
        L.keeping.sources.map((x) => extLink(x.url, x.name)))),

    /* Both columns are labelled in words as well as by glyph and colour - a
       list of don'ts read as do's is the worst possible failure here. */
    h("h3", null, "What helps"),
    frag(L.does.map((x) => item(x, "do"))),

    h("h3", null, "What backfires"),
    frag(L.donts.map((x) => item(x, "dont"))),

    /* The heading sits OUTSIDE the card so it aligns with "What helps",
       "What backfires" and "Support for you". Inside, it inherited the card's
       smaller heading style and the card's inset, so the one reassuring beat
       in this section read as a stray box wedged between two lists. */
    h("h3", null, L.hard.title),
    h("div", { class: "card lovedhard" },
      h("p", null, L.hard.body)),

    h("h3", null, "Support for you"),
    frag(L.help.map((x) =>
      h("div", { class: "card" },
        h("h4", null, x.name),
        h("p", null, x.note),
        h("div", { class: "sources" }, extLink(x.url, "Visit"))))),

    h("p", { class: "sec__note" },
      `Links checked ${L.lastVerified}. Nothing here is a technique for getting ` +
      "someone to do something — it is how to stay close enough to matter."));
}
