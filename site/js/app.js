/* Boot, routing, and the two controls that exist purely for reader safety:
 * Quick Exit and the no-storage default. */

import { h, clear, skeleton } from "./ui.js";
import * as data from "./data.js";
import * as i18n from "./i18n.js";
import { markVisit } from "./seen.js";
import { mountKindBar } from "./kindness.js";
const { t } = i18n;

const view = document.getElementById("view");
const navLinks = [...document.querySelectorAll(".nav a")];

/* ------------------------------------------------------------------ theme
   Session-scoped, like everything else. sessionStorage dies with the tab, so
   a colour preference cannot become a durable mark that this app was used. */

const THEME_KEY = "ss.theme";
const THEMES = ["auto", "light", "dark"];

function applyTheme(t) {
  if (t === "auto") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", t);
}

let theme = "auto";
try {
  const saved = sessionStorage.getItem(THEME_KEY);
  if (THEMES.includes(saved)) theme = saved;
} catch { /* storage blocked or disabled - fine, stay on auto */ }
applyTheme(theme);

document.getElementById("theme").addEventListener("click", (e) => {
  theme = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
  applyTheme(theme);
  try { sessionStorage.setItem(THEME_KEY, theme); } catch {}
  e.currentTarget.setAttribute(
    "aria-label",
    `Color theme: ${theme}. Activate to change.`
  );
});

/* -------------------------------------------------------- session lifetime
 * Nothing this app writes may outlive the session. Quick Exit still exists,
 * but it is now a shortcut rather than the mechanism - pressing it should
 * never be the difference between leaving a trace and not, because the person
 * most likely to need that guarantee is the one with the least opportunity to
 * press anything.
 *
 * Three parts, because no single one of them is reliable:
 *
 *   1. sessionStorage instead of localStorage. The browser clears it when the
 *      tab closes, with no cooperation from us. This is the only part that
 *      cannot fail.
 *   2. A wipe on `pagehide`, which is the one navigation-away event that fires
 *      dependably on mobile - `unload` does not, and `beforeunload` is worse.
 *   3. A sweep at boot, deleting anything a previous session left behind. This
 *      is what makes the promise survive a browser that was force-quit before
 *      any handler could run. Without it the guarantee is only as good as the
 *      last exit, which is exactly when things go wrong.
 *
 * The cost, stated plainly because it is a real one: the offline cache no
 * longer survives a session, so opening the app cold always needs a network.
 * Within a session, caching still works and Emergency still renders offline.
 */

async function wipeCaches() {
  try {
    if (window.caches?.keys) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch { /* nothing recoverable, and nothing worth surfacing */ }
}

/* Boot sweep. Runs before the service worker is registered below, so a cache
   left by a killed session is gone before it can serve a single response. */
const swept = wipeCaches();

/* `pagehide` covers closing the tab, navigating away, and the browser
   backgrounding the page on iOS. Best-effort by nature: if the process is
   killed outright, part 3 above is what catches it next time. */
window.addEventListener("pagehide", () => {
  try { sessionStorage.clear(); } catch {}
  try { localStorage.clear(); } catch {}   // belt and braces; nothing writes here now
  wipeCaches();
});

/* -------------------------------------------------------------- quick exit
   Wipe what we can, drop this page out of the back button, and leave. The
   browser's own history and HTTP cache are outside our reach - the Help view
   says so rather than implying a guarantee we cannot make. */

document.getElementById("exit").addEventListener("click", () => {
  try { localStorage.clear(); } catch {}
  try { sessionStorage.clear(); } catch {}
  try {
    if (window.caches?.keys) caches.keys().then((ks) => ks.forEach((k) => caches.delete(k)));
  } catch {}

  // Overwrite the current entry so Back does not land here again.
  try { history.replaceState(null, "", "#"); } catch {}
  location.replace("https://weather.com/");
});

/* ---------------------------------------------------------------- routing
   Fragments are never sent to the server, which is why every piece of
   user-selected state lives here rather than in a query string. */

const DEFAULT_DAYS = 90;

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, "");
  const parts = raw.split("/").filter(Boolean).map(decodeURIComponent);

  // Legacy links published before the app grew sections: #/47065 and
  // #/47065/30. Keep them working - they are in RSS feeds and shared messages.
  if (/^\d{5}$/.test(parts[0] || "")) {
    return { tab: "alerts", fips: parts[0], days: Number(parts[1]) || DEFAULT_DAYS };
  }

  const tab = parts[0] || "alerts";
  if (tab === "alerts") {
    if (parts[1] === "map") return { tab, map: true, focus: /^\d{5}$/.test(parts[2] || "") ? parts[2] : null };
    return { tab, fips: /^\d{5}$/.test(parts[1] || "") ? parts[1] : null,
             days: Number(parts[2]) || DEFAULT_DAYS };
  }
  // `sub` carries a second segment, currently only #/substances/class/<slug>.
  return { tab, id: parts[1] || null, sub: parts[2] || null };
}

export function go(hash, replace = false) {
  if (location.hash === hash) return route();
  if (replace) { history.replaceState(null, "", hash); route(); }
  else location.hash = hash;
}

const VIEWS = {
  alerts:     () => import("./views/alerts.js"),
  test:       () => import("./views/test.js"),
  substances: () => import("./views/substances.js"),
  support:    () => import("./views/support.js"),
  emerging:   () => import("./views/emerging.js"),
  learn:      () => import("./views/learn.js"),
  policy:     () => import("./views/policy.js"),
  supervision: () => import("./views/supervision.js"),
  sex:        () => import("./views/sex.js"),
  stimulants: () => import("./views/stimulants.js"),
  about:      () => import("./views/about.js"),
  help:       () => import("./views/help.js"),
  /* Not a tab. Reached from Support and from the foot of Emergency - the two
     places someone is standing when the question occurs to them. The tab bar
     is already at six on a 375px screen and a seventh would truncate them all. */
  after:      () => import("./views/after.js"),
};

let token = 0;

async function route() {
  const r = parseHash();
  const tab = VIEWS[r.tab] ? r.tab : "alerts";
  const mine = ++token;

  for (const a of navLinks) {
    if (a.dataset.tab === tab) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  }

  view.setAttribute("aria-busy", "true");
  clear(view).appendChild(skeleton(3));

  try {
    const mod = await VIEWS[tab]();
    if (mine !== token) return;                 // a newer navigation won
    const node = await mod.render(r, { go, data });
    if (mine !== token) return;
    clear(view).appendChild(node);
  } catch (err) {
    if (mine !== token) return;
    clear(view).appendChild(
      h("div", { class: "empty" },
        h("h3", null, t("app.loadFailed")),
        h("p", null, t("app.loadFailedHint")))
    );
    console.error(err);
  } finally {
    if (mine === token) view.setAttribute("aria-busy", "false");
  }
}

/* Focus lands on the heading of the new view, not the top of the document, so
   a screen-reader user is not re-read the header and nav on every navigation. */
function focusView() {
  const target = view.querySelector("h1, h2") || document.getElementById("main");
  if (!target) return;
  if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
  target.focus({ preventScroll: true });
}

/* Every screen opens at its top.
 *
 * Without this, tapping a tab while halfway down a long page landed you
 * halfway down the NEXT one - on Drugs that is somewhere in the middle of the
 * class grid, with no heading in sight and no way to tell what you are looking
 * at. The browser was doing what it does for a single document; this is six
 * documents wearing one URL.
 *
 * Scrolled BEFORE the render so the skeleton is seen from the top rather than
 * the page jumping under a finger after content lands. Instant, never smooth:
 * a navigation is not a journey, and animating it would mean watching the old
 * page leave.
 *
 * The jump chips are buttons and do not touch the hash (see jumpNav in ui.js),
 * so in-page navigation is unaffected by this. */
if ("scrollRestoration" in history) history.scrollRestoration = "manual";

let first = true;
let lastHash = location.hash;

/* Scroll to the top on a real navigation, but NOT when only a filter changed.
 *
 * The 30 / 90 / 12-month chips are hash links, so every tap counted as a
 * navigation and threw the reader back to the top of the county page - away
 * from the very numbers they had just asked to change. Same page, same county,
 * different window is a filter, not a destination.
 *
 * Compared on the route MINUS its trailing window segment, so switching county
 * still scrolls to the top the way arriving anywhere else does. */
const routeIdentity = (hash) => hash.replace(/\/(30|90|365)$/, "");

window.addEventListener("hashchange", async () => {
  if (routeIdentity(location.hash) !== routeIdentity(lastHash)) window.scrollTo(0, 0);
  lastHash = location.hash;
  await route();
  focusView();
});

document.getElementById("home").addEventListener("click", () => go("#/alerts"));

/* ------------------------------------------------------------------ i18n
   There is deliberately no language switcher. The locale comes from the
   device, which is already correct for almost everyone and is one less
   control on a screen that should feel calm. It also means nothing about
   language is stored - the browser already sends Accept-Language, so this
   adds no signal a server did not have. */

function applyStrings() {
  document.title = t("app.title");

  const skip = document.querySelector(".skip");
  if (skip) skip.textContent = t("app.skipToContent");

  const themeBtn = document.getElementById("theme");
  themeBtn.setAttribute("aria-label", t("app.themeToggle"));
  themeBtn.setAttribute("title", t("app.themeToggle"));

  const exitBtn = document.getElementById("exit");
  exitBtn.setAttribute("aria-label", t("app.quickExit"));

  document.querySelector(".nav").setAttribute("aria-label", t("nav.sections"));
  for (const a of navLinks) {
    const label = t(`nav.${a.dataset.tab}`);
    const ico = a.querySelector(".ico");
    clear(a);
    if (ico) a.appendChild(ico);
    /* The label is an ELEMENT, not a bare text node. A text node cannot carry
       overflow/text-overflow, so at large Dynamic Type sizes the tab bar had
       no way to truncate and blew the page width out instead. */
    a.appendChild(h("span", { class: "nav__label" }, label));

    /* The visible label was shortened to fit six tabs on a 375px screen, but
       "SOS" is three letters a screen reader spells or mispronounces. The
       accessible name stays the whole word - this is the one tab where being
       understood in half a second decides something. */
    const ariaKey = `nav.${a.dataset.tab}Aria`;
    const aria = t(ariaKey);
    // A missing key returns the key itself (see i18n.js), which is how a tab
    // with no override is told apart from one that has a real string.
    if (aria !== ariaKey) a.setAttribute("aria-label", aria);
    else a.removeAttribute("aria-label");
  }

  /* Says the app clears itself. Without this, the X reads as the ONLY way to
     clear anything - which was true until storage became session-only, and
     leaves someone who forgets to press it worrying for no reason. */
  /* Early access. On a site whose whole claim is that its facts are checked,
     saying "checked is not the same as right" is the honest version of that
     claim - and it gives somebody who spots a dangerous error a way to say so.
     Every page, because an error could be on any of them. */
  const early = document.getElementById("foot-early");
  if (early) {
    clear(early).append(
      h("strong", null, t("app.earlyTitle")), " ", t("app.earlyBody"), " ",
      h("a", { href: `mailto:${t("app.earlyContact")}` }, t("app.earlyContact"))
    );
  }

  const priv = document.getElementById("foot-privacy");
  if (priv) priv.textContent = t("footer.privacy");

  // Footer. The crisis numbers are never translated - they are dialled, not read.
  const disc = document.getElementById("foot-disclaimer");
  clear(disc).append(
    h("strong", null, t("footer.disclaimerLead")), " ", t("footer.disclaimerBody")
  );

  const crisis = document.getElementById("foot-crisis");
  clear(crisis).append(
    t("footer.emergency"), " ", h("strong", null, "911"), " · ",
    t("footer.poisonControl"), " ", h("strong", null, "1-800-222-1222"), " · ",
    t("footer.neverUseAlone"), " ", h("strong", null, "1-800-484-3731"), " · ",
    t("footer.samhsa"), " ", h("strong", null, "1-800-662-4357")
  );
}

/** Counts change with locale (digit grouping), so this re-runs on switch. */
async function renderFooterMeta() {
  const a = await data.alerts();
  /* The count is carried in alerts.json (which every screen already loads) so
     this line does not cost a 172KB gazetteer fetch on five of the six tabs.
     The fallback keeps working on an older bundle generated before the field
     existed - and on Alerts, where counties.json is loaded for search anyway. */
  const n = (a.clusters || []).length;
  const counties = a.countyCount || (await data.counties()).counties.length;
  document.getElementById("foot-meta").textContent =
    t("footer.counties", { counties: i18n.num(counties) }) + " · " +
    t(n === 1 ? "footer.activeAlert" : "footer.activeAlerts", { count: i18n.num(n) }) + " · " +
    (a.generated
      ? t("footer.updated", { date: new Date(a.generated).toISOString().slice(0, 10) })
      : t("footer.awaitingScan"));
}

/* Back to top.
 *
 * These pages are long by necessity - the limitations of a test strip are the
 * part that keeps somebody alive, so they cannot be cut - and on a laptop
 * there is no bottom tab bar to escape to. This is the way back up.
 *
 * DESKTOP ONLY, and that is a deliberate limit rather than an omission: on a
 * phone the bottom bar already owns that corner, and a floating button over
 * the Emergency tab is the last thing that should ever be there.
 *
 * It scrolls AND moves focus to the heading. Scrolling alone would leave a
 * keyboard user's focus stranded at the foot of the page, so the next Tab
 * would drop them back where they started - a button that appears to do
 * nothing for the people most likely to need it.
 */
function mountBackToTop() {
  const wide = window.matchMedia("(min-width: 880px)");
  const btn = h("button", {
    type: "button", class: "totop", hidden: true,
    "aria-label": "Back to top",
    onClick: () => {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
      focusView();
    },
  }, h("span", { "aria-hidden": "true" }, "↑"));

  document.body.appendChild(btn);

  /* One rAF-throttled read per frame at most. A scroll handler that measures
     on every event is how a long page starts stuttering on a cheap laptop. */
  let ticking = false;
  const sync = () => {
    ticking = false;
    // Roughly one screenful down: far enough that "top" is genuinely lost.
    const show = wide.matches && window.scrollY > window.innerHeight * 0.8;
    btn.toggleAttribute("hidden", !show);
  };
  window.addEventListener("scroll", () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(sync);
  }, { passive: true });

  wide.addEventListener?.("change", sync);
  window.addEventListener("hashchange", sync);
  sync();
}

/* ------------------------------------------------------------------- boot */

(async function boot() {
  await i18n.init();
  applyStrings();

  await route();

  /* The kindness bar: rendered once, above the content, and never touched
     again. Two rules it has to keep at the top of the screen that it did not
     have to keep at the bottom:
       - It is never on Emergency. Nothing may sit between someone and the
         overdose steps, however kind it is.
       - It cross-fades rather than scrolling, slowly. Peripheral vision is
         drawn far more by movement than by a change in opacity, and this app
         gets opened with other people in the room. See kindness.js.

     TURNED OFF 2026-08-12, on purpose and reversibly. It occupies the most
     valuable strip on every screen - directly above the content, on the first
     screenful - and the open question is whether that space earns more as
     warmth or as content. Flip this to true to bring it back; nothing else
     needs changing, and kindness.js is untouched so the lines and their
     rules survive the experiment either way. */
  const KIND_BAR = false;

  const kindbar = document.getElementById("kindbar");
  if (kindbar && KIND_BAR) {
    /* Mounted ONCE. Navigation toggles visibility with a class rather than
       re-rendering, so the cycle keeps its own rhythm instead of restarting
       every time someone touches a tab - a bar that reset on navigation would
       flash a new line on every screen change, which is the jumpy behaviour
       the slow fade exists to avoid. */
    const inner = document.createElement("div");
    kindbar.appendChild(inner);
    mountKindBar(inner);

    const syncKind = () => {
      // Never on Emergency: nothing sits between someone and the overdose steps.
      kindbar.classList.toggle("is-hidden", parseHash().tab === "help");
    };
    syncKind();
    window.addEventListener("hashchange", syncKind);
  }

  mountBackToTop();

  /* Stamp this visit only after the first render, so the screen the reader is
     looking at is still measured against their PREVIOUS visit. seen.js captures
     the old value at import time, so ordering here is belt and braces. */
  markVisit();

  /* Offline support - production only. On localhost a service worker would
     re-create the exact stale-preview problem the no-store dev server exists
     to kill (see scripts/dev-server.mjs), so it never registers there.

     AWAITED ON THE BOOT SWEEP. Registering while the sweep is still deleting
     would race it: the worker could repopulate a cache the sweep had not
     reached yet, and last session's shell would survive the wipe that exists
     to remove it. Offline caching is an enhancement; the wipe is a promise. */
  await swept;

  const isDev = ["localhost", "127.0.0.1"].includes(location.hostname);
  if ("serviceWorker" in navigator && !isDev) {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      /* Offline support is an enhancement; failing to get it is not an error
         worth surfacing to someone mid-crisis. */
    });
  }
  if (first) first = false;

  /* The footer meta needs counties.json - 172KB - to render one number: how
     many counties exist. It is below the fold on every screen and nobody has
     ever come here for it, so it must never compete for bandwidth with the
     view someone actually asked for. Deferred to idle; on a page that needs
     counties.json anyway (Alerts search) this costs nothing, and on the other
     five it stops a sixth of a megabyte from racing the content.

     Not awaited: boot is finished either way. */
  const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 1200));
  idle(() => { renderFooterMeta().catch(() => {}); });
})();


/* Land on the SECTION, not just the page.
 *
 * An id is used when the index has one, but most destinations do not have one:
 * section ids are assigned in the view code, while the index is built from the
 * data files, so they cannot all be known ahead of time. The fallback is to
 * find the heading whose text IS the result label - which works regardless,
 * because the label came from that heading in the first place.
 *
 * Polled rather than fired once on a timer: views render asynchronously and
 * several await a bundle first, so a fixed delay either fires too early or
 * makes every result feel slow.
 */
function reveal(anchor, label) {
  const want = String(label || "").trim().toLowerCase();
  let tries = 0;

  const findByText = () => {
    const nodes = document.querySelectorAll(
      "#view h1, #view h2, #view h3, #view h4, #view summary");
    for (const n of nodes) {
      if (n.textContent.trim().toLowerCase() === want) return n;
    }
    return null;
  };

  /* Resolve to the HEADING, never a container.
     An id points at a wrapper div, and scrolling that lands the div's top edge
     at the top of the viewport - the right pixel, but the wrong thing to be
     looking at, because the reader arrives staring at whatever the section
     opens with instead of at its title. Always end on the heading itself. */
  const toHeading = (el) => {
    if (!el) return null;
    if (/^H[1-4]$/.test(el.tagName) || el.tagName === "SUMMARY") return el;
    return el.querySelector("h1, h2, h3, h4, summary") || el;
  };

  const tick = () => {
    const el = toHeading((anchor && document.getElementById(anchor)) || findByText());
    if (el) {
      /* Open the target and every disclosure above it - landing on something
         still collapsed looks exactly like the result did nothing. */
      if (el.tagName === "DETAILS") el.open = true;
      for (let p = el; p; p = p.parentElement) {
        if (p.tagName === "DETAILS") p.open = true;
      }
      /* Scroll the heading's own block, so the heading is what arrives at the
         top rather than the middle of the text under it. */
      const target = el.tagName === "SUMMARY" ? el.parentElement : el;
      /* Instant, not smooth, when the target is a long way down.
         A smooth scroll across eleven thousand pixels either takes seconds or
         gets abandoned partway, and either way the reader is left watching the
         page move instead of reading the thing they asked for. Smooth is only
         worth it when the distance is short enough to be legible as motion. */
      const far = Math.abs(target.getBoundingClientRect().top) > window.innerHeight * 2;
      target.scrollIntoView({ behavior: far ? "auto" : "smooth", block: "start" });

      /* Then settle. Content above the target can still be arriving - a
         disclosure opening, a deferred block filling in - and each of those
         pushes the heading further down AFTER we have scrolled to it. Landing
         600px short of the thing you asked for reads as the search being
         wrong. Re-checks a few times and corrects only if it actually drifted. */
      let settles = 0;
      const settle = () => {
        const top = target.getBoundingClientRect().top;
        if (Math.abs(top) > 90) target.scrollIntoView({ behavior: "auto", block: "start" });
        if (settles++ < 5) setTimeout(settle, 180);
      };
      setTimeout(settle, 180);
      return;
    }
    /* ~6s of polling. A view that fetches its own bundle on a slow connection
       can take several seconds, and giving up early means the result silently
       does nothing - the worst outcome, because it looks like a broken link. */
    if (tries++ < 50) setTimeout(tick, 120);
  };
  setTimeout(tick, 60);
}

/* Cross-page pointers that name a destination SECTION.
 *
 * A bigptr with data-reveal lands on that section rather than the top of the
 * target page. Delegated at the document level so it works for links inside
 * any view without every view having to wire it up - and because #view is
 * cleared on every navigation, so a per-render listener would be re-added
 * forever. */
document.addEventListener("click", (e) => {
  const a = e.target.closest?.("a[data-reveal]");
  if (!a) return;
  reveal(a.getAttribute("data-reveal"), null);
});

/* ---- search -------------------------------------------------------------
 *
 * Wired here rather than in a view because it belongs to the app rather than
 * to any page. Everything runs on the device - see the note at the top of
 * search.js for why there is no endpoint.
 *
 * Session-only, like everything else: the input is cleared when the panel
 * closes and nothing is written anywhere. No query history, because a list of
 * what someone searched is exactly the artifact this app exists not to create.
 */
{
  const btn = document.getElementById("searchbtn");
  const panel = document.getElementById("searchpanel");
  const input = document.getElementById("searchinput");
  const results = document.getElementById("searchresults");
  let mod = null;

  const close = () => {
    panel.hidden = true;
    btn.setAttribute("aria-expanded", "false");
    input.setAttribute("aria-expanded", "false");
    input.value = "";
    clear(results);
  };

  const open = async () => {
    panel.hidden = false;
    btn.setAttribute("aria-expanded", "true");
    input.focus();
    if (!mod) {
      mod = await import("./search.js");
      mod.prefetch();
    }
  };

  btn.addEventListener("click", () => (panel.hidden ? open() : close()));

  /* Escape closes from anywhere in the panel, which is the behaviour a
     keyboard user expects and the quickest way out on a phone keyboard. */
  panel.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { close(); btn.focus(); }
  });

  let seq = 0;
  input.addEventListener("input", async () => {
    const mine = ++seq;
    const q = input.value;
    if (!mod) mod = await import("./search.js");
    const rs = await mod.search(q);
    if (mine !== seq) return;              // a newer keystroke won

    clear(results);
    input.setAttribute("aria-expanded", String(rs.length > 0));
    if (!q.trim()) return;

    if (!rs.length) {
      results.appendChild(
        h("p", { class: "sec__note" },
          "Nothing matched. Try a drug name, a street name, or what you are " +
          "trying to find out."));
      return;
    }

    for (const r of rs) {
      const href = r.anchor ? `${r.route}` : r.route;
      const a = h("a", { class: "sresult", href, role: "option" },
        h("span", { class: "sresult__kind" }, r.kind),
        h("span", { class: "sresult__label" }, r.label),
        r.why ? h("span", { class: "sresult__why" }, r.why) : null);
      a.addEventListener("click", () => {
        const { anchor, label } = r;
        close();
        reveal(anchor, label);
      });
      results.appendChild(a);
    }
  });
}
