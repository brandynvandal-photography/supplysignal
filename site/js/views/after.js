/* After an overdose.
 *
 * Everything else in this app is about before and during. This is the part
 * nobody writes: the person wakes up, the ambulance leaves or does not come,
 * and then there is a Tuesday.
 *
 * Two audiences share the page because they share the night: the person it
 * happened to, and whoever was in the room. The culturally-specific directory
 * used to live here too and now sits on Support - see js/communities.js.
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
 *     "14% of people whose fentanyl overdose brought them to an emergency
 *     department" is true. Complication rates diverge wildly between an
 *     overdose reversed on a floor and one that reaches an ICU, and stripping
 *     that context is how this page would start lying while quoting real
 *     papers.
 *   - EVERY CITATION GOES TO THE FOOT. Claims carry their sources, but a
 *     reader who is frightened should not have to wade through a row of grey
 *     links between every two paragraphs. See sourceSink below.
 */

import { h, frag, callout, extLink, disclosure, jumpNav } from "../ui.js";
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
  if (jumps.length > 1) wrap.appendChild(jumpNav(jumps));

  const src = sourceSink();

  if (d.survivor) wrap.appendChild(survivorBlock(d.survivor, src));
  if (d.witness) wrap.appendChild(witnessBlock(d.witness, src));

  /* The directory lives on Support - see js/communities.js for why. This is
     the pointer, not a copy: someone who arrives here after an overdose is
     also exactly the person who may need a provider who will not make them
     explain themselves, and they should not have to already know that page
     exists. */
  wrap.appendChild(
    h("a", { class: "bigptr", href: "#/support" },
      h("span", { class: "bigptr__hd" }, "Finding people who already get it"),
      h("span", { class: "bigptr__sub" },
        "Support for LGBTQIA+ and trans people, Black, Native and Latino " +
        "communities, survivors, pregnant people, veterans and others — on the " +
        "Support page."))
  );

  /* Every citation on the page, once, at the foot. */
  const sources = src.render();
  if (sources) wrap.appendChild(sources);

  void go; void route;
  return wrap;
}

/* ------------------------------------------------------------- the person */

function survivorBlock(s, src) {
  return disclosure("sec-survivor", s.title, { open: true },
    h("p", { class: "sec__note" }, s.intro),

    /* The re-overdose window is the only thing on this page that is urgent,
       so it renders before anything reflective. */
    s.window
      ? callout("warn", s.window.title,
          h("p", null, s.window.body),
          s.window.detail ? h("p", null, s.window.detail) : null,
          src.add(s.window.sources))
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
          src.add(s.watch.sources))
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
          src.add(s.risk.sources))
      : null,

    s.brain
      ? h("div", { class: "card" },
          h("h3", null, s.brain.title),
          h("p", null, s.brain.body),
          h("p", null, s.brain.detail),
          src.add(s.brain.sources))
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

function witnessBlock(w, src) {
  return disclosure("sec-witness", w.title, { open: false },
    h("p", { class: "sec__note" }, w.intro),

    w.anger
      ? callout("info", w.anger.title,
          h("p", null, w.anger.body),
          w.anger.detail ? h("p", null, w.anger.detail) : null,
          src.add(w.anger.sources))
      : null,

    w.items
      ? frag(w.items.map((x) =>
          h("div", { class: "lovedrow" }, h("h4", null, x.t), h("p", null, x.b))))
      : null,

    w.grief
      ? frag(
          h("h3", null, w.grief.title),
          h("p", null, w.grief.body),
          src.add(w.grief.sources))
      : null);
}

/* Citations are collected while the page builds and rendered ONCE at the foot,
   rather than as a row of grey links under every block.
 *
 * Every claim still carries its source - it just does not interrupt the
 * reading to prove itself. Six citation rows stacked between "what to watch
 * for" and "the honest number" turned a page someone reads while frightened
 * into a bibliography with paragraphs in it.
 *
 * The org links inside the directory cards are deliberately NOT collected.
 * Those are not attribution, they are the destination - the thing a person
 * taps to get help - and moving them to a footer would break the page's
 * actual job. Only sources move.
 */
function sourceSink() {
  const seen = new Map();          // url -> {name, url}, dedup across blocks
  return {
    add(list) {
      for (const s of list || []) if (s?.url && !seen.has(s.url)) seen.set(s.url, s);
      return null;                 // returns null so it can sit inline in a tree
    },
    render() {
      if (!seen.size) return null;
      return h("div", { class: "foot-attr" },
        h("h3", null, "Where this comes from"),
        h("ul", null,
          [...seen.values()].map((s) => h("li", null, extLink(s.url, s.name)))));
    },
  };
}
