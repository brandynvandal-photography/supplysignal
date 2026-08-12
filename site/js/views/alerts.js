/* County alerts, plus the counties around it.
 *
 * A supply does not stop at a county line - it moves with the people and the
 * routes that carry it, and a batch that killed someone one county over is
 * usually the more useful warning. So bordering counties are not a secondary
 * feature here; they are shown by default, labeled with distance, and never
 * silently merged into the home county's numbers. */

import {
  h, frag, clear, section, empty, callout, sevBadge, badge, extLink, relTime, isoDate,
} from "../ui.js";
import { t } from "../i18n.js";
import { countNew, lastVisit, FALLBACK_DAYS } from "../seen.js";

const WINDOWS = [
  { d: 30, label: "30 days" },
  { d: 90, label: "90 days" },
  { d: 365, label: "12 months" },
];

export async function render(route, ctx) {
  if (route.map) return mapView(ctx, route.focus);
  return route.fips ? countyView(route, ctx) : pickerView(route, ctx);
}

/* The map is an addition to the list, never a replacement for it. A canvas is
   unreachable by a screen reader, so search stays on this screen and the map
   module renders its own ranked, keyboard-navigable county list underneath. */
async function mapView({ go, data }, focus = null) {
  const focusCounty = focus ? await data.county(focus) : null;
  const wrap = h("div");
  wrap.appendChild(viewToggle("map", go));
  wrap.appendChild(await searchBar({ go, data }));

  const host = h("div", { class: "map" });
  wrap.appendChild(host);

  const { mountMap } = await import("../map.js");
  await mountMap(host, { go, focus,
    focusLabel: focusCounty ? `${focusCounty.name}, ${focusCounty.state}` : null });
  return wrap;
}

function viewToggle(current, go) {
  return h("div", { class: "chips viewtoggle", role: "group", "aria-label": "How to browse" },
    h("button", {
      type: "button", class: "chip", "aria-pressed": String(current === "list"),
      onClick: () => go("#/alerts"),
    }, t("alerts.viewList")),
    h("button", {
      type: "button", class: "chip", "aria-pressed": String(current === "map"),
      onClick: () => go("#/alerts/map"),
    }, t("alerts.viewMap")));
}

/* =============================================================== picker == */

async function pickerView(route, { go, data }) {
  const wrap = h("div");

  /* First open only - derived from seen.js's single timestamp, so it costs no
     new storage and cannot recur. Not a modal, not a tour, gates nothing: one
     card that says what this is and makes the privacy promise before anything
     is tapped. The person this is for arrived frightened, from a search
     result, possibly from a bad night - the first thing the app says to them
     should be what it will not do. */
  if (lastVisit() === null) {
    wrap.appendChild(
      h("div", { class: "welcome" },
        h("h2", null, "You’re in the right place."),
        h("p", null,
          "Alerts for your county, how to test, what mixes badly, and where to get " +
          "help — free, no account. Nothing you look up here leaves this device."))
    );
  }

  wrap.appendChild(viewToggle("list", go));

  wrap.appendChild(
    h("div", { class: "county-head" },
      h("h1", null, t("alerts.heading")),
      h("p", { class: "sec__note" }, t("alerts.intro")))
  );

  wrap.appendChild(await searchBar({ go, data }));

  wrap.appendChild(
    /* From the locale files - a translated key already existed while this text
       sat here hardcoded in English, which is exactly how the two drift. */
    callout("info", t("alerts.locationPrivacyTitle"),
      h("p", null, t("alerts.locationPrivacyBody")),
      /* Storage now clears itself, so the X is no longer the mechanism - it is
         the escape. Someone who thinks they must remember to press it will
         worry when they forget, and someone who does not know it exists will
         not reach for it when they need to leave in a hurry. Both facts, once,
         in the callout that is already about privacy. */
      h("p", null, h("strong", null, t("alerts.sessionTitle")), ". ",
        t("alerts.sessionBody")))
  );

  const a = await data.alerts();
  if (!a.generated) {
    wrap.appendChild(
      empty("No scan has run yet.",
        "Once the hourly job runs, alerts will appear here. Until then this " +
        "page has nothing to report — which is not the same as nothing happening.")
    );
  }

  return wrap;
}

/* ============================================================ search bar == */

async function searchBar({ go, data }) {
  const input = h("input", {
    id: "q", class: "input", type: "text", autocomplete: "off",
    autocapitalize: "words", spellcheck: "false",
    role: "combobox", "aria-expanded": "false", "aria-controls": "results",
    "aria-autocomplete": "list", "aria-label": t("alerts.searchLabel"),
    placeholder: t("alerts.searchPlaceholder"),
  });

  const listbox = h("div", { id: "results", class: "listbox", role: "listbox",
                             "aria-label": "County matches" });
  const status = h("p", { class: "status", role: "status" });

  const locateBtn = h("button", { class: "btn btn--ghost", type: "button" },
    h("span", { "aria-hidden": "true" }, "◎"), " " + t("alerts.nearMe"));

  let matches = [];
  let hi = -1;

  /* Both ways of finding a county end here: pick a search result, or use
     Near me. Rather than assuming the county page, both offer it alongside
     the map - the map is where "and the counties around it" becomes obvious,
     which is the whole premise of this app.
     This lives in the status line rather than inside the listbox: those rows
     are ARIA `option`s, and an option containing its own buttons is invalid
     and unusable by a screen reader. */
  const offer = (fips, label, lead) => {
    /* No longer a choice. The county page now carries the map itself, so
       there is one destination and nothing to pick between. `lead` still
       announces what was found for screen readers before the navigation. */
    void label;
    say(lead);
    go(`#/alerts/${fips}`);
  };

  /** Turn a chosen match into that offer. Cities name their county so nobody
   *  is surprised by the page they land on. */
  const choose = async (m) => {
    close();
    const c = await data.county(m.fips);
    const label = c ? `${c.name}, ${c.state}` : m.name;
    const lead = m.kind === "place"
      ? `${m.name} reports under ${label}.`
      : `${label}.`;
    offer(m.fips, c ? c.name : m.name, lead);
  };

  const say = (msg, err = false) => {
    status.textContent = msg || "";
    status.className = "status" + (err ? " status--err" : "");
  };

  const close = () => {
    matches = []; hi = -1;
    clear(listbox);
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
  };

  const paint = () => {
    [...listbox.children].forEach((el, i) => {
      el.setAttribute("aria-selected", String(i === hi));
    });
    if (hi >= 0 && listbox.children[hi]) {
      input.setAttribute("aria-activedescendant", listbox.children[hi].id);
      listbox.children[hi].scrollIntoView({ block: "nearest" });
    } else {
      input.removeAttribute("aria-activedescendant");
    }
  };

  const open = async (term) => {
    const list = await data.searchAll(term);
    matches = list; hi = -1;
    clear(listbox);
    if (!list.length) { input.setAttribute("aria-expanded", "false"); return; }

    const alertsDoc = await data.alerts();
    const counts = new Map();
    for (const c of alertsDoc.clusters || []) {
      counts.set(c.fips, (counts.get(c.fips) || 0) + 1);
    }

    list.forEach((m, i) => {
      const n = counts.get(m.fips) || 0;
      const isPlace = m.kind === "place";
      listbox.appendChild(
        h("button", {
            type: "button", role: "option", id: `opt-${i}`,
            "aria-selected": "false", dataset: { fips: m.fips },
            onClick: () => choose(m),
          },
          h("span", null, m.name),
          // A city says which county it reports under, so nobody is surprised
          // to land on a county page they did not type.
          h("span", { class: "st" },
            isPlace ? `${m.county}, ${m.state}` : m.state),
          n ? h("span", { class: "cnt" }, `${n} alert${n === 1 ? "" : "s"}`) : null)
      );
    });
    input.setAttribute("aria-expanded", "true");
  };

  input.addEventListener("input", () => {
    // Not `t` — that is the translation function in this module's scope.
    const term = input.value.trim();
    if (term.length < 2) { close(); say(""); return; }
    open(term);

    /* Small unincorporated places live in a second file that streams in behind
       the first. If it has not landed yet, say so and re-run the search when
       it does - otherwise someone in a rural community searches their town,
       sees nothing, and reasonably concludes they are not covered. */
    if (!data.ruralReady()) {
      say("Still loading smaller towns…");
      data.prefetchRural().then(() => {
        say("");
        if (input.value.trim().length >= 2 && document.activeElement === input) {
          open(input.value.trim());
        }
      });
    }
  });

  // The place index is only needed once someone starts typing. Warm it on
  // focus so the first keystroke is not the thing that waits for it.
  input.addEventListener("focus", () => { data.places(); }, { once: true });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") return close();
    if (!matches.length) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      hi = (hi + (e.key === "ArrowDown" ? 1 : -1) + matches.length) % matches.length;
      paint();
    } else if (e.key === "Enter") {
      e.preventDefault();
      const pick = matches[hi >= 0 ? hi : 0];
      if (pick) choose(pick);
    }
  });

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".search")) close();
  });

  /* ---- near me: point-in-polygon in the browser, nothing transmitted ---- */
  locateBtn.addEventListener("click", async () => {
    if (!navigator.geolocation) return say("This browser can’t share location. Search by name instead.", true);

    locateBtn.disabled = true;
    say("Asking your browser for a location…");

    let pos;
    try {
      pos = await new Promise((res, rej) =>
        navigator.geolocation.getCurrentPosition(res, rej, {
          enableHighAccuracy: false, timeout: 15000, maximumAge: 300000,
        }));
    } catch (err) {
      locateBtn.disabled = false;
      /* Three different failures, three different things a person can do. The
         generic fallback used to catch code 2, which is the most common one on
         a desktop - and "couldn't get a location" tells someone neither why
         nor what would change it. Declining is never framed as a mistake. */
      return say(
        err.code === 1
          ? "No problem — location stays off. Search by city or county name instead."
        : err.code === 3
          ? "Location is taking too long. Try again, or search by name."
        : "Your device couldn’t work out where it is — location services may be " +
          "switched off. Search by city or county name instead.", true);
    }

    try {
      say("Matching coordinates to a county on this device…");
      const [{ findCountyFips }, shapes] = await Promise.all([
        import("../../../src/locate.mjs"),
        data.shapes(),
      ]);
      const fips = findCountyFips(shapes, pos.coords.latitude, pos.coords.longitude);
      locateBtn.disabled = false;

      const c = fips ? await data.county(fips) : null;
      if (!c) return say("That location isn’t inside a US county. Search by name instead.", true);

      offer(fips, c.name,
        `Found ${c.name}, ${c.state}. Your coordinates stayed on this device.`);
    } catch {
      locateBtn.disabled = false;
      say("Couldn’t load the map data. Search by name instead.", true);
    }
  });

  return h("div", { class: "search" },
    h("div", { class: "search__row" }, input, locateBtn),
    listbox, status);
}

/* =============================================================== county == */

async function countyView({ fips, days }, { go, data }) {
  const c = await data.county(fips);
  if (!c) return empty("That county code isn’t one we have.", "Search for a county by name instead.");

  const wrap = h("div");
  const win = WINDOWS.some((w) => w.d === days) ? days : 90;

  /* The county's name is the answer someone clicked through for; it leads.
     Search was above it, which made every county page open on a control for
     leaving it. The picker keeps search first - there, search IS the task. */
  wrap.appendChild(
    h("div", { class: "county-head" },
      h("h1", null, `${c.name}, ${c.state}`),
      h("p", { class: "mono" }, `FIPS ${c.fips}`))
  );

  wrap.appendChild(await searchBar({ go, data }));

  /* The map, on the county page itself. Two screens used to answer one
     question - "what is around me" is spatial, and making someone choose
     between a list and a map meant whichever they picked hid the other half.
     It sits under the heading and above the alerts: orientation first, then
     the detail. The county is marked; every neighbour is one tap away. */
  const mapHost = h("div", { class: "map map--inline" });
  wrap.appendChild(mapHost);
  import("../map.js").then(({ mountMap }) =>
    mountMap(mapHost, { go, focus: fips, focusLabel: `${c.name}, ${c.state}`, compact: true })
  ).catch(() => { mapHost.remove(); });   // canvas is never the only route

  /* Numbers for this county, directly under the map. The mortality data was
     already bundled and drawn as map SHADING, which tells you "darker than
     next door" and nothing else - a reader could not learn whether their own
     county was getting better or worse. Appended asynchronously so a slow or
     missing bundle never delays the alerts underneath. */
  const statsHost = h("div");
  wrap.appendChild(statsHost);
  data.mortality().then((m) => {
    const block = mortalityBlock(m, c);
    if (block) statsHost.replaceChildren(block);
  }).catch(() => {});

  wrap.appendChild(
    h("div", { class: "chips", role: "group", "aria-label": "Time window" },
      WINDOWS.map((w) =>
        h("button", {
          type: "button", class: "chip", "aria-pressed": String(w.d === win),
          onClick: () => go(`#/alerts/${fips}/${w.d}`),
        }, w.label)))
  );

  const [mine, near] = await Promise.all([
    data.alertsFor(fips, win),
    data.alertsNearby(fips, win),
  ]);

  /* ---- what changed since last time ---- */
  const fresh = freshLine([...mine, ...near], win, c);
  if (fresh) wrap.appendChild(fresh);

  /* ---- this county ---- */
  wrap.appendChild(
    section(`In ${c.name}`, `${mine.length} in the last ${labelFor(win)}`,
      mine.length
        ? frag(mine.map((k) => card(k)))
        : notHere(c, near.length, win))
  );

  /* ---- bordering counties ---- */
  const nbrs = await data.neighbors(fips);
  const counts = new Map();
  for (const k of near) counts.set(k._county.fips, (counts.get(k._county.fips) || 0) + 1);

  wrap.appendChild(
    section(
      "Bordering counties",
      `${nbrs.length} border ${c.name}`,
      h("p", { class: "sec__note" },
        "Supply moves across county lines. These are the counties that touch " +
        `${c.name}, nearest first.`),
      h("div", { class: "list" },
        nbrs.map((n) => {
          const cnt = counts.get(n.fips) || 0;
          return h("button", {
              type: "button", class: "nbr",
              onClick: () => go(`#/alerts/${n.fips}/${win}`),
            },
            /* Title over subtitle. Inline, this row had no shrinkable child,
               so "Sequatchie County, TN · 21 mi" pushed the "mi" onto its own
               line and shoved the badge out of alignment. */
            h("span", { class: "nbr__text" },
              h("span", { class: "nbr__name" }, `${n.name}, ${n.state}`),
              h("span", { class: "nbr__sub" }, `${n.mi} mi`)),
            h("span", { class: "nbr__right" },
              cnt ? badge(`${cnt}`, sevOf(near, n.fips)) : badge("none", "neutral"),
              h("span", { "aria-hidden": "true" }, "›")));
        }))
    )
  );

  /* ---- alerts from those counties ---- */
  if (near.length) {
    wrap.appendChild(
      section("Nearby alerts", `${near.length} in counties bordering ${c.name}`,
        frag(near.map((k) => card(k, true))))
    );
  }

  /* ---- drug checking ----
     Lab results are already alert clusters with kind:"lab"; this surfaces
     them as their own section instead of leaving them mixed into warnings.
     Coverage is the honest problem: the one national per-sample feed (UNC,
     42 states, weekly) is pending a data request - see OUTREACH.md - so
     today this mostly renders its empty state. The section exists so the
     shape is ready and the absence is stated rather than implied. */
  const labs = [...mine, ...near].filter((k) => k.kind === "lab");
  wrap.appendChild(
    section("Recent drug checking", labs.length ? `${labs.length} lab result${labs.length === 1 ? "" : "s"}` : null,
      labs.length
        ? frag(
            h("p", { class: "sec__note" },
              "What labs found in samples people submitted from this area. Samples are " +
              "self-selected, not a survey — they show what is possible, not how common."),
            frag(labs.map((k) => card(k, k._county ? true : false))))
        : h("p", { class: "sec__note" },
            "No public lab results for this area are in the current data. Most of the " +
            "country has no public drug-checking coverage — no result here does not " +
            "mean nothing is circulating."))
  );

  /* ---- national early warning ----
     A link, never inlined content. The moment national data renders inside a
     county page a reader takes it as local, which is the one failure this
     feature must not have. */
  wrap.appendChild(
    h("button", { type: "button", class: "nbr", onClick: () => go("#/emerging") },
      h("span", { class: "nbr__text" },
        h("span", { class: "nbr__name" }, "Early warning"),
        h("span", { class: "nbr__sub nbr__sub--wrap" },
          "drugs showing up elsewhere, not local")),
      h("span", { class: "nbr__right" }, h("span", { "aria-hidden": "true" }, "›")))
  );

  /* ---- what is characteristic of this part of the country ---- */
  const { regionalForState } = await import("../regional.js");
  const regional = await regionalForState(c.state, c.name);
  if (regional) {
    wrap.appendChild(
      section("Common in this region", "From national drug-checking data", regional)
    );
  }

  /* There is deliberately NO "RSS for this county" link here.
   *
   * It used to sit in this row, and it was the single worst privacy defect in
   * the app - the one thing that contradicted its own architecture. Every
   * other lookup runs against one national bundle that is byte-identical for
   * every reader, so the host's access log can only ever show "somebody opened
   * the site". Tapping a link to `feeds/47065.xml` writes "this IP looked up
   * Hamilton County" into that log instead, and subscribing turns a single
   * lookup into a recurring, IP-linked, timestamped county record that keeps
   * writing itself for as long as the feed stays in someone's reader.
   *
   * src/store.mjs says this in as many words about the sibling per-county JSON
   * ("the browser must never request one"), and the client was handing readers
   * a link that did exactly that.
   *
   * A warning would not have fixed it. This app's premise is that privacy is
   * architecture rather than a decision pushed onto the reader, and the reader
   * least able to evaluate that trade-off is exactly the one this protects.
   *
   * The feeds are still generated. They are a real API surface for outreach
   * programs, journalists and health departments - people subscribing on their
   * own account, from their own infrastructure, to a county that is not a
   * statement about them. They are documented in the README for that audience.
   * They are simply never linked from a page a person reads about themselves. */
  wrap.appendChild(
    h("div", { class: "sec" },
      h("div", { class: "chips" },
        h("button", {
          type: "button", class: "btn btn--ghost btn--sm",
          onClick: async (e) => {
            try {
              await navigator.clipboard.writeText(location.href);
              e.currentTarget.textContent = "Link copied";
            } catch { /* clipboard blocked; nothing to fall back to that is private */ }
          },
        }, "Copy link")))
  );

  return wrap;
}

const labelFor = (d) => (d === 365 ? "12 months" : `${d} days`);

function sevOf(list, fips) {
  const here = list.filter((k) => k._county.fips === fips);
  if (here.some((k) => k.severity === "critical")) return "critical";
  if (here.some((k) => k.severity === "elevated")) return "elevated";
  return "advisory";
}

/**
 * The empty state is the most dangerous screen in the app. "No alerts" is an
 * absence of reporting, not evidence of a safe supply, and it must never be
 * allowed to read as reassurance.
 */
function notHere(c, nearCount, win) {
  return callout("warn", `Nothing published for ${c.name} in the last ${labelFor(win)}`,
    h("p", null,
      "This does not mean the supply here is safe. Most changes in a local drug " +
      "supply are never publicly announced, and reporting runs behind reality by " +
      "weeks. Treat this as “no information”, not “no risk”."),
    nearCount
      ? h("p", null, `There ${nearCount === 1 ? "is" : "are"} ${nearCount} alert${nearCount === 1 ? "" : "s"} in bordering counties — see below.`)
      : null);
}

/**
 * "New since you last looked" - the quiet alternative to a live ticker.
 *
 * Deliberately static. A scrolling feed would imply real-time coverage this app
 * does not have (a full sweep of every county takes about a week, and most
 * local supply changes are never published at all), and motion pulls the eye of
 * whoever else is in the room - the same threat the Quick Exit control exists
 * for.
 *
 * Renders nothing when the count is zero. "Nothing new" is a weaker restatement
 * of a claim the empty state already makes properly, and a reassuring-sounding
 * one, which rule 2 does not allow.
 */
function freshLine(items, win, c) {
  /* Always the fixed-window wording. The app keeps nothing between sessions,
     so it cannot know when this reader last looked - and saying "since you
     last looked" would claim a memory it deliberately does not have. */
  const { count } = countNew(items);
  if (!count) return null;

  const noun = `alert${count === 1 ? "" : "s"}`;

  return h("div", { class: "fresh" },
    h("span", { class: "fresh__dot", "aria-hidden": "true" }),
    h("p", null,
      h("strong", null,
        `${count} ${noun} published in the last ${FALLBACK_DAYS} days`),
      h("span", { class: "fresh__where" },
        ` in ${c.name} and bordering counties.`)));
}

/* ================================================================= card == */

function card(k, showCounty = false) {
  const isLab = k.kind === "lab";

  return h("div", { class: `card card--${k.severity}` },
    h("div", { class: "card__top" },
      sevBadge(k.severity),
      isLab ? badge("Lab result", "neutral") : null,
      showCounty && k._county
        ? badge(`${k._county.name}, ${k._county.state} · ${k._mi} mi`, "neutral")
        : null,
      h("time", { class: "card__meta", datetime: isoDate(k.eventDate) }, relTime(k.eventDate))),

    h("h3", null, k.headline),

    k.substances?.length
      ? h("div", { class: "tags" }, k.substances.map((s) => h("span", { class: "tag" }, s)))
      : null,

    k.summary ? h("p", null, k.summary) : null,

    k.sources?.length
      ? h("div", { class: "sources" },
          k.sources.map((s) => extLink(s.url, s.name)),
          k.sourceCount > 1
            ? h("span", { class: "card__meta" }, `${k.sourceCount} sources reported this`)
            : null)
      : null);
}

/* Overdose deaths in this county, and which way the number is moving.
 *
 * Four things this must not do, each of which is easy to do by accident:
 *
 *   - IMPLY PRECISION IT DOES NOT HAVE. These are provisional counts that lag
 *     by months and get revised UPWARD as investigations close. A falling
 *     recent number may simply be incomplete, so the direction is described
 *     rather than celebrated.
 *   - TREAT SUPPRESSED AS ZERO. Counts of 1 to 9 are withheld for privacy.
 *     "No data" here means "we are not told", never "nobody died", and a
 *     county that reads as empty must not look like a safe one.
 *   - MAKE A CHANGE SOUND LIKE A TREND. One year against one year, in a place
 *     with small numbers, moves a lot on chance alone. Percentages on tiny
 *     counts are the classic way to mislead with true figures, so the raw
 *     counts are always shown beside any change.
 *   - READ AS A SCOREBOARD. Every one of these is a person, and somebody
 *     opening this page may have been at one of them. Plain, quiet, no
 *     celebration when the arrow points down.
 */
function mortalityBlock(m, county) {
  const rec = m?.counties?.[county.fips];
  const asOf = m?.asOf ? String(m.asOf).slice(0, 10) : null;

  if (!rec || typeof rec.n !== "number") {
    return h("div", { class: "card mort" },
      h("h3", null, "Overdose deaths here"),
      h("p", { class: "sec__note" },
        "Not published for this county. Counts between 1 and 9 are withheld to protect " +
        "privacy, so no number is not the same as no deaths."));
  }

  const now = rec.n;
  const prior = typeof rec.p === "number" ? rec.p : null;
  const diff = prior === null ? null : now - prior;

  /* Direction is a word first. An arrow alone is decoration a screen reader
     cannot use, and a colour alone would be the only carrier of meaning. */
  let trend = null;
  if (diff !== null) {
    const pct = prior > 0 ? Math.round(Math.abs(diff) / prior * 100) : null;
    const word = diff === 0 ? "About the same as" : diff < 0 ? "Down from" : "Up from";
    trend = h("p", { class: `mort__trend mort__trend--${diff < 0 ? "down" : diff > 0 ? "up" : "flat"}` },
      h("span", { "aria-hidden": "true" }, diff === 0 ? "→ " : diff < 0 ? "↓ " : "↑ "),
      `${word} ${prior} the year before`,
      pct !== null && diff !== 0 ? ` (${pct}%)` : "");
  }

  return h("div", { class: "card mort" },
    h("h3", null, "Overdose deaths here"),
    h("p", { class: "mort__n" }, `${now}`),
    h("p", { class: "mort__unit" },
      `in the 12 months to ${asOf || "the latest published date"}, in ${county.name}`),
    trend,
    /* The caveats are not small print. A provisional count that revises upward
       is the difference between "it is improving" and "we do not know yet". */
    h("p", { class: "sec__note" },
      "Provisional CDC counts. They lag by months and are revised upward as investigations " +
      "close, so the most recent figure is usually an undercount. Deaths are counted where " +
      "they happened, which is not always where the person lived."),
    prior !== null && (now < 20 || prior < 20)
      ? h("p", { class: "sec__note" },
          "Small numbers move a lot year to year on chance alone. Treat one year against " +
          "one year as a hint, not a trend.")
      : null,

    /* A big "0" is the one number on this page that can be read as a clean
       bill of health, and this app does not issue those anywhere else - "no
       alerts does not mean a safe supply" is in the footer of every screen.
       Zero deaths recorded HERE is not zero risk here: the count is by place
       of death rather than of residence, and the supply that killed somebody
       one county over is the same supply. */
    now === 0
      ? h("p", { class: "sec__note" },
          "No deaths recorded here does not mean no risk here. Someone from this county who " +
          "died in a hospital elsewhere is counted there, and the supply does not stop at the " +
          "county line — the bordering counties below are part of your picture.")
      : null);
}
