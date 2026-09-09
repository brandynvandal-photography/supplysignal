/* THE FRONT DOOR. One question, then the section that answers it.
 *
 * The app used to open on Alerts, the county page - the tab that most often
 * has nothing local to say, and the wrong first answer to the question a
 * person actually arrives with. This screen asks that question and lands the
 * reader on the block that answers it, with every tab still in the bar for
 * the reader who wants to look further (asked for 2026-09-09).
 *
 * Doors, not a menu: each row names the situation in the words people use
 * and says in one line what is behind it. The first is the emergency, styled
 * the way the SOS tab is - the one reader who needs it fast must not have to
 * read the list. The routes and anchors are the same ones search.js's
 * starters land on; the labels live in the locale file so a translator can
 * reach them, and the reentry door is here because the deadliest window has
 * a section, a search intent, and until now no door.
 *
 * Nothing here is stateful, nothing is stored, and nothing is fetched: the
 * whole screen is strings from the locale and links that ui.js already knows
 * how to draw.
 */

import { h, section } from "../ui.js";
import { t } from "../i18n.js";

const ROWS = [
  { key: "overdose", route: "#/help", urgent: true },
  { key: "naloxone", route: "#/learn", anchor: "sec-naloxone" },
  { key: "calling", route: "#/policy", anchor: "sec-calling" },
  { key: "testing", route: "#/test" },
  { key: "inject", route: "#/injection" },
  { key: "reentry", route: "#/supervision", anchor: "sec-reentry" },
  { key: "detect", route: "#/supervision", anchor: "sec-windows" },
  { key: "help", route: "#/support", anchor: "grp-help" },
];

const BROWSE = [
  { key: "alerts", route: "#/alerts" },
  { key: "drugs", route: "#/substances" },
  { key: "learn", route: "#/learn" },
  { key: "about", route: "#/about" },
];

/* A native list row like every other door in the app. data-reveal is the
   cross-page pointer app.js already handles: the page loads, then the
   section it names is opened and scrolled to. */
function door(r) {
  const attrs = { class: `nbr${r.urgent ? " nbr--sos" : ""}`, href: r.route };
  if (r.anchor) attrs["data-reveal"] = r.anchor;
  return h("a", attrs,
    h("span", { class: "nbr__text" },
      h("span", { class: "nbr__name" }, t(`home.rows.${r.key}.title`)),
      h("span", { class: "nbr__sub nbr__sub--wrap" }, t(`home.rows.${r.key}.sub`))),
    h("span", { class: "nbr__right" }, h("span", { "aria-hidden": "true" }, "\u203A")));
}

export async function render() {
  const wrap = h("div", { class: "home" });
  wrap.append(
    h("h1", null, t("home.title")),
    h("p", { class: "home__sub" }, t("home.sub")),
    h("div", { class: "list home__doors" }, ROWS.map(door)),
    section(t("home.browseTitle"), null,
      h("div", { class: "list" }, BROWSE.map(door))),
  );
  return wrap;
}
