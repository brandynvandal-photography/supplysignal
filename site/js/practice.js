/* Practice, not a quiz.
 *
 * The brief rules out gamification, and it is right to. But the reason it is
 * right is worth being precise about, because it also says what IS allowed.
 *
 * What is banned is the engagement machinery: streaks, points, badges, scores,
 * anything that rewards coming back. In this app those are worse than useless -
 * a streak turns a person's survival into a scoreboard, and breaking one adds
 * shame to a population already carrying more than its share.
 *
 * What is NOT banned is interactivity that builds competence. Reading how to
 * respond to an overdose and being able to do it at 3am are different things,
 * and the gap between them is rehearsal. This is the one place in the app where
 * being interactive is not decoration - it is the difference between having
 * read something and knowing it.
 *
 * So the rules this module follows, all of which are easy to break by accident:
 *
 *   1. NO SCORE. Nothing is counted, nothing is totalled, nothing is stored.
 *      There is no "3 of 4 correct" anywhere and there must never be.
 *   2. NO FAIL STATE. A wrong answer is answered with the reasoning behind the
 *      right one, and the person continues. Nobody is told they failed at
 *      saving someone's life.
 *   3. NO TIMER. Panic is the thing this is meant to inoculate against.
 *   4. WRONG ANSWERS ARE TREATED AS REASONABLE, because they usually are -
 *      "shake them first" was the correct answer until 2025 and is still what
 *      most people have been taught. Each one gets a specific reply explaining
 *      why the guidance moved, not a buzzer.
 *   5. NOTHING PERSISTS. No progress, no history, no localStorage. Someone
 *      whose phone is searched must not have a record of having practised
 *      overdose response.
 */

import { h, frag, clear, callout, section } from "./ui.js";
import * as data from "./data.js";

/* ------------------------------------------------------------ strip reader */

/** A test strip drawn in the DOM. No image file: it has to recolour with the
 *  theme, scale with text size, and be describable to a screen reader. */
function stripArt(lines, alt) {
  const bands = [];
  // The control line sits at the top, the test line below it. Two lines drawn
  // means both present; one means control only, which is the positive case.
  if (lines >= 1) bands.push(h("span", { class: "strip__line strip__line--control" }));
  if (lines >= 2) bands.push(h("span", { class: "strip__line strip__line--test" }));

  return h("div", { class: "strip", role: "img", "aria-label": alt },
    h("div", { class: "strip__window" }, bands),
    h("div", { class: "strip__handle", "aria-hidden": "true" }));
}

function stripExercise(cfg) {
  const wrap = h("div");
  const feedback = h("div", { class: "practice__feedback", role: "status", "aria-live": "polite" });

  /* One card at a time, in a fixed order rather than random: the one-line
     positive is the misread that matters, so it goes first and is never
     skipped by chance. */
  let i = 0;

  const paint = () => {
    clear(wrap);
    const card = cfg.cards[i];

    wrap.appendChild(stripArt(card.lines, card.alt));
    wrap.appendChild(h("p", { class: "practice__ask" }, cfg.prompt));

    const answered = h("div", { class: "chips practice__options" },
      cfg.options.map((o) =>
        h("button", {
          type: "button", class: "btn btn--ghost",
          onClick: () => answer(card, o),
        }, o.label)));

    wrap.appendChild(answered);
    wrap.appendChild(feedback);
    clear(feedback);
  };

  const answer = (card, choice) => {
    const right = choice.id === card.answer;
    clear(feedback);

    /* The affirmation is added here, not stored in the data - a fact that
       reads "Yes. One line is POSITIVE" is wrong the moment it follows "Not
       quite". Same sentence, different frame, depending on what happened. */
    feedback.appendChild(
      callout(right ? "info" : "warn",
        right ? `Yes. ${card.right}` : "Not quite — and this is the one worth getting wrong here.",
        right ? null : h("p", null, card.right),
        h("p", null, card.explain))
    );

    const more = i + 1 < cfg.cards.length;
    feedback.appendChild(
      h("div", { class: "chips" },
        h("button", {
          type: "button", class: "btn",
          onClick: () => { i = more ? i + 1 : 0; paint(); },
        }, more ? "Next strip" : "Start over"))
    );
    // Move focus to the explanation so a keyboard or screen reader user is not
    // left on a button whose meaning just changed underneath them.
    feedback.querySelector("button")?.focus();
  };

  paint();
  return wrap;
}

/* -------------------------------------------------------- overdose walkthrough */

function overdoseExercise(cfg) {
  const wrap = h("div");
  const feedback = h("div", { class: "practice__feedback", role: "status", "aria-live": "polite" });
  let i = 0;

  const paint = () => {
    clear(wrap);

    if (i >= cfg.steps.length) {
      wrap.appendChild(
        callout("info", cfg.close.title, h("p", null, cfg.close.body))
      );
      wrap.appendChild(
        h("div", { class: "chips" },
          h("button", {
            type: "button", class: "btn btn--ghost",
            onClick: () => { i = 0; paint(); },
          }, "Go through it again"))
      );
      return;
    }

    const step = cfg.steps[i];

    /* Position without a score: "2 of 4" tells someone where they are in a
       sequence. It is not a count of anything they got right. */
    wrap.appendChild(
      h("p", { class: "practice__pos" }, `Situation ${i + 1} of ${cfg.steps.length}`));
    wrap.appendChild(h("div", { class: "card practice__scene" }, h("p", null, step.scene)));
    wrap.appendChild(h("p", { class: "practice__ask" }, step.ask));

    wrap.appendChild(
      h("div", { class: "practice__options" },
        step.options.map((o) =>
          h("button", {
            type: "button", class: "nbr practice__opt",
            onClick: () => answer(step, o),
          }, h("span", { class: "nbr__text" }, o.label))))
    );

    wrap.appendChild(feedback);
    clear(feedback);
  };

  const answer = (step, choice) => {
    clear(feedback);
    const right = !!choice.ok;

    feedback.appendChild(
      callout(right ? "info" : "warn",
        right ? step.right : (step.onWrong?.[choice.id] ? "Worth thinking about" : "Not this one"),
        /* A wrong answer gets the reason it is reasonable FIRST, then the
           correct action. Being told why your instinct made sense is what
           makes the correction stick. */
        right ? null : h("p", null, step.onWrong?.[choice.id] || ""),
        h("p", null, h("strong", null, right ? "" : step.right + " ")),
        h("p", null, step.explain))
    );

    feedback.appendChild(
      h("div", { class: "chips" },
        h("button", {
          type: "button", class: "btn",
          onClick: () => { i += 1; paint(); },
        }, i + 1 < cfg.steps.length ? "Next situation" : "Finish"))
    );
    feedback.querySelector("button")?.focus();
  };

  paint();
  return wrap;
}

/* ------------------------------------------------------------------ mount */

export async function practiceBlock() {
  const p = await data.practice();
  if (!p) return h("span");

  return frag(
    section("Practice", null,
      h("p", { class: "sec__note" }, p.intro),

      h("details", { class: "acc" },
        h("summary", null, h("span", null, p.strip.title)),
        h("div", { class: "acc__body" },
          h("p", { class: "sec__note" }, p.strip.why),
          stripExercise(p.strip))),

      h("details", { class: "acc" },
        h("summary", null, h("span", null, p.overdose.title)),
        h("div", { class: "acc__body" },
          h("p", { class: "sec__note" }, p.overdose.why),
          overdoseExercise(p.overdose)))),

    h("p", { class: "sec__note" },
      "Nothing here is scored, timed, or saved. Close the tab and it never happened.")
  );
}
