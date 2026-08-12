/* After an overdose.
 *
 * Everything else in this app is about before and during. This is the part
 * nobody writes: the person wakes up, the ambulance leaves or does not come,
 * and then there is a Tuesday.
 *
 * Three audiences share the page because they share the night:
 *   1. the person it happened to,
 *   2. whoever was in the room,
 *   3. anyone for whom the ordinary version of help does not fit.
 *
 * Rules this page keeps, all of which are easy to break with good intentions:
 *
 *   - IT IS NOT A FUNNEL. Surviving an overdose is the moment people get told
 *     that now, surely, they will change. That framing costs trust and it is
 *     not our business. Nothing here is conditional on stopping.
 *   - THE RISK FACTS ARE NOT A SCARE. The days after are genuinely the most
 *     dangerous window there is, and someone deserves to know that in the same
 *     tone you would tell them the stairs are icy.
 *   - NO NUMBER SHIPS WITHOUT A DENOMINATOR. "5% get brain injury" is false;
 *     "5.1% of people HOSPITALISED for opioid overdose" is true. Complication
 *     rates diverge wildly between overdoses reversed on a floor and overdoses
 *     that reach an ICU, and stripping that context is how this page would
 *     start lying while quoting real papers.
 *   - A DEAD PHONE NUMBER IS WORSE THAN NO PHONE NUMBER. Every line in the
 *     directory was opened and read, not copied from a listing. One widely
 *     published elder hotline turned out to have been switched off in 2023 and
 *     is still listed as live across dozens of directories.
 *   - WHERE A LINE MIGHT SEND POLICE, WE SAY SO. For this audience that is not
 *     a footnote, it is the deciding factor.
 */

import { h, frag, section, callout, extLink, disclosure, jumpNav, badge } from "../ui.js";
import * as data from "../data.js";

export async function render(route, { go }) {
  const d = await data.after();
  const wrap = h("div");

  wrap.appendChild(h("h1", null, d?.headline || "After an overdose"));

  if (!d) {
    wrap.appendChild(
      h("div", { class: "empty" },
        h("h3", null, "This page didn’t load with this copy of the app."),
        h("p", null, "Try reloading."))
    );
    return wrap;
  }

  wrap.appendChild(h("p", { class: "sec__note" }, d.intro));

  const jumps = [];
  if (d.survivor) jumps.push({ id: "sec-survivor", label: "If it was you" });
  if (d.witness) jumps.push({ id: "sec-witness", label: "If you were there" });
  if (d.communities) jumps.push({ id: "sec-communities", label: "Finding your people" });
  if (jumps.length > 1) wrap.appendChild(jumpNav(jumps));

  if (d.survivor) wrap.appendChild(survivorBlock(d.survivor));
  if (d.witness) wrap.appendChild(witnessBlock(d.witness));
  if (d.communities) wrap.appendChild(communitiesBlock(d.communities));

  wrap.appendChild(
    h("p", { class: "sec__note" },
      `Organizations and phone numbers checked ${d.lastVerified}.`)
  );

  void go; void route;
  return wrap;
}

/* ------------------------------------------------------------- the person */

function survivorBlock(s) {
  return disclosure("sec-survivor", s.title, { open: true },
    h("p", { class: "sec__note" }, s.intro),

    /* The re-overdose window is the only thing on this page that is urgent,
       so it renders before anything reflective. */
    s.window
      ? callout("warn", s.window.title,
          h("p", null, s.window.body),
          s.window.detail ? h("p", null, s.window.detail) : null,
          sourceRow(s.window.sources))
      : null,

    s.watch
      ? frag(
          h("h3", null, s.watch.title),
          h("p", { class: "sec__note" }, s.watch.intro),
          frag((s.watch.items || []).map((w) =>
            h("div", { class: "card" },
              h("h4", null, w.sign),
              h("p", null, w.what),
              w.when ? h("p", { class: "card__meta" }, w.when) : null))),
          s.watch.note ? h("p", { class: "sec__note" }, s.watch.note) : null,
          sourceRow(s.watch.sources))
      : null,

    /* The mortality figure and the brain-injury figure are the two most
       loaded numbers on the page, so each is a card that keeps its own
       denominator and its own counterweight in the same block - a reader must
       not be able to take the frightening half without the rest of it. */
    s.risk
      ? h("div", { class: "card" },
          h("h3", null, s.risk.title),
          h("p", null, s.risk.body),
          h("p", null, s.risk.detail),
          sourceRow(s.risk.sources))
      : null,

    s.brain
      ? h("div", { class: "card" },
          h("h3", null, s.brain.title),
          h("p", null, s.brain.body),
          h("p", null, s.brain.detail),
          sourceRow(s.brain.sources))
      : null,

    s.feelings
      ? frag(
          h("h3", null, s.feelings.title),
          frag((s.feelings.items || []).map((f) =>
            h("div", { class: "lovedrow" },
              h("h4", null, f.t),
              h("p", null, f.b)))))
      : null,

    s.closing ? h("p", null, s.closing) : null);
}

/* ------------------------------------------------------------ the witness */

function witnessBlock(w) {
  return disclosure("sec-witness", w.title, { open: false },
    h("p", { class: "sec__note" }, w.intro),

    w.anger
      ? callout("info", w.anger.title,
          h("p", null, w.anger.body),
          w.anger.detail ? h("p", null, w.anger.detail) : null,
          sourceRow(w.anger.sources))
      : null,

    w.items
      ? frag(w.items.map((x) =>
          h("div", { class: "lovedrow" }, h("h4", null, x.t), h("p", null, x.b))))
      : null,

    w.grief
      ? frag(
          h("h3", null, w.grief.title),
          h("p", null, w.grief.body),
          sourceRow(w.grief.sources))
      : null);
}

/* -------------------------------------------------------------- who you are
   A directory, not a hierarchy. The groups are ordered by how badly the
   default version of help tends to fail the people in them, not by size. */

function communitiesBlock(c) {
  return disclosure("sec-communities", c.headline, { open: false },
    h("p", { class: "sec__note" }, c.intro),

    /* Before any phone number: which of these can send police. */
    callout("warn", c.keyNote.title,
      h("p", null, c.keyNote.body),
      h("p", null, c.keyNote.detail)),

    frag((c.groups || []).map(groupBlock)),

    h("p", { class: "sec__note" }, c.howChecked),
    c.closing ? h("p", null, c.closing) : null);
}

function groupBlock(g) {
  return h("details", { class: "acc" },
    h("summary", null,
      h("span", null, g.title),
      badge(String((g.items || []).length), "neutral")),
    h("div", { class: "acc__body" },
      g.blurb ? h("p", { class: "sec__note" }, g.blurb) : null,

      frag((g.items || []).map(resourceCard)),

      /* Law sections are date-stamped and deliberately refuse to predict. */
      g.law
        ? callout("info", g.law.title,
            h("p", null, g.law.body),
            h("p", null, g.law.detail),
            g.law.checked ? h("p", { class: "sec__note" }, g.law.checked) : null,
            sourceRow(g.law.sources))
        : null,

      /* A named gap is information. Padding it with something that does not
         fit would waste a phone call someone made while desperate. */
      g.gap
        ? h("p", { class: "sec__note gapnote" },
            h("strong", null, "What doesn’t exist: "), g.gap)
        : null));
}

function resourceCard(it) {
  const policy =
    it.policy === "noncarceral"
      ? badge("Won’t call police unless you ask", "ok")
      : it.policy === "rescue"
        ? badge("May send police or EMS", "elevated")
        : null;

  return h("div", { class: "card rescard" },
    h("div", { class: "card__top" },
      h("h4", null, it.url ? extLink(it.url, it.name) : it.name),
      policy),

    it.what ? h("p", null, it.what) : null,

    /* The number is a tel: link and also readable as text - someone reading
       this on a laptop needs to be able to write it down. */
    it.num
      ? h("p", { class: "rescard__num" },
          it.tel ? h("a", { href: `tel:${it.tel}` }, it.num) : it.num)
      : null,

    it.hours ? h("p", { class: "card__meta" }, it.hours) : null,
    it.note ? h("p", null, it.note) : null,
    it.policyQuote ? h("p", { class: "sec__note" }, it.policyQuote) : null,
    it.caution
      ? h("p", { class: "sec__note rescard__caution" }, it.caution)
      : null);
}

function sourceRow(sources) {
  if (!sources?.length) return null;
  return h("div", { class: "sources" }, sources.map((x) => extLink(x.url, x.name)));
}
