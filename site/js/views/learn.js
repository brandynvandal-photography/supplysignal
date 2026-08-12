/* Learn — training, not reading.
 *
 * The rest of this app tells people things. This page points at the places
 * that will actually teach them to do something: reverse an overdose, do CPR,
 * handle a wound.
 *
 * It exists as its own page because it answers a different question from
 * everything else. Emergency says what to do right now. Test says how to check
 * a substance. This says how to be someone who already knows, before the night
 * it matters.
 *
 * The naloxone group leads, and inside it End Overdose leads, because their
 * course ends with a free naloxone kit - training and supply in one step is
 * the shortest path from "I should learn this" to "there is naloxone in my
 * bag", and every extra step in that chain loses people.
 */

import { h, frag, section, callout, extLink, disclosure, jumpNav } from "../ui.js";
import * as data from "../data.js";
import { practiceBlock } from "../practice.js";

export async function render(route, { go }) {
  /* Started together, awaited later - see the note in views/substances.js.
     This page renders practice, then sitting, then the course list, and each
     block used to be the first thing that asked for its own data. */
  [data.practice(), data.sitting()].forEach((p) => p.catch(() => {}));

  const e = await data.education();
  const wrap = h("div");

  wrap.appendChild(h("h1", null, "Learn"));

  if (!e) {
    wrap.appendChild(
      h("div", { class: "empty" },
        h("h3", null, "The training list didn’t load with this copy of the app."),
        h("p", null, "Try reloading."))
    );
    return wrap;
  }

  wrap.appendChild(h("p", { class: "sec__note" }, e.intro));

  wrap.appendChild(
    jumpNav([
      { id: "sec-practice", label: "Practice" },
      { id: "sec-sitting", label: "Sitting with someone" },
      ...e.groups.map((g) => ({ id: `sec-${g.id}`, label: g.title })),
    ])
  );

  /* Practice first. It is free, instant, needs no signup and no shipping
     address - and someone who tries it and finds they did not know the answer
     has a reason to take the course underneath it. */
  wrap.appendChild(h("div", { id: "sec-practice" }, await practiceBlock()));

  wrap.appendChild(await sittingBlock());

  /* Does training gate naloxone? Answered up front, because the honest answer
     is "no, but" - and someone who believes they need a certificate to help
     may hesitate at the worst possible moment. */
  wrap.appendChild(
    callout("info", e.why.title,
      h("p", null, e.why.body),
      h("p", { class: "sec__note" }, e.why.note))
  );

  for (const g of e.groups) {
    wrap.appendChild(
      disclosure(`sec-${g.id}`, g.title, { open: g.id === "naloxone" },
        h("p", { class: "sec__note" }, g.blurb),
        frag(g.items.map((it) =>
          h("div", { class: "card" },
            h("h3", null, it.name),
            h("p", { class: "card__meta" },
              it.cost, it.time ? ` · ${it.time}` : null),
            h("p", null, it.what),
            h("div", { class: "sources" }, extLink(it.url, "Open"))))))
    );
  }

  wrap.appendChild(
    section("Teach someone else", null,
      h("p", null,
        "The person most likely to be there when you overdose is someone who uses with " +
        "you, or lives with you. Training one other person doubles the chance that " +
        "somebody in the room knows what to do — and it is the one preparation that " +
        "works even when you are the one who cannot act."))
  );

  wrap.appendChild(
    h("p", { class: "sec__note" },
      `Links checked ${e.lastVerified}. Courses and prices change; the organizations are stable.`)
  );

  void go; void route;
  return wrap;
}

/* Sitting with someone having a hard time.
 *
 * Lives on Learn rather than Emergency for the same reason the naloxone
 * sourcing does: it is a skill you want BEFORE the night you need it, and
 * Emergency must stay only what you read while a body is failing.
 *
 * The boundary between the two is the most dangerous thing on this page and
 * so it renders FIRST, as a stop callout, before a single word of technique.
 * Sitting calmly with somebody who actually needs an ambulance is exactly how
 * a survivable night becomes a death, and someone arriving here is by
 * definition already inclined to handle it themselves. */
async function sittingBlock() {
  const s = await data.sitting();
  if (!s) return h("span");

  const row = (x) => h("div", { class: "lovedrow" },
    h("h4", null, x.t), h("p", null, x.b));

  return h("details", { class: "disc", id: "sec-sitting" },
    h("summary", null, h("h2", null, s.headline)),
    h("div", { class: "disc__body" },
      h("p", { class: "sec__note" }, s.intro),

      /* Before anything else. */
      callout("stop", s.notThis.title,
        h("p", null, s.notThis.body),
        h("p", null, s.notThis.detail)),

      h("h3", null, s.principles.title),
      h("p", { class: "sec__note" }, s.principles.credit),
      frag(s.principles.items.map((p) =>
        h("div", { class: "card" },
          h("h4", null, p.name),
          h("p", null, p.what)))),
      h("div", { class: "sources" },
        s.principles.sources.map((x) => extLink(x.url, x.name))),

      h("h3", null, s.doing.title),
      frag(s.doing.items.map(row)),

      h("h3", null, s.dont.title),
      frag(s.dont.items.map(row)),

      h("h3", null, s.overamping.title),
      h("div", { class: "card" },
        h("p", null, s.overamping.body),
        h("p", null, h("strong", null, s.overamping.warn))),

      h("h3", null, "Lines you can hand them"),
      h("div", { class: "hotline" },
        s.lines.map((l) =>
          h("a", { href: `tel:${l.tel}` },
            h("span", null,
              h("span", { class: "lbl" }, l.name),
              h("span", { class: "sub" }, l.what)),
            h("span", { class: "num" }, l.num)))),

      h("h3", null, s.after.title),
      h("p", null, s.after.body),

      h("p", { class: "sec__note" }, `Links checked ${s.lastVerified}.`)));
}
