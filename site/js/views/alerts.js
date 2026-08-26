/* County alerts, plus the counties around it.
 *
 * A supply does not stop at a county line - it moves with the people and the
 * routes that carry it, and a batch that killed someone one county over is
 * usually the more useful warning. So bordering counties are not a secondary
 * feature here; they are shown by default, labeled with distance, and never
 * silently merged into the home county's numbers. */

import {
  h, frag, clear, section, empty, callout, sevBadge, badge, extLink, relTime, isoDate, ageBand,
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
  /* An h1, because this route had none. focusView() looks for h1 then h2 and
     was falling through to the #main landmark, so a screen reader user landed
     on the map with no page title and an outline that started at level 3.
     Translated rather than hardcoded, like every other heading here. */
  wrap.appendChild(h("h1", null, t("alerts.heading")));
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

  /* h1 BEFORE the List/Map switch, as the map view already had it. Here the
     switch came first, so the page's title sat under a control that changes
     how the page is shown - and focusView() lands on the h1, which put a
     screen reader's starting point below the first thing on the screen. */
  wrap.appendChild(
    h("div", { class: "county-head" },
      h("h1", null, t("alerts.heading")))
  );

  wrap.appendChild(viewToggle("list", go));

  wrap.appendChild(await searchBar({ go, data }));

  /* THE PRIVACY PANEL IS GONE FROM THIS SCREEN.
   *
   * It was a box about data handling and two paragraphs about session storage,
   * sitting under the one list a reader opened this tab to see. The promise
   * itself is not gone: the welcome card at the top of a first visit still says
   * nothing you look up here leaves this device, About carries the same block
   * in full with the mechanism behind it, and Emergency explains Quick Exit
   * where somebody in a hurry would look for it. Said once, in the places
   * someone goes to ask, rather than a third time under the alerts. */

  const a = await data.alerts();
  if (!a.generated) {
    /* Both strings already existed in the locale file while these sat here in
       English. Same drift the location callout above had. */
    wrap.appendChild(empty(t("alerts.noScanTitle"), t("alerts.noScanBody")));
    return wrap;
  }

  /* WHEN THESE ALERTS ARE FROM, and a way to ask again - on this screen only.
     The packaged app carries the alerts that existed on the day it was built
     and refreshes them from the web at boot and on return to the foreground
     (see data.refreshAlerts and app.js); the website serves them fresh. On
     both, the footer already carries the date, below six screens of content.
     This is the one screen that IS the alerts, so the date belongs at the top
     of it, with the refresh beside it: on the web a reload is the honest
     refresh (the server has the newest file); in the app the same remote
     fetch boot uses, then a re-render of this screen. Nothing here is a
     pull-to-refresh - that would fight the map canvas for the gesture. */
  /* Built fresh on every redraw of the section below, because that section
     replaces its own children and a single node would be re-parented instead
     of re-rendered. */
  const updatedLine = () =>
    h("p", { class: "sec__note" },
      t("alerts.dataUpdated", { date: new Date(a.generated).toISOString().slice(0, 10) }),
      " · ",
      h("button", {
        type: "button", class: "linkbtn",
        onClick: async () => {
          if (!data.packaged()) { location.reload(); return; }
          await data.refreshAlerts().catch(() => false);
          go("#/alerts");
        },
      }, t("alerts.refresh")));

  /* Alerts first, privacy promise under them.
     It used to sit between the search row and the alerts, so the first thing
     on the tab named "what's showing up near you" was a box about data
     handling - true, and not what somebody opened this to find out. It is a
     reassurance about a control they have already used by then, so it reads
     better after the answer than in front of it. */
  /* THE SAME WINDOW CONTROL THE COUNTY PAGE HAS.
   *
   * This list was pinned to 90 days with no way to change it, and the county
   * page three taps away has offered 30/90/365 all along. That was invisible
   * while the national list was empty and stopped being invisible the moment it
   * was not: Philadelphia's carfentanil bulletin published at 277 days old, so
   * it sat in the bundle, reachable on the county page at twelve months, and
   * absent from the one screen most readers actually look at.
   *
   * The DEFAULT stays 90 days, because a nine-month-old bulletin is not "what
   * is showing up near you" and this app does not get to blur that. What
   * changes is that the reader can ask, and the count next to the heading names
   * the window it is counting - so a longer list never looks like a busier
   * month.
   *
   * Re-renders in place rather than routing, because the picker screen has no
   * county in its URL and adding one would put a window in the address bar of a
   * page that is deliberately about nowhere. */
  const natHost = h("div");
  let natDays = NATIONAL_DAYS;
  const drawNational = async (focusChips = false) => {
    const chips = h("div", { class: "chips chips--window", role: "group", "aria-label": "Time window" },
      WINDOWS.map((w) =>
        h("button", {
          type: "button", class: "chip", "aria-pressed": String(w.d === natDays),
          onClick: () => { natDays = w.d; drawNational(true); },
        }, w.label)));
    const list = await everywhere({ data }, {
      limit: NATIONAL_PREVIEW, days: natDays, control: chips,
      note: updatedLine(),
      onWiden: (d) => { natDays = d; drawNational(true); },
    });
    natHost.replaceChildren(list);
    /* The control the reader just used is replaced by this redraw, so without
       this a keyboard or screen reader user is left on a button that no longer
       exists with nothing said about what changed. */
    if (focusChips) {
      const pressed = natHost.querySelector('.chip[aria-pressed="true"]');
      if (pressed) pressed.focus();
    }
  };
  await drawNational();
  wrap.appendChild(natHost);

  /* ---- newly detected elsewhere ----
   *
   * ON THIS SCREEN AND NOT ON A COUNTY PAGE, and the difference is the whole
   * reason it is safe here. countyView links to Early warning rather than
   * inlining it, because "the moment national data renders inside a county
   * page a reader takes it as local" - a page about Hamilton County reads
   * everything on it as being about Hamilton County. This page is, in its own
   * words, deliberately about nowhere: there is no county on it to borrow. So
   * a coast-level finding can be shown rather than only pointed at, which is
   * what makes it findable at all - it was previously reachable only from a
   * county page, two taps in.
   *
   * The geography is on every row, not only in the heading, because a reader
   * scanning a list does not read headings. And the section says what it is
   * before it says what was found. */
  const seenElsewhere = await data.alertsRegional(365);
  if (seenElsewhere.length) {
    const label = { west: "West Coast", east: "East Coast", national: "United States" };
    wrap.appendChild(
      section("Newly detected elsewhere in the US",
        `${seenElsewhere.length} compound${seenElsewhere.length === 1 ? "" : "s"} in the last 12 months`,
        /* The count lives here because section()'s note argument is voided -
           it renders the heading and nothing else - and the number is worth
           saying: "six" is a different picture from "sixty". */
        h("p", { class: "sec__note" },
          `${seenElsewhere.length} substance${seenElsewhere.length === 1 ? "" : "s"} `
          + "a federal lab found in submitted samples for the first time. "
          + "The finest location this data has is a coast — none of it says whether "
          + "any of these has reached your county."),
        /* GROUPED BY WHAT THE COMPOUND IS, NOT BY ITS NAME.
           
           This listed one row per compound, and the compound name is the least
           informative thing a finding carries: "4'-Chloro deschloroalprazolam"
           tells a reader nothing they can act on, and six of those in a column
           is six lookups. What they can act on is the class - a synthetic
           opioid and a benzodiazepine carry different risks and different
           responses - so the class is the row now, and the compounds sit
           inside it.
           
           It also scales the right way. The classes stay a handful while the
           compounds only accumulate; a per-compound list gets longer every
           month and says no more than it did.
           
           NIST'S OWN WORDS FOR THE CLASS, never ours. printedClass is what the
           program printed beside that compound, carried through the ingest
           untouched, and a finding with no printed class is grouped as exactly
           that rather than being guessed at or silently dropped - the same rule
           the rest of this app follows about saying more than a source did. */
        h("div", { class: "list newly" }, classRows(seenElsewhere, label)),
        h("div", { class: "seenmore" },
          /* Every finding is reachable on this page now - open a class and the
             compounds are inside it - so this is no longer an overflow link and
             no longer claims to be one. Early warning is where the same
             findings sit with the program's caveats around them. */
          h("button", { type: "button", class: "btn btn--ghost btn--sm", onClick: () => go("#/emerging") },
            "More in Early warning")))
    );
  }

  return wrap;
}


/* One row per class: the count, where it was seen, and when - then the
   compounds themselves behind a disclosure, each still linking to its own
   bulletin. details.acc is the disclosure this app already uses everywhere
   else, so this reads as the same control rather than a new one. */
function classRows(items, label) {
  const groups = new Map();
  for (const c of items) {
    const key = (c.printedClass || "").trim() || UNCLASSED;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(c);
  }
  /* Biggest first, and ties alphabetically so the order never wobbles between
     two renders of the same data. */
  const ordered = [...groups.entries()].sort(
    (a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));

  return ordered.map(([cls, rows]) => {
    const places = [...new Set(rows.map((r) => label[r.region] || "United States"))];
    const months = [...new Set(rows.map((r) => monthOf(r.eventDate)))].filter(Boolean);
    /* "March – April 2026", not "March 2026 – April 2026": the year is said
       once when both ends share it. */
    const when = monthRange(months);

    return h("details", { class: "acc" },
      h("summary", null,
        h("span", null, sentenceCase(cls)),
        badge(String(rows.length), "neutral")),
      h("div", { class: "acc__body" },
        h("p", { class: "sec__note" },
          [places.join(" and "), when].filter(Boolean).join(" · ")),
        h("div", { class: "list" }, rows.map((c) => compoundRow(c, label)))));
  });
}

/* STRAIGHT TO THE SOURCE. What a reader wants after seeing a compound is the
   bulletin it came from, so the row is the source link itself - external, via
   extLink, so it carries the same target, rel and referrer policy as every
   other outbound link here rather than a hand-rolled anchor.

   A finding with no usable source URL still renders, as a row that is not a
   link: the finding is true whether or not we can point at it. */
function compoundRow(c, label) {
  const src = c.sources?.[0];
  const inner = frag(
    h("span", { class: "nbr__text" },
      h("span", { class: "nbr__name" }, c.substances?.[0] || c.headline),
      h("span", { class: "nbr__sub nbr__sub--wrap" },
        `${label[c.region] || "United States"} · ${monthOf(c.eventDate)}`)));
  return src?.url ? extLink(src.url, inner, "nbr") : h("div", { class: "nbr nbr--flat" }, inner);
}

/* Oldest to newest, with the year said once if both ends share it. */
function monthRange(months) {
  if (!months.length) return "";
  if (months.length === 1) return months[0];
  const lo = months[months.length - 1], hi = months[0];
  const loYear = lo.slice(lo.lastIndexOf(" ") + 1);
  const hiYear = hi.slice(hi.lastIndexOf(" ") + 1);
  return loYear === hiYear
    ? `${lo.slice(0, lo.lastIndexOf(" "))} – ${hi}`
    : `${lo} – ${hi}`;
}

/* The program prints "synthetic cathinone", lowercase, mid-sentence. At the
   head of a row it wants a capital and nothing else changed - not title case,
   which would restyle a term we are quoting. */
function sentenceCase(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

const UNCLASSED = "Not classified by the program";

/* "March 2026" from an ISO date, for a row that already carries a place. */
function monthOf(iso) {
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(+d) ? "" : d.toLocaleDateString("en-US",
    { month: "long", year: "numeric", timeZone: "UTC" });
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
    /* iOS ASKS TWICE, AND THE SECOND ONE LOOKS LIKE A TRICK.
     *
     * In the packaged app WKWebView runs the page on capacitor://localhost, so
     * after the app's own permission sheet iOS shows a SECOND, per-origin one:
     * “localhost” would like to use your current location. Nothing on screen
     * connects that word to this app, and in an app whose promise is that
     * nothing leaves the device, a box naming a website is precisely what a
     * careful person declines - and then Near me does nothing, forever, with
     * no way back from inside the app. Reproduced on an iPad, which is where
     * it was reported.
     *
     * Saying it before it happens is the whole fix available from here. The
     * real fix is the native geolocation plugin, one prompt with the app's own
     * name on it, and it needs a working pod install. */
    /* ONLY WHEN THERE IS GOING TO BE A PROMPT.
     *
     * This warning is worth showing exactly once - before the two sheets
     * appear - and it is noise afterwards. With permission already granted
     * getCurrentPosition resolves immediately, so the line was painted and
     * overwritten by "Matching coordinates" in the same breath: a flash of
     * text about prompts that were never going to appear. Reported as text
     * that pops up and vanishes on tapping Near me.
     *
     * permissions.query is the only way to ask without triggering anything.
     * Where it is missing or throws - it is not universal, and Safari has
     * historically been patchy about the geolocation name - the state is
     * unknown and the warning still shows, because the failure that matters
     * is somebody declining the "localhost" box, not a redundant sentence. */
    let permission = null;
    try {
      permission = (await navigator.permissions?.query({ name: "geolocation" }))?.state ?? null;
    } catch { /* unsupported: fall through to showing it */ }

    if (permission !== "granted") {
      say(data.packaged()
        ? "iOS will ask twice — once for the app, then once for the page. The second one says “localhost”: that is this app, not a website."
        : "Asking your browser for a location…");
    }

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
          ? (data.packaged()
              ? "Location stays off — that is a fine choice. If you meant to allow it, the “localhost” box was this app: iOS remembers a No, so it has to be turned back on in Settings › Nightlight › Location. Searching by name works just as well."
              : "No problem — location stays off. Search by city or county name instead.")
        : err.code === 3
          ? "Location is taking too long. Try again, or search by name."
        : "Your device couldn’t work out where it is — location services may be " +
          "switched off. Search by city or county name instead.", true);
    }

    try {
      say("Matching coordinates to a county on this device…");
      const [{ findCountyFips }, shapes] = await Promise.all([
        import("../locate.js"),
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
  if (!c) return empty("That county code isn’t one we have.", "Search by name instead.");

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
  /* A MODULE THAT VANISHED UNDERNEATH A LIVE SESSION.
   *
   * This removed the map and said nothing. That is right for a map that cannot
   * draw - the canvas is never the only route to anything here - but wrong for
   * the case that actually happens. The shell's files are served under
   * content-hashed names; a deploy renames them; a session open across that
   * deploy asks for a map chunk that no longer exists. The county page itself
   * renders, because its own chunk is already loaded, so the reader gets their
   * county with the map simply absent - reported exactly that way, and fixed
   * by the reader refreshing and finding it there.
   *
   * A LINE AND A BUTTON, NOT AN AUTOMATIC RELOAD. The router self-heals a
   * missing VIEW chunk by reloading once, guarded by a marker in history.state
   * - but that marker is cleared by any clean render, and this failure happens
   * AFTER the render it would clear on. Wiring the same recovery here risks a
   * page that reloads, renders, fails, and reloads again. So the reader is
   * told, and given the action, and decides.
   *
   * Only when the map never mounted. Once it has drawn, a later error leaves
   * what is on screen alone rather than replacing a working map with a notice. */
  import("../map.js").then(({ mountMap }) =>
    mountMap(mapHost, { go, focus: fips, focusLabel: `${c.name}, ${c.state}`, compact: true })
  ).catch(() => {
    if (mapHost.querySelector("canvas")) return;
    clear(mapHost);
    mapHost.className = "map map--inline map--failed";
    mapHost.appendChild(
      h("p", { class: "sec__note" },
        "The map didn’t load. ",
        h("button", {
            type: "button", class: "btn btn--ghost btn--sm",
            onClick: () => location.reload(),
          }, "Reload")));
  });

  /* Numbers for this county. The mortality data was already bundled and drawn
     as map SHADING, which tells you "darker than next door" and nothing else -
     a reader could not learn whether their own county was getting better or
     worse. Appended asynchronously so a slow or missing bundle never delays
     the alerts.

     BELOW "In {county}", not above it. A death statistic was the first thing
     under the map, so the local alerts a reader clicked through for sat under
     a mortality card. The card is real information and stays on the page; it
     is just no longer the lead. The host is appended AFTER the "In {county}"
     section below, with its height reserved (.mortslot) so the card dropping
     in when the bundle resolves does not shove the sections beneath it down. */
  const statsHost = h("div", { class: "mortslot" });

  wrap.appendChild(
    h("div", { class: "chips", role: "group", "aria-label": "Time window" },
      WINDOWS.map((w) =>
        h("button", {
          type: "button", class: "chip", "aria-pressed": String(w.d === win),
          onClick: () => go(`#/alerts/${fips}/${w.d}`),
        }, w.label)))
  );

  const [mine, near, statewide] = await Promise.all([
    data.alertsFor(fips, win),
    data.alertsNearby(fips, win),
    data.alertsStatewide(c.state, win),
  ]);

  /* ---- what changed since last time ---- */
  const fresh = freshLine([...mine, ...near], win, c);
  if (fresh) wrap.appendChild(fresh);

  /* ---- this county ---- */
  wrap.appendChild(
    section(`In ${c.name}`, `${mine.length} in the last ${labelFor(win)}`,
      mine.length
        ? frag(mine.map((k) => card(k)))
        : notHere(c, near.length, win, await data.wasScanned(fips)))
  );

  /* The reserved-height host, filled when the bundle resolves - see the note
     where statsHost is created. It sits here, after the local alerts and
     before statewide, so the numbers a reader came for lead and the death
     statistic follows. */
  wrap.appendChild(statsHost);
  data.mortality().then((m) => {
    const block = mortalityBlock(m, c);
    if (block) statsHost.replaceChildren(block);
  }).catch(() => {});

  /* ---- statewide ----
     UNDER the county block, always, and labelled. A health department warning
     for the whole state is real information for somebody in it — and 23 of the
     app's 25 feeds are state departments, so for most of the country it is the
     only information there is. But it is not a claim about THIS county, and
     the section says so rather than letting proximity imply it. Anything local
     outranks it, which is why it sits here rather than above. */
  if (statewide.length) {
    wrap.appendChild(
      section(`Statewide in ${c.state}`,
        `${statewide.length} in the last ${labelFor(win)}`,
        h("p", { class: "sec__note" },
          "Issued for the whole state, not for " + c.name + " specifically."),
        frag(statewide.map((k) => card(k))))
    );
  }

  /* ---- bordering counties ---- */
  const nbrs = await data.neighbors(fips);
  const counts = new Map();
  for (const k of near) counts.set(k._county.fips, (counts.get(k._county.fips) || 0) + 1);

  wrap.appendChild(
    section(
      "Bordering counties",
      `${nbrs.length} border ${c.name}`,
      h("p", { class: "sec__note" },
        "Supply moves across county lines. Nearest first."),
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
            "We have no public lab results for this area. Most of the country has " +
            "no public drug-checking coverage — no result here does not mean " +
            "nothing is circulating."))
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
function notHere(c, nearCount, win, everScanned) {
  const nearLine = nearCount
    ? h("p", null, `There ${nearCount === 1 ? "is" : "are"} ${nearCount} alert${nearCount === 1 ? "" : "s"} in bordering counties — see below.`)
    : null;

  /* Two different facts, and the app used to show the first for both.
     A full sweep of the country takes weeks at 19 cold counties a run, so for
     most of the map nobody has looked yet - and "nothing published here" is a
     claim the app cannot support about a county it has never scanned. Saying
     so is the same rule the rest of this file already keeps: no information is
     not no risk, and the reader is owed the difference. */
  if (!everScanned) {
    return callout("warn", `We haven’t got to ${c.name} yet`,
      h("p", null,
        "Working through every county in the country takes weeks. This is a gap " +
        "in what we have looked at, not something we found about the supply here."),
      h("p", null,
        "The counties next door are worth a look, and so is anything your local " +
        "health department puts out."),
      nearLine);
  }

  return callout("warn", `Nobody has published anything for ${c.name} in the last ${labelFor(win)}`,
    h("p", null,
      "That does not mean the supply here is safe. Most changes in a local drug " +
      "supply are never announced by anyone, and the reporting that does happen " +
      "runs weeks behind. Read this as “no information”, not “no risk”."),
    nearLine);
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

/* ============================================================ everywhere == */

/* How many to show before offering the rest. Enough that a quiet week is the
   whole picture and the reader never needs to expand, short enough that a bad
   one does not bury the search box this page exists for. */
const NATIONAL_PREVIEW = 8;
/* TWELVE MONTHS, NOT NINETY DAYS.
 *
 * The 90-day default was the honest choice while this screen had no control:
 * "everywhere else right now" should not quietly include a nine-month-old
 * bulletin. With the window switcher on the section and the count line naming
 * the window it counted, the honesty is in the label rather than in the
 * default - and at 90 days the national list showed one alert out of the two
 * this app holds. A list that hides half of what exists teaches a reader there
 * is nothing to see. */
const NATIONAL_DAYS = 365;

/**
 * Everything published anywhere, on the screen someone lands on.
 *
 * This costs no request. The alerts bundle is national and every screen
 * already loads it, which is the same fact the privacy promise rests on:
 * asking for one county's alerts and asking for all of them are the same
 * request, so the app cannot learn which county a reader cares about.
 *
 * The empty state is the point of the section, and it is the state this will
 * be in most of the time. "Nothing anywhere" is a more dangerous sentence than
 * "nothing in your county", because it invites the reader to conclude the
 * supply is quiet nationally when what it measures is that a couple of hundred
 * of 3,231 counties have been scanned recently and most local supply changes
 * are never published by anyone. So what was actually looked at goes on the
 * screen beside the zero.
 */
async function everywhere({ data }, { limit = 0, days = NATIONAL_DAYS, control = null, onWiden = null, note = null } = {}) {
  const all = await data.alertsAll(days);
  const cov = await data.coverage();
  const scannedN = Number(cov.countiesScanned) || 0;

  /* THE SUBTITLE IS WHEN THIS DATA IS FROM, not how much of it there is.
   *
   * It used to be a count - "2 published anywhere in the country in the last 12
   * months" - which restated what the list underneath already shows, in the one
   * slot on this screen where a reader is deciding whether to trust what they
   * are looking at. The date and the way to ask for a newer one had their own
   * paragraph further up, above the search box, where it read as a caption on
   * the screen rather than on the alerts. It belongs to this section, so it
   * sits under this section's heading.
   *
   * The empty case loses nothing: the callout below already says the window,
   * what was scanned, and why a zero is not the same as nothing happening. */
  const head = h("div", { class: "county-head" },
    h("h2", null, t("alerts.everywhereTitle")),
    note || h("p", { class: "sec__note" },
      all.length
        ? t("alerts.everywhereCount", { count: all.length, window: labelFor(days) })
        : t("alerts.everywhereIntro")));

  /* Under the heading, not above it.
     The window control belongs to this section, and floating it above the
     section title made it read as a control over the search box directly
     above - and sat a chip row hard against an h2 with no air between them. */
  if (control) head.appendChild(control);

  /* WHETHER TO RAISE THE DEFAULT, ANSWERED WITHOUT RAISING IT.
   *
   * The tempting fix for an empty-looking list is a longer default window, and
   * it is the wrong one: every count line here names a window, and a
   * nine-month-old bulletin folded silently into a 90-day count would make the
   * app's freshest claim its least true one. The honest version of the same fix
   * is to say what a longer window would add and let the reader ask for it.
   *
   * Counted, not guessed - the bundle is already loaded, so this costs nothing
   * and can never advertise alerts that are not there. */
  let widen = null;
  if (onWiden && days < 365) {
    const wider = await data.alertsAll(365);
    const more = wider.length - all.length;
    if (more > 0) {
      widen = h("p", { class: "sec__note widen" },
        h("button", { type: "button", class: "btn btn--ghost", onClick: () => onWiden(365) },
          `${more} more published in the last 12 months`));
    }
  }

  if (!all.length) {
    return h("div", { id: "sec-everywhere" }, head,
      callout("warn", t("alerts.everywhereNoneTitle", { window: labelFor(days) }),
        h("p", null, t("alerts.everywhereNoneBody")),
        scannedN ? h("p", null, t("alerts.everywhereNoneScanned", { count: scannedN })) : null),
      widen);
  }

  const wrap = h("div", { id: "sec-everywhere" }, head,
    h("div", null, all.slice(0, limit || all.length).map((k) => card(k, true))),
    widen);

  if (!limit || all.length <= limit) return wrap;

  /* Expands in place rather than routing to a page of its own. A separate
     page needs an h1, and these cards are h3 because on a county page they
     sit under a section's h2 - so that page's outline ran h1 straight to h3
     and the only way to fill the gap was a heading invented to fill it.
     Expanding here keeps the outline this section already has.

     Focus moves to the first card that appeared, because otherwise the button
     vanishes from under the pointer and a screen reader is left on a control
     that no longer exists with no way to tell whether anything happened. */
  const rest = h("div");
  const more = h("p", { class: "sec__note" });
  more.appendChild(h("button", {
    type: "button", class: "btn btn--ghost",
    onClick: () => {
      for (const k of all.slice(limit)) rest.appendChild(card(k, true));
      more.remove();
      const first = rest.querySelector("h3");
      if (first) { first.setAttribute("tabindex", "-1"); first.focus(); }
    },
  }, t("alerts.everywhereSeeAll", { count: all.length })));

  wrap.appendChild(rest);
  wrap.appendChild(more);
  return wrap;
}

/* ================================================================= card == */

function card(k, showCounty = false) {
  const isLab = k.kind === "lab";

  return h("div", { class: `card card--${k.severity} card--age-${ageBand(k.eventDate)}` },
    h("div", { class: "card__top" },
      sevBadge(k.severity),
      isLab ? badge("Lab result", "neutral") : null,
      /* The distance is only meaningful relative to a county the reader
         picked. On the national list there is no "here" to be near, so the
         badge is the place alone rather than a distance from nowhere. */
      showCounty && k._county
        ? badge(
            k._mi == null
              ? `${k._county.name}, ${k._county.state}`
              : `${k._county.name}, ${k._county.state} · ${k._mi} mi`,
            "neutral")
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

  /* Population is a public fact about the place and is worth stating even when
     the death count is withheld — it is also the thing that tells somebody
     whether a withheld count of "under 10" is a small number or a tiny one. */
  const pop = typeof rec?.pop === "number" ? rec.pop : null;
  const people = pop === null ? null
    : h("p", { class: "sec__note" }, `${pop.toLocaleString("en-US")} people live here.`);

  if (!rec || typeof rec.n !== "number") {
    return h("div", { class: "card mort" },
      h("h3", null, "Overdose deaths here"),
      h("p", { class: "sec__note" },
        "Not published for this county. Counts between 1 and 9 are withheld to protect " +
        "privacy, so no number is not the same as no deaths."),
      people);
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

  /* THE RATE, because the count alone invites a comparison it cannot support.
     964 deaths in Cook County and 65 in Kent County, Delaware reads as one
     place being fifteen times worse. Per head, Kent is nearly twice Cook. A
     reader looking up their own county is doing that comparison whether or not
     the page helps them, so the page should give them the number that makes it
     valid. Rounded to one decimal, the precision every published overdose rate
     uses. */
  const rate = pop ? (now / pop) * 100000 : null;

  return h("div", { class: "card mort" },
    h("h3", null, "Overdose deaths here"),
    h("p", { class: "mort__n" }, `${now}`),
    h("p", { class: "mort__unit" },
      `in the 12 months to ${asOf || "the latest published date"}, in ${county.name}`),
    rate !== null
      ? h("p", { class: "mort__rate" },
          h("strong", null, `${rate.toFixed(1)} per 100,000`),
          ` — ${pop.toLocaleString("en-US")} people live here`,
          /* Connecticut, and anywhere else the Census stops counting the way
             the CDC still reports. The denominator is from a different year
             than every other county's, which is a small difference and not one
             to hide inside a number that looks identical to its neighbours'. */
          rec.popYear ? h("span", { class: "sec__note" }, ` (${rec.popYear} count)`) : null)
      : people,
    trend,
    /* The caveats are not small print. A provisional count that revises upward
       is the difference between "it is improving" and "we do not know yet". */
    h("p", { class: "sec__note" },
      "Provisional CDC counts. They lag by months and are revised upward as investigations " +
      "close, so the most recent figure is usually an undercount. Deaths are counted where " +
      "they happened, which is not always where the person lived."),
    prior !== null && (now < 20 || prior < 20)
      ? h("p", { class: "sec__note" },
          "Small numbers move a lot on chance alone — treat one year against one year " +
          "as a hint, not a trend.")
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
