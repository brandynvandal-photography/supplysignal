/* Crisis resources, overdose response, and a plain account of what this site
 * does and does not know about the person reading it. */

import {
  h, callout, extLink, disclosure, jumpNav, englishOnlyNotice,
} from "../ui.js";
import { t } from "../i18n.js";

/* THE STEPS AND THE NUMBERS COME FROM THE LOCALE FILE.
 *
 * Moved out of this file on 2026-09-09 so that they can be translated. The
 * six steps and the five numbers are the highest-stakes 250 words in the app,
 * and they were the one block of reader-facing text no translator could
 * reach - every content page is English-only by design until a person has
 * reviewed a translation, but the Emergency tab is where a partial
 * translation earns the most. The English lives in data/i18n/en-US.json
 * under "sos" and is still the source of truth: a locale that leaves a key
 * out falls back to it (i18n.js), so shipping the steps in one language
 * ahead of the rest is safe. docs/TRANSLATION.md is the translator's brief.
 *
 * Functions, not constants: t() reads strings loaded at boot, after this
 * module has been evaluated. Exported because the county page prints both on
 * its hand-out sheet (views/alerts.js imports this module lazily, on the
 * print button, so the home route never pays for the Emergency view).
 *
 * THE REASONING BEHIND THE STEPS stays here, because it is the record of why
 * the protocol reads the way it does and a locale file is no place for it:
 *
 *  - Two fields, and the split is the whole point. `body` is what to DO, in
 *    as few words as it can be said. `note` is the fact that stops a mistake
 *    - why to give naloxone when you are not sure, why two minutes of nothing
 *    is not failure, why you do not leave afterwards. Someone reading this is
 *    doing it one-handed next to a person who is not breathing. Prose makes
 *    them hunt for the verb.
 *  - PLAIN WORDS, SHORT SENTENCES, ONE IDEA EACH. Fear takes reading age down
 *    several grades on its own, so the version that has to work is the one a
 *    frightened fourteen-year-old can follow: no sentence much over twelve
 *    words, one instruction per sentence, the common word over the
 *    correct-but-longer one ("wears off", not "duration of action"), no
 *    em-dash asides, the verb first. A translation has to keep that register,
 *    not only the facts.
 *  - Step 1: breathing is checked FIRST, before responsiveness. This is the
 *    2025 protocol change from Philadelphia DPH / PA DOH (HAN #794, verbatim:
 *    "the first step should be to check for breathing"), driven by
 *    medetomidine: alpha-2 sedatives now common in the supply can leave
 *    someone impossible to wake while their breathing is fine - and someone
 *    breathing badly needs naloxone no matter what they respond to.
 *    Responsiveness alone now misleads in both directions, so the chest is
 *    the signal, here and in step 5. The old order (wake-check first)
 *    survived here for months after the adulterant pages taught the new one
 *    - the contradiction was found by review, not by luck.
 *  - Step 2: PA's medetomidine protocol orders naloxone before the call;
 *    CDC's classic steps call first. Both are one sentence rather than a
 *    silently picked winner: with naloxone already in hand, seconds of spray
 *    beat seconds of hold music.
 *  - Step 4: the nose pinch is not optional - without it the breath escapes
 *    and does nothing. It was missing here while the xylazine page taught it
 *    correctly from CDC guidance, so the main steps were the incomplete
 *    version.
 *  - The steps carried hand-drawn figures until 2026-08-10, when they were
 *    removed at the user's request. The originals are in
 *    .attic/od-illustrations rather than deleted, along with a note on what
 *    the removal cost: the brief argued a picture of the recovery position is
 *    understood faster than a paragraph by someone impaired, frightened, or
 *    not reading English easily. The wording carries that load by itself,
 *    which is why it is written as an instruction first and a reason second.
 */
const LINE_KEYS = [
  { key: "emergency",     name: "Emergency",                     num: "911",            tel: "911" },
  { key: "neverUseAlone", name: "Never Use Alone",               num: "1-800-484-3731", tel: "18004843731" },
  { key: "poison",        name: "Poison Control",                num: "1-800-222-1222", tel: "18002221222" },
  { key: "samhsa",        name: "SAMHSA National Helpline",      num: "1-800-662-4357", tel: "18006624357" },
  { key: "lifeline",      name: "988 Suicide & Crisis Lifeline", num: "988",            tel: "988" },
];
export const lines = () => LINE_KEYS.map((l) => ({ ...l, sub: t(`sos.lines.${l.key}`) }));
export const steps = () => [0, 1, 2, 3, 4, 5].map((i) => ({
  title: t(`sos.steps.${i}.title`),
  body: t(`sos.steps.${i}.body`),
  note: t(`sos.steps.${i}.note`),
}));

export async function render() {
  const wrap = h("div");

  wrap.appendChild(h("h1", null, t("sos.title")));
  { const n = englishOnlyNotice(); if (n) wrap.appendChild(n); }


  wrap.appendChild(
    /* Instruction only. This used to spend four of its six lines on Good
       Samaritan caveats and close by telling the reader to go read a collapsed
       law section "before you decide what that means for you" - i.e. to pause
       the 911 decision. The nuance is real and still lives in "911 and the
       law", one tap away in the jump nav. It does not belong inside the
       instruction. */
    /* The same opener every other tab uses, in the urgent color. It was a
       filled "stop" callout, which is right for a warning interrupting a page
       but wrong for the thing a page opens with - this tab IS the emergency,
       so the panel was shouting the same volume as its own contents and
       nothing stood out. The red left rule and wash keep the signal; the shape
       matches Alerts, Support, Test and About. */
    h("div", { class: "intro intro--urgent" },
      h("h2", null, t("sos.introTitle")),
      h("p", null, t("sos.introBody")),
      h("p", null, t("sos.introNote")),
      /* The most important action on the site was prose. The nearest tel: link
         sat below the fold, in a list. Two taps now: SOS, then this.
         The cost is real - a full-width red button raises the odds of an
         accidental dial. An accidental 911 call is recoverable. A missed one
         is not. */
      h("a", { class: "callbtn", href: "tel:911" }, t("sos.call911")))
  );

  /* The jump nav renders AFTER the emergency opener, not before it.
     Seven chips wrap to ~200px at 375px, which pushed the Call 911 button
     below the fold on the one screen somebody opens without reading. Every
     other page keeps h1 -> jumpNav -> blurb; this page is the exception
     because its first block is an action, not an introduction. */
  wrap.appendChild(
    jumpNav([
      /* Response before hotlines, matching the page. views.test.mjs fails a
         chip that appears out of DOM order, and a chip that jumps backwards
         reads as broken even when it works. */
      { id: "sec-response", label: "Overdose response" },
      { id: "sec-lines", label: "Hotlines" },
      { id: "sec-collapse", label: "Collapsed, cause unknown" },
      { id: "sec-festival", label: "At a festival" },
      { id: "sec-club", label: "At a club or bar" },
      { id: "sec-ems", label: "When help arrives" },
      { id: "sec-law", label: "911 and the law" },
      { id: "sec-police", label: "If police come" },
    ])
  );


  /* The red tab covered exactly one emergency. There was no route from here to
     the heat page or the stimulant page, and heat's own copy carries a "call
     911 when they stop making sense" callout this tab never led to. Somebody
     whose friend is burning up and confused taps SOS, reads six naloxone
     steps, and leaves. Below the numbers, above the overdose steps - the
     numbers stay first. */
  /* The two not-opioid pointers as ONE two-row list rather than two full-width
     bigptr panels. They stay above the overdose steps - somebody whose friend
     is overheating or in a stimulant crisis needs to be sent to the right page
     before the naloxone steps, not after - but two stacked panels pushed those
     steps down a screen. A dense .nbr list keeps both pointers and their lines
     above the fold. data-reveal lands each on the relevant section of its
     page, the same as the panels did. */
  wrap.appendChild(
    h("div", { class: "list" },
      h("a", { class: "nbr", href: "#/heat", "data-reveal": "sec-spot" },
        h("span", { class: "nbr__text" },
          h("span", { class: "nbr__name" }, "If they are burning up, or confused")),
        h("span", { class: "nbr__right" }, h("span", { "aria-hidden": "true" }, "›"))),
      h("a", { class: "nbr", href: "#/stimulants", "data-reveal": "sec-helping" },
        h("span", { class: "nbr__text" },
          h("span", { class: "nbr__name" }, "If they are panicking, or seeing things")),
        h("span", { class: "nbr__right" }, h("span", { "aria-hidden": "true" }, "›")))));

  /* ---- opioid overdose response, FIRST ----
   *
   * Measured on 2026-09-05 at 375x812: the Call 911 button sat correctly at
   * 380px and step 1 - "look at their chest" - sat at 1,665px. Two full
   * screens. Between them were five hotline rows and two links to OTHER PAGES,
   * so a person holding somebody who is not breathing scrolled past a phone
   * directory and an article about heat illness to reach the breathing check.
   * An earlier comment here records the steps being moved above the
   * differential for this exact reason; that move happened and they were still
   * two screens down, because the cost was never the differential.
   *
   * The two arguments this order used to encode are both still honoured:
   *   - the not-opioid pointers stay ABOVE the steps, because somebody whose
   *     friend is overheating must be sent elsewhere before reading six
   *     naloxone steps. They are two compact rows now instead of two
   *     three-line cards, which is what makes that affordable.
   *   - the hotlines stay OPEN and expand nothing. They moved below the steps,
   *     not behind a tap. 911 is already a button at the top of the page, and
   *     the jump chip reaches the rest in one press. The numbers below are for
   *     situations that are not "they are not breathing right now".
   */
  wrap.appendChild(
    disclosure("sec-response", t("sos.stepsTitle"),
      { open: true, tone: "urgent" },
      h("ol", { class: "steps" }, steps().map(step)),
      callout("warn", t("sos.tranqTitle"),
        h("p", null, t("sos.tranqBody")),
        /* Regional prevalence used to sit here, inside the always-open overdose
           response section. Nobody doing rescue breathing needs epidemiology; it
           diluted the one instruction that matters. It lives on the xylazine
           page, properly sourced. */))
  );

  /* ---- hotlines. Open: nobody should have to expand anything to find a
         number during an emergency. ---- */
  wrap.appendChild(
    disclosure("sec-lines", t("sos.linesTitle"), { open: true, tone: "urgent" },
      h("div", { class: "hotline" },
        lines().map((l) =>
          h("a", { href: `tel:${l.tel}` },
            h("span", null,
              h("span", { class: "lbl" }, l.name),
              h("span", { class: "sub" }, l.sub)),
            h("span", { class: "num" }, l.num)))))
  );

  /* ---- collapsed, cause unknown ----

     This page already checks breathing before responsiveness, for
     medetomidine: alpha-2 sedatives can leave somebody impossible to wake with
     their breathing intact. The differential below arrives at the same rule
     from the other direction. Ketamine is the case that breaks the standard
     "really high versus overdosing" model, because a deep k-hole is
     unresponsive BY DEFINITION - the emergency-medicine definition of the
     dissociative state is a person whose eyes may be open and who does not
     respond, with breathing and airway reflexes preserved. So responsiveness
     cannot separate "will come out of this" from "is dying". Breathing can.
     That is the whole section; everything else is downstream of it. */
  /* SHUT, WITH THE RULE IN THE SUMMARY. Measured 2026-09-09 at 375x812: open,
     this section ran from 3,013px to 6,186px - 558 words, three screens -
     between the naloxone steps and "When help arrives", so a reader scrolling
     for what to tell the paramedics crossed the whole differential to get
     there. It stays urgent-toned and it stays where it is. What changes is
     that the one instruction it exists to teach is the heading itself now, so
     a reader who never opens it still meets the rule, and a reader who does
     gets the reasoning. Learn's "Start here" step 2 lands here through
     data-reveal, and reveal() in app.js opens a shut details on arrival. */
  wrap.appendChild(
    disclosure("sec-collapse", "Collapsed, cause unknown? Watch their breathing, not whether they answer", { open: false, tone: "urgent" },
        h("p", { class: "leadin" },
          "You will often not know what happened, and you do not need to. "
          + "One check decides what you do."),

        h("div", { class: "card" },
          h("h3", null, "Why breathing is the check"),
          h("p", null,
            "While a person's response (or lack of) is the first test, a "
            + "person in a deep k-hole may not react to anything, though their "
            + "eyes may be open and their breathing completely normal. This is "
            + "not an emergency and the drug working as intended. Sedatives now "
            + "mixed into the opioid supply do the same thing. The person's "
            + "breathing is the key indicator in these situations.")),

        h("div", { class: "statgrid" },
          h("div", { class: "card statcard" },
            h("p", { class: "stat__n" }, "Not breathing, or gasping"),
            h("p", null,
              "Slow deep gasps that sound like snoring are not breathing — they "
              + "happen in about half of cardiac arrests and are the most "
              + "common reason one gets missed. In as many as 4 in 10 arrests "
              + "the caller was never talked through CPR because they said the "
              + "person was breathing. Start CPR. Do not put them on their "
              + "side.")),
          h("div", { class: "card statcard" },
            h("p", { class: "stat__n" }, "Slow, shallow, or going blue"),
            h("p", null,
              "Four to six breaths a minute is the classic opioid picture; "
              + "under about seven is the line harm reduction uses. Blue or "
              + "gray lips and fingertips, ashen or gray skin on darker "
              + "skin tones. On their side, naloxone, ambulance.")),
          h("div", { class: "card statcard" },
            h("p", { class: "stat__n" }, "Breathing normally"),
            h("p", null,
              "A k-hole, fainting, minutes after a seizure, GHB, heat, too "
              + "much water, a knock on the head, or low blood-sugar fall into "
              + "this category. Keep the person on their side, stay, and "
              + "monitor their breathing, as this could change."))),

        h("div", { class: "card" },
          h("h3", null, "What you genuinely cannot tell apart"),
          h("p", null,
            "These pairs are not separable without a hospital, and the safe "
            + "move is the same either way."),
          h("ul", null,
            h("li", null,
              h("strong", null, "GHB and an opioid overdose. "),
              "Identical in the first ten minutes — deep unresponsiveness, "
              + "snoring, slow breathing, vomiting. Treat it as an opioid."),
            h("li", null,
              h("strong", null, "A k-hole and a mixed-depressant overdose. "),
              "Both unresponsive, both possibly with the eyes open, and "
              + "ketamine is almost always taken with something else. "
              + "Breathing decides."),
            h("li", null,
              h("strong", null, "Heat stroke and a stimulant running too hot. "),
              "Often the same person. Do not try — hot and confused means cool "
              + "them, either way."),
            h("li", null,
              h("strong", null, "Heat stroke and too much water. "),
              "Both are confusion and collapse in a hot room. This is the one "
              + "pair where guessing wrong is dangerous, so do not give plain "
              + "water to either."),
            h("li", null,
              h("strong", null, "The minutes after a seizure and being high. "),
              "Afterwards people spit, drool, wipe their nose and talk "
              + "nonsense for five to thirty minutes. It looks exactly like "
              + "intoxication."),
            h("li", null,
              h("strong", null, "A hard fall and the drugs. "),
              "Of people who were intoxicated and seemed only mildly hurt, "
              + "about 8 in 100 had a bleed on the brain, and the standard "
              + "screening rules missed a fifth to a third of them. If they "
              + "hit their head, that is an ambulance regardless."))),

        callout("info", "Regardless of what caused it",
          h("ul", null,
            h("li", null, "On their side, unless they are gasping or hit their head."),
            h("li", null, "Never face-up if they might vomit — which is always."),
            h("li", null,
              "Nothing by mouth for anybody who is not fully awake. No water, "
              + "no food, no sugar, no more of anything."),
            h("li", null,
              "Do not hold them down, sit on them, or leave anybody face-down. "
              + "Fighting a restraint makes overheating worse."),
            h("li", null, "Do not leave, and do not let them sleep it off."),
            h("li", null, "Cool anybody who is hot and not making sense."))),

        h("div", { class: "card" },
          h("h3", null, "Naloxone when you are not sure"),
          h("p", null,
            "Give it whenever the breathing is bad and you cannot rule opioids "
            + "out — including when you think it is GHB, ketamine or alcohol. "
            + "It does nothing at all to somebody with no opioids in them; the "
            + "label on the box says so."),
          h("p", { class: "sec__note" },
            "Breathing is the target, not waking up. Somebody who breathes but "
            + "stays under is naloxone working — do not keep dosing to chase "
            + "consciousness. And waking up is the middle of this, not the "
            + "end: naloxone wears off in thirty to forty-five minutes and "
            + "most opioids last longer."))));

  /* ---- at a festival or a big event ----
     Placed directly under the 911 instruction because it CHANGES that
     instruction, and below it because it does not replace it.

     SOURCED 2026-09-09. This was the one section on the page with no source
     row at all, and reading the pages it described changed the copy:
       - "aid stations sited so nobody is more than a five-minute walk away"
         is in no guidance that could be found. HSG195 puts a medical point
         near the stage and the rest on the perimeter and names no minutes.
         Cut.
       - "Lollapalooza tells attendees to do both" - its safety page says
         contact any uniformed staff member OR call 911. Doing both is our
         advice, and it now reads as ours.
       - "on the same page Insomniac says police work inside its events" -
         the amnesty line and the police line are on DIFFERENT Insomniac
         pages (a festival's Health & Wellness guide; the General Festival
         Guidelines). Okeechobee is the page that says both in one breath.
       - "Most large US festivals publish nothing like it" was a
         generalization nobody had counted. Cut.
       - "Naming a drug on that call is what brings police" is not what the
         dispatch studies show: police are commonly sent to an overdose call
         whatever is said. Replaced with the two studies that measured it.
       - The Ultra note said the partner was charged "using evidence from a
         separate investigation". What was reported: four people were
         charged a year on, the partner among them for possession, on text
         messages about buying the pill. Rewritten to that; nobody is named.
     Every card carries its sources in the same .sources row the police
     section below uses. Never re-add a claim here without one.

     What is deliberately NOT here: the "arms crossed in an X above your head"
     signal and the phone-torch signal. Both circulate widely and neither is
     taught by any festival, promoter, event-medical provider or crowd-safety
     standard that could be found - the only source making the X claim is a
     security shop's blog with no citation. Worse, the X already means
     something else in exactly this setting: "X-ing up" is straight-edge and
     underage drink marking, and in lifeguarding the same gesture means a
     swimmer is missing and presumed submerged. A signal only works if the
     person receiving it was trained on it, and nobody trains festival security
     on this one. Somebody standing in a crowd making an X at nobody, while
     their friend deteriorates, is the failure mode. Do not add it back without
     a real source. */
  wrap.appendChild(
    disclosure("sec-festival", "At a festival or a big event", null,
        h("div", { class: "card" },
          h("h3", null, "The nearest radio beats the nearest phone"),
          h("p", null,
            "On-site medics are already inside the perimeter. Look for a "
            + "medical tent, a medic, or any staff member with a radio — "
            + "vendors and ticket staff included. Lollapalooza's own advice is "
            + "the same: look for any festival staff member or anyone with a "
            + "radio."),
          h("p", { class: "sec__note" },
            "Send a specific person, and tell them to come back. The more "
            + "people there are, the less likely any one of them acts — "
            + "\"somebody call for help\" in a crowd is how nobody does."),
          h("div", { class: "sources" },
            extLink("https://www.lollapalooza.com/safety", "Lollapalooza — Safety"),
            extLink("https://www.redcross.org.uk/stories/health-and-social-care/first-aid/what-is-the-bystander-effect",
              "British Red Cross — What is the bystander effect?"))),
        h("div", { class: "card" },
          h("h3", null, "Near the front, the barrier crew is already looking"),
          h("p", null,
            "The staff in the pit between the barrier and the stage are there "
            + "to lift out people in distress. The UK's event safety guide says "
            + "it in as many words: the pit exists to help stewards, first "
            + "aiders and paramedics, and a raised platform inside the barrier "
            + "lets stewards oversee the audience and pick out anyone in "
            + "trouble. If you are near the front, they are the closest help "
            + "there is, and they are already facing you."),
          h("div", { class: "sources" },
            extLink("https://livemusicexchange.org/wp-content/uploads/The-Event-Safety-Guide-HSE-PURPLE-GUIDE.pdf",
              "HSE — The Event Safety Guide (HSG195), paragraphs 321 and 410"))),
        h("div", { class: "card" },
          h("h3", null, "Get staff moving and call 911"),
          h("p", null,
            "Do both. Lollapalooza's safety page says to contact any uniformed "
            + "staff member or call 911 — there is no reason to pick one. At a "
            + "small event there may be no on-site medical at all, and then 911 "
            + "is the whole answer."),
          h("p", { class: "sec__note" },
            "Note where you are before you call — the nearest numbered pole, "
            + "stage, bar or vendor. It is the difference between help arriving "
            + "and help searching."),
          h("div", { class: "sources" },
            extLink("https://www.lollapalooza.com/safety", "Lollapalooza — Safety"))),
        h("div", { class: "card" },
          h("h3", null, "Tell the event's medics what they took"),
          h("p", null,
            "They can treat faster when they know. Lollapalooza asks you to be "
            + "honest with emergency personnel: “they are here to help you; NOT "
            + "get you in trouble.” Insomniac's festivals and Okeechobee say it "
            + "too — you will not get in trouble for seeking medical help, and "
            + "their on-site care is free of charge, no questions asked. An "
            + "ambulance usually is not free: about half of emergency ground "
            + "ambulance rides for privately insured people end in an "
            + "out-of-network charge."),
          h("p", { class: "sec__note" },
            "Read that as narrowly as it is written. It is the medical team's "
            + "promise, not the law's. Okeechobee's same page says police work "
            + "inside and outside the event and all narcotics laws are strictly "
            + "enforced; Insomniac's guidelines say the same. Coachella's rules "
            + "say possession of illegal drugs can get you removed and your "
            + "wristband revoked, and that offenders may be arrested. Burning "
            + "Man's survival guide says illegal action can lead to citation or "
            + "arrest."),
          h("div", { class: "sources" },
            extLink("https://www.lollapalooza.com/safety", "Lollapalooza — Safety"),
            extLink("https://www.nocturnalwonderland.com/guide/health/",
              "Insomniac (Nocturnal Wonderland) — Health & Wellness"),
            extLink("https://www.okeechobeefest.com/guide/during-the-event",
              "Okeechobee — During the event"),
            extLink("https://www.insomniac.com/general-festival-guidelines/",
              "Insomniac — General Festival Guidelines"),
            extLink("https://coachella.com/festival-info", "Coachella — Festival info"),
            extLink("https://survival.burningman.org/law-enforcement/",
              "Burning Man Survival Guide — Law enforcement"),
            extLink("https://www.kff.org/health-costs/analysis-half-of-emergency-ambulance-rides-lead-to-out-of-network-bills-for-privately-insured-patients/",
              "KFF — Half of emergency ambulance rides lead to out-of-network bills (2021)"))),
        h("div", { class: "card" },
          h("h3", null, "What the promise does and does not cover"),
          h("p", null,
            "Your state's Good Samaritan law can protect you from charges for "
            + "what is found because you asked for help. It does not stop the "
            + "festival throwing you out. The law binds the police; your ticket "
            + "is a permission the event can take back at any time. What the law "
            + "covers where you live is under “Calling 911 and the law”, below."),
          h("p", { class: "sec__note" },
            "It also only covers that night. At Ultra in 2025 a woman's partner "
            + "carried her to a medical tent, and she did not survive. A year "
            + "later four people were charged over the pill — the partner among "
            + "them, for possession — on the strength of text messages about "
            + "buying it. Go and get help anyway; just know that the protection "
            + "is narrower than it sounds."),
          h("div", { class: "sources" },
            extLink("https://www.cbsnews.com/miami/news/arrests-2025-overdose-death-ultra-music-festival/",
              "CBS Miami — Four arrested after the 2025 Ultra overdose (March 2026)"),
            extLink("https://www.local10.com/news/local/2026/03/18/4-face-charges-after-georgia-womans-fatal-overdose-at-ultra-music-festival-cops-say/",
              "Local 10 — Four face charges after the 2025 Ultra overdose (March 2026)"))),
        h("div", { class: "card" },
          h("h3", null, "The disclosure nobody warns you about"),
          h("p", null,
            "If you are on somebody else's insurance — a parent's job-based plan "
            + "can cover you until you turn 26 — an ambulance ride and an "
            + "emergency room visit generate an explanation of benefits, and "
            + "insurers send it to the policyholder even when the care was a "
            + "dependent's. It is a common way a night like this gets disclosed, "
            + "and it has nothing to do with police."),
          h("div", { class: "sources" },
            extLink("https://www.healthcare.gov/young-adults/children-under-26/",
              "HealthCare.gov — Coverage for children under 26"),
            extLink("https://www.guttmacher.org/gpr/2013/12/new-frontier-era-health-reform-protecting-confidentiality-individuals-insured-dependents",
              "Guttmacher Institute — Protecting confidentiality for individuals insured as dependents (2013)"))),
        h("div", { class: "card" },
          h("h3", null, "A 911 call is a different conversation"),
          h("p", null,
            "That amnesty is the event's, not the state's. On the phone, "
            + "describe what you can see — not breathing, not waking up — give "
            + "the location, and ask for medics. In many places police are sent "
            + "to an overdose call whatever you say: in one Arizona city they "
            + "were the first responder dispatched on 77% of overdose calls. "
            + "Arrests at the scene are rare — 3 of 211 police-attended "
            + "overdoses in one Rhode Island city — but police are usually "
            + "there, so give the call what the medics need and nothing else."),
          h("p", { class: "sec__note" },
            "Medics carry naloxone whether or not you say the word. Intranasal "
            + "naloxone for a suspected opioid overdose is in the national EMS "
            + "scope of practice at every level, first responders included. If "
            + "you are worried they will not have it, you can ask them to bring "
            + "it."),
          h("div", { class: "sources" },
            extLink("https://pmc.ncbi.nlm.nih.gov/articles/PMC12208077/",
              "Glenn et al., West J Emerg Med 2025 — 911 calls for opioid overdose in Nogales, Arizona"),
            extLink("https://pmc.ncbi.nlm.nih.gov/articles/PMC9578237/",
              "Macmadu et al., Harm Reduction Journal 2022 — police responses to overdoses in Rhode Island"),
            extLink("https://www.nremt.org/getmedia/d82edd97-1425-423f-954c-fdd63cf1daa3/National_EMS_Scope_of_Practice_Model_2019_Change_Notices_1_and-_2_August_2021",
              "National EMS Scope of Practice Model 2019 (2021 edition), p. 29"))))
  );

  /* ---- a nightclub or a bar ----
     Not the festival section with the word changed. A festival has medics
     inside the perimeter and a barrier crew whose job is spotting people; a
     club has security, and security is not medical. The failure modes are
     different enough to need their own list, and the one that kills people is
     specific to the room: an overdose in a locked stall, found late. */
  wrap.appendChild(
    disclosure("sec-club", "At a club or a bar", null,
        h("div", { class: "card" },
          h("h3", null, "Security is not a medic"),
          h("p", null,
            "There is no medical tent. Door and floor staff are trained to "
            + "remove a problem from the room, and somebody unconscious can be "
            + "walked outside and left on the pavement while everyone assumes "
            + "they are drunk. If staff are moving them, go with them and stay "
            + "with them — the street outside is where being alone starts."),
          h("p", { class: "sec__note" },
            "Call 911 yourself. Do not assume the venue has, and do not wait to "
            + "find out — a license is at stake for them and nothing is at "
            + "stake for you.")),
        h("div", { class: "card" },
          h("h3", null, "The bathroom is where this happens"),
          h("p", null,
            "A locked stall, alone, is the most common way an overdose in a "
            + "venue is found too late. If somebody went in and has been quiet "
            + "a while, knock, then get staff to open it. Being wrong costs an "
            + "awkward minute. Being late can cost far more."),
          h("p", { class: "sec__note" },
            "If you use in a venue bathroom, leave the latch off and tell "
            + "somebody to check on you at a specific time.")),
        h("div", { class: "card" },
          h("h3", null, "You cannot assess anyone on the floor"),
          h("p", null,
            "It is too loud to hear breathing and too dark to see color "
            + "changing. Get to a lit, quieter place if you can do it quickly. "
            + "But if they are not breathing, that is where you are — start "
            + "rescue breaths and give naloxone there. Moving somebody first "
            + "costs the minutes that matter.")),
        h("div", { class: "card" },
          h("h3", null, "Naloxone at the door"),
          h("p", null,
            "Search staff often do not recognize it and sometimes take it. "
            + "Keeping it in the pharmacy packaging helps, and so does saying "
            + "what it is before they find it. If it is confiscated, ask "
            + "whether the venue keeps its own — many now do, and the person "
            + "on the door may not be the person who knows."),
          /* One sourced counter-example, for the argument at the door. */
          h("p", { class: "sec__note" },
            "For comparison, Insomniac's festival guidelines list sealed "
            + "intranasal naloxone as an acceptable item to bring in."),
          h("div", { class: "sources" },
            extLink("https://www.insomniac.com/general-festival-guidelines/",
              "Insomniac — General Festival Guidelines"))),
        /* The pointer sits here rather than at the foot of the page. It used to
           be the second-to-last thing on Help, where somebody reading about
           getting naloxone past a door had already stopped scrolling. This is
           the paragraph that raises the question, so this is where the answer
           to "I do not have any" belongs.

           Still below the overdose steps, which was the reason it was ever put
           at the foot: nobody reading this page mid-crisis should meet a link
           about next week before they meet rescue breaths. */
        h("a", { class: "bigptr", href: "#/learn", "data-reveal": "sec-naloxone" },
          h("span", { class: "bigptr__hd" }, "No naloxone yet?"),
          h("span", { class: "bigptr__sub" },
            "Where to get it free, and how to use it — worth doing before the "
            + "night you need it."))));


  /* ---- what to tell EMS once they arrive ----
     Complements the Good Samaritan framing rather than contradicting it: "you
     do not have to say what they took" is about the 911 CALL, where the
     dispatcher needs breathing status, not a confession. Once medics are in
     the room, what they know changes what they do - and telling a paramedic
     is not the same disclosure as telling a dispatcher on a recorded line. */
  wrap.appendChild(
    disclosure("sec-ems", "When help arrives", null,
      h("div", { class: "card" },
        h("p", null,
          "On the call, what matters is that someone is not breathing and where you " +
          "are. Once paramedics arrive, anything you can tell them helps them treat:"),
        h("ul", null,
          li("What was taken, if you know.", "Even a guess — “sold as oxy”, “tranq dope” — changes what they watch for."),
          li("How much, and when.", "Roughly is fine."),
          li("What else was taken.", "Alcohol, benzos, and anything prescribed."),
          li("Medical conditions, if you know them.", "Heart problems, diabetes, seizures, pregnancy."),
          li("What you already did.", "How many naloxone doses, when, and whether breathing changed.")),
        h("p", { class: "sec__note" },
          "Paramedics are not police. Telling them is what gets the right treatment.")))
  );

  /* ---- Good Samaritan ----
     Over-reassurance here is its own harm: someone under supervision who is
     told they are "protected", and is then violated for it, is worse off than
     someone who knew the limits going in. State the gaps plainly, then say
     call anyway. */
  wrap.appendChild(
    disclosure("sec-law", "Calling 911 and the law", null,
      h("div", { class: "card" },
        h("p", null,
          "All 50 states and DC have an overdose Good Samaritan law — Wyoming was " +
          "the last, in March 2025. They generally protect someone who calls in good " +
          "faith, stays, and cooperates from charges for simple drug possession and " +
          "paraphernalia."),
        h("h3", null, "What they usually do not cover"),
        h("ul", null,
          li("Selling, sharing, or “possession with intent”.", "In many states, splitting drugs with someone can be charged as distribution."),
          li("Existing warrants.", "You can still be arrested on a warrant that already existed."),
          li("Probation and parole violations.", "Only some states protect these. If you are under supervision, check your own state’s law."),
          li("Anything else found at the scene.", "Weapons, other offenses, or a drug-induced homicide charge in states that have one."),
          li("In some states, immunity is not what you get.", "Some laws only give you a defense to raise in court after being charged.")),
        callout("info", "None of this is a reason not to call",
          h("p", null,
            "It is a reason to know how it works where you live. Far more people are lost " +
            "to accidents where nobody called than are ever prosecuted for calling.")),
        h("p", { class: "sec__note" }, "This is information, not legal advice.")))
  );

  /* ---- police at the scene ----
     The Good Samaritan section answers "will I be charged". This answers the
     thing that actually happens in the room: officers arrive, and someone who
     is frightened has to decide what to say while a person is on the floor.
     Two rules govern how this is written.
     First, nothing here may compete with the emergency. Every item is
     something you can do WHILE care continues; none of it involves refusing
     entry, delaying medics, or moving anything.
     Second, no tactics, no scripts for getting rid of evidence, no advice
     that could be read as obstruction - that is a separate crime, it can be
     charged even where the Good Samaritan law would have protected you, and
     it is the fastest way to turn a survivable night into a case. */
  wrap.appendChild(
    disclosure("sec-police", "If police come while you are helping", null,
      callout("warn", "Keep helping. None of this is worth stopping for",
        h("p", null,
          "Carry on with what you are doing — rescue breaths, naloxone, staying with them.")),

      h("div", { class: "card" },
        h("h3", null, "What you can do"),
        h("ul", null,
          li("You do not have to answer questions.",
            "You can stay silent about what was taken, who brought it, or where it came from — that right holds even after an arrest. Saying nothing cannot be used against you the way an answer can."),
          li("Tell the medics, not the police.",
            "What was taken, how much, and when is medical information that changes treatment. That is a different conversation from an officer’s questions."),
          li("You can decline a search out loud.",
            "Say plainly: “I do not consent to a search.” They may search anyway — never physically resist — but saying it preserves the question for a court later. Staying silent is not the same as agreeing."),
          li("Ask whether you are free to go.",
            "If they say yes, you can leave calmly. If they say no, you are being detained; you can say you want a lawyer and stop talking."),
          li("Do not run, and do not destroy anything.",
            "Both create new charges that no Good Samaritan law covers, and running from the scene leaves the person you called for."),
          li("Write it down afterward.",
            "Badge numbers, patrol car numbers, the agency, what was said, and who else was there. Do it as soon as you are somewhere safe.")),

        h("h3", null, "If you are on probation or parole"),
        h("p", null,
          "Only some states protect supervision violations, and this is where the answers " +
          "are least uniform. Worth knowing before a night when you have to decide — " +
          "not during it."),

        callout("info", "Calling is still the right call",
          h("p", null,
            "Every minute before help arrives is a minute without oxygen, and that is " +
            "where the damage happens.")),

        h("div", { class: "sources" },
          extLink("https://www.aclu.org/know-your-rights/stopped-by-police",
            "ACLU — Know Your Rights: Stopped by Police"),
          extLink("https://harmreduction.org/issues/overdose-prevention/",
            "National Harm Reduction Coalition — Overdose prevention")),

        h("p", { class: "sec__note" },
          "This is information, not legal advice, and rights differ by state and " +
          "situation. A local legal aid office or public defender can tell you how " +
          "this works where you live.")))
  );

  /* The naloxone pointer used to be here. It is now inside "At a club or a
     bar", directly under "Naloxone at the door" - the paragraph that raises
     the question is the right place to answer it, and this far down the page
     nobody was still scrolling. Naloxone SOURCING itself still lives on Learn;
     that is still the only pointer to it. */

  /* .bigptr, the same cross-page pointer Support and Learn use. These were
     underlined text links in a note-sized box, so they sat narrower than every
     disclosure above them and read as footnotes rather than as the two doors
     they are. The arrow is supplied by the class - it was being typed into the
     string, which is why it survived the previous restyle. */
  /* This one stays at the foot. It is a morning-after thought, and it must
     never sit above the overdose steps - someone reading this page while a
     body is failing needs the steps, not a link about next week. */
  wrap.appendChild(
    h("a", { class: "bigptr", href: "#/after" },
      h("span", { class: "bigptr__hd" }, "It’s over and they’re breathing"),
      h("span", { class: "bigptr__sub" },
        "What happens next — for them, and for you, because being the person "
        + "in the room costs something too."))
  );

  const support = supportBlock();
  if (support) wrap.appendChild(support);

  return wrap;
}

/* Supporting the project.
 *
 * DELIBERATELY UNCONFIGURED. Fill in DONATE below with a fiscal sponsor and
 * this renders; leave it empty and nothing appears. It is empty rather than
 * pointed at a real charity because linking one would assert an affiliation
 * that does not exist yet.
 *
 * Why a sponsor and not a payment button on this domain:
 *
 *   1. A card statement is a permanent, discoverable record tying a real name
 *      to a drug app. That is the same threat Quick Exit exists for - the
 *      person who checks the phone also sees the statement. A neutral
 *      descriptor from a health nonprofit is a safety feature, not branding.
 *      Whatever sponsor is chosen, CHECK THE STATEMENT DESCRIPTOR FIRST.
 *   2. Any embedded widget - Stripe, PayPal, Ko-fi - is a third-party request
 *      from a page about drug supply. The CSP forbids it and so does PRIVACY.md.
 *      This is a plain outbound link, never an embed, never an iframe.
 *   3. Recurring giving needs a stored identity and a subscription record,
 *      which this app will not hold. Monthly belongs on the sponsor's side.
 *
 * Tone rules: it appears once, at the bottom of Help, never as a modal, never
 * after N visits, never on a screen someone reached in an emergency. No
 * confirmshaming, no "help us keep this free".
 *
 * One more constraint worth remembering: Health Canada's data terms permit
 * NON-COMMERCIAL reproduction only. Donations to a free app keep it
 * non-commercial; a paid tier would forfeit that feed. See build-emerging.mjs.
 */
const DONATE = {
  url: "",            // sponsor's donation page, https, on their domain
  org: "",            // the name that will appear on a bank statement
};

function supportBlock() {
  if (!DONATE.url || !DONATE.org) return null;

  return disclosure("sec-support-project", "Supporting this project", null,
    h("div", { class: "card" },
      h("p", null,
        "Nightlight is free and always will be. Donations are handled by ",
        h("strong", null, DONATE.org), ", not by this site."),
      h("p", null,
        "Worth knowing before you click: this site cannot see whether you donate, " +
        "but they will see your name and payment details, and a line will appear on " +
        "your statement. It will read as ", h("strong", null, DONATE.org),
        " — not as anything about drugs. If that record would be a problem for you, " +
        "please don’t. Nothing here changes either way."),
      h("div", { class: "sources" }, extLink(DONATE.url, `Donate via ${DONATE.org}`))));
}

/* Text only.
 *
 * These steps carried hand-drawn figures until 2026-08-10, when they were
 * removed at the user's request. The originals are in .attic/od-illustrations
 * rather than deleted, along with a note on what the removal cost: the brief
 * argued a picture of the recovery position is understood faster than a
 * paragraph by someone impaired, frightened, or not reading English easily.
 * The wording below now carries that load by itself, which is why it is
 * written as an instruction first and a reason second. */
const step = (s) =>
  h("li", null,
    h("h4", null, s.title),
    h("p", { class: "step__do" }, s.body),
    s.note ? h("p", { class: "step__why" }, s.note) : null);
const li = (strong, rest) => h("li", null, h("strong", null, strong), " ", rest);

/* These three lived on the Emergency tab until 2026-08-10. Safer-use practice,
   the privacy account, and "what this site is" are preparation and reference -
   none of them is what someone needs mid-crisis, and every block on that tab
   dilutes the ones that are. Support renders them; the builders stay here so
   the copy has one home. */
export function saferUseBlock() {
  /* ---- using more safely ---- */
  return (
    disclosure("sec-safer", "If you are going to use", null,
      h("div", { class: "card" },
        // This framing used to sit in the section caption. The captions are
        // gone, and it was the only place this was said, so it moves into the
        // body rather than being lost.
        h("p", null, "None of this makes drug use safe. It lowers the odds of an accident."),
        h("ul", null,
          li("Don’t use alone.", "If no one can be there, call Never Use Alone (1-800-484-3731) or use an app that will send help if you stop responding."),
          li("Start with much less than usual.", "Potency varies wildly between batches and even within one batch. A tolerance from last month does not apply to a new supply."),
          li("Coming back after a break?", "Jail, hospital, detox, treatment, or just time away — tolerance falls fast, and the amount you used before the break is enough to stop your breathing after it. The first days back are the most dangerous. Use a fraction, go slow, and do not be alone."),
          li("Go slow, and wait.", "Take a small amount and wait to feel it before taking more."),
          li("Keep naloxone within reach.", "Not in another room, and make sure whoever is with you knows where it is and how to use it."),
          li("Be careful mixing.", "Opioids with benzodiazepines or alcohol is especially dangerous, because all three slow breathing and the effects stack — naloxone reverses the opioid and does nothing for the rest. The combination found most often in overdose deaths today is actually fentanyl with a stimulant, which mostly reflects how many people use both."),
          li("Test what you have.", "See the Test section — it will not make anything safe, but it can tell you something you did not know."))))
  );

}

export function privacyBlock() {
  /* ---- privacy ---- */
  return (
    disclosure("sec-privacy", "What this site knows about you", null,
      h("div", { class: "card" },
        h("p", null,
          "Nothing that identifies you, and nothing about what you looked at."),
        h("ul", null,
          li("Your searches never leave your device.", "Every county, drug, and alert is already downloaded with the page, so choosing one makes no new request. The server cannot see which county or drug you picked."),
          li("No third parties.", "No analytics, no fonts, no maps, no trackers. This page contacts nothing but the server it came from."),
          li("Your location stays on your device.", "“Near me” matches your coordinates to a county in your browser. No location service is contacted."),
          /* This copy has been wrong twice, both times by lagging behind the
             code: it once claimed only a light/dark preference was kept, after
             seen.js had begun writing a timestamp. On the one page that
             promises a plain account of what the app knows, an inaccurate
             inventory is the worst possible copy. Re-read it against
             app.js/seen.js/i18n.js after touching any of them. */
          li("Nothing outlives the session.", "No account, no cookies, no record of what you searched or which counties you opened. Your light/dark choice and your language are held only until you close the tab, and the offline copy is deleted when you leave. Nothing is left on this device for next time.")),

        h("h3", null, "Quick exit"),
        /* "At the top right", not "in the header". The X used to ride in the
           header row and left the screen with it on scroll; it is a pinned
           pill now (index.html, app.css "Quick Exit, pinned") and is at the
           top right whether or not the header is showing. Same rule as the
           inventory above: this line describes a control, so it has to match
           where the control actually is. */
        h("p", null,
          "The ✕ button at the top right clears everything immediately, removes this " +
          "page from your Back button, and sends you to a weather site. It is a " +
          "shortcut, not a requirement — closing the tab clears the same things on " +
          "its own, and so does simply leaving."),

        callout("warn", "What Quick Exit can’t do",
          h("p", null,
            "It can’t erase pages your browser wrote into its history before you " +
            "pressed it, and it can’t clear the browser’s cache. If somebody else " +
            "might check this device, open this site in a private or incognito " +
            "window instead — that leaves no history at all."))))
  );

  }

export function aboutBlock() {
return (
    disclosure("sec-about", "What this site is", null,
      h("div", { class: "card" },
        h("p", null,
          "Nightlight collects what public sources — health departments, local news, " +
          "and drug-checking labs — have already published about drug supply in each " +
          "county, and puts it in one place."),
        h("p", null,
          h("strong", null, "It is not medical advice, and it is not a safety check. "),
          "Nothing here verifies a drug, clears it, or says it is safe to take. " +
          "An absence of alerts means nobody published anything — not that a supply is clean.")))
  );

}
