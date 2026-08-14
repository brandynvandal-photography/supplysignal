/* Boot, routing, and the two controls that exist purely for reader safety:
 * Quick Exit and the no-storage default. */

import { h, clear, skeleton } from "./ui.js";
import * as data from "./data.js";
import * as i18n from "./i18n.js";
import { markVisit } from "./seen.js";
import { mountKindBar } from "./kindness.js";
import * as R from "./routes.js";
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

/* Quick Exit behaves differently in a native shell, and the difference is not
   cosmetic - it is the one control somebody uses because a person walked into
   the room.

   ON THE WEB, replacing location with a neutral site IS the exit: the tab
   becomes a weather page and Nightlight is gone from the screen and from Back.

   IN A WKWEBVIEW that is worse than doing nothing. Capacitor intercepts an
   external navigation and hands it to the system browser, so tapping Exit
   opens Safari IN FRONT of the app - and Nightlight is still running behind
   it, still on screen the moment Safari is dismissed, and still showing a drug
   page in the app switcher. The control that exists to hide the app would
   announce it.

   So on native: wipe, reset the visible screen to something innocuous FIRST
   (so the app-switcher snapshot is not a drug page), then ask the platform to
   background the app. The app-switcher card is why the reset has to happen
   before the background call, not after.

   `exitApp` is Capacitor's own API and does not violate the "no third-party
   requests" rule - nothing is fetched. If the plugin is absent the code falls
   through to the web path, which is wrong-but-harmless rather than broken. */
function isNative() {
  return Boolean(globalThis.Capacitor?.isNativePlatform?.());
}

/* Broadcast so the search panel — which owns its own close() inside a later
   block — can clear itself without app.js reaching into its internals. A
   typed query is the single most revealing thing on screen. */
const PANIC = "nl:panic";

document.getElementById("exit").addEventListener("click", async () => {
  /* Clear the visible screen FIRST, and synchronously.
   *
   * Everything below is asynchronous or slow enough to lose a race with the
   * platform's app-switcher snapshot. On native, the previous version reset
   * the route but left the search panel open with the typed drug still in the
   * input, so the snapshot the OS kept showed the query and its result cards.
   * On the web the panel would carry over into the weather site's paint. */
  try { document.dispatchEvent(new CustomEvent(PANIC)); } catch {}
  try { window.scrollTo(0, 0); } catch {}

  try { localStorage.clear(); } catch {}
  try { sessionStorage.clear(); } catch {}

  /* Unregister before deleting the caches: a live worker can re-commit files
     behind the delete, and the REGISTRATION is itself the durable trace — it
     names nightlight.help in the browser's site-data and service-worker
     listings, and it survived Quick Exit, the pagehide wipe and a restart.
     Nothing in the repo called unregister() at all. */
  try {
    const regs = await navigator.serviceWorker?.getRegistrations?.() || [];
    await Promise.all(regs.map((r) => r.unregister().catch(() => {})));
  } catch {}
  try {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k).catch(() => {})));
  } catch {}

  if (isNative()) {
    /* Neutral screen before backgrounding, so the app-switcher thumbnail is
       Heat and water - a real page about drinking water in the heat, which
       reads as nothing in particular to somebody glancing at a phone. */
    try {
      history.replaceState(null, "", toUrl("#/heat"));
      await route();
    } catch {}

    /* Capacitor's plugin methods return promises, so a native-side failure
       rejects ASYNCHRONOUSLY and a synchronous try/catch never sees it. The
       old code also returned unconditionally after trying, so when the plugin
       was missing entirely the handler exited before the web fallback and the
       app simply stayed on screen. Await each, and fall through if both fail. */
    const app = globalThis.Capacitor?.Plugins?.App;
    try { if (app?.exitApp) { await app.exitApp(); return; } } catch {}
    try { if (app?.minimizeApp) { await app.minimizeApp(); return; } } catch {}
    /* Deliberately no `return`: if the platform will not background us, the
       web path below is a worse exit than leaving, but it is an exit. */
  }

  /* Collapse the back stack.
   *
   * go() pushes an entry per navigation and each carries the reader's
   * selection in the fragment, so Back walked straight back into the app and
   * into the county they looked at. replaceState only ever rewrote the
   * CURRENT entry. There is no API that can delete history entries, so this
   * walks back over them first - each go(-1) lands on an entry we then
   * overwrite - and only then leaves.
   *
   * It is a mitigation, not a guarantee, which is why the copy no longer
   * claims otherwise: a private window is the only way to leave no entry. */
  try {
    const depth = Math.min(history.length - 1, 25);
    history.replaceState(null, "", "/heat");
    for (let i = 0; i < depth; i++) {
      history.go(-1);
      history.replaceState(null, "", "/heat");
    }
  } catch {}

  location.replace("https://weather.com/");
});

/* ---------------------------------------------------------------- routing
 *
 * The SECTION is in the path (/alerts, /test). Everything a reader SELECTS -
 * a county, a substance - stays in the fragment.
 *
 * That split is not cosmetic. A path is transmitted and lands in the host's
 * access log; a fragment never leaves the browser. PRIVACY.md section 1 calls
 * a log containing "IP -> 47065" a disaster and section 3 promises county and
 * substance live after the #. So /alerts is loggable and /alerts#/47065 is
 * not, and nothing user-selected may ever move left of that #.
 */

/* The URL scheme lives in routes.js, pure and testable. Everything below just
   feeds it the real location and makes the history calls. */
const pathRouting = () => !isNative();
const parseRoute = () => R.parseRoute(location, pathRouting());
const toUrl = (hash) => R.toUrl(hash, pathRouting());

const here = () => location.pathname + location.hash;

/* replaceState, not a redirect: no request, no history entry, and the back
   button still goes wherever they came from. See routes.js canonicalUrl. */
function canonicalize() {
  const want = R.canonicalUrl(location, pathRouting());
  if (want && want !== here()) history.replaceState(null, "", want);
}

export function go(hash, replace = false) {
  const url = toUrl(hash);
  if (!pathRouting()) {
    if (location.hash === url) return route();
    if (replace) { history.replaceState(null, "", url); route(); }
    else location.hash = url;
    return;
  }
  if (url === here()) return route();
  /* pushState fires neither popstate nor hashchange, so route() is called
     directly. Back and forward DO fire popstate, which is wired up below. */
  history[replace ? "replaceState" : "pushState"](null, "", url);
  route();
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
  /* Also not a tab. Reached from Staying up, from the nightlife block on Sex,
     and from Learn, because the three audiences for it arrive by different
     doors: someone dancing, someone outside in a heat wave, and someone whose
     medication has quietly stopped them sweating. */
  heat:       () => import("./views/heat.js"),
};

/* Rewrite in-app links to the current URL scheme.
 *
 * Views write href="#/heat" - the language they have always spoken, and the
 * one the native build still uses. Under path routing that string is no longer
 * an address: tapped on /sos it produces /sos#/heat, which parses as the
 * emergency tab with a sub-route of "heat" and renders the emergency page
 * again. Every cross-page pointer in the app broke that way, including three
 * on the emergency page itself - "If they are burning up", "If they are
 * panicking", and "No naloxone yet?" - which are the referrals most likely to
 * be followed by somebody in the middle of an overdose.
 *
 * Rewriting the href rather than only intercepting the click keeps
 * right-click-copy, middle-click and no-JS honest: what the reader copies is
 * the address the page actually lives at. */
function linkify(root) {
  for (const a of root.querySelectorAll?.('a[href^="#/"]') || []) {
    a.setAttribute("href", toUrl(a.getAttribute("href")));
  }
}

/* Belt and braces for anything inserted after render, and so a same-document
   navigation does not cost a round trip. Capture-phase on the document, one
   listener, no per-link bookkeeping. */
document.addEventListener("click", (e) => {
  if (e.defaultPrevented || e.button !== 0) return;
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = e.target.closest?.("a[href]");
  if (!a || a.target === "_blank") return;
  const href = a.getAttribute("href") || "";
  if (href.startsWith("#/")) {
    e.preventDefault();
    go(href);
    return;
  }
  /* An already-rewritten in-app path: route it rather than reloading. */
  if (pathRouting() && /^\/[a-z-]+$/.test(href) && R.PATHS[href.slice(1)]) {
    e.preventDefault();
    go(`#/${R.PATHS[href.slice(1)]}`);
  }
});

let token = 0;

async function route() {
  /* Outside the try below in the original, which is how the native build broke
     on the same input: canonicalUrl returns null when path routing is off, so
     Capacitor never reached canonicalize() and hit this instead. */
  let r;
  try { r = parseRoute(); } catch { r = { tab: "alerts" }; }
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
    linkify(node);
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
let lastRoute = here();

/* Scroll to the top on a real navigation, but NOT when only a filter changed.
 *
 * The 30 / 90 / 12-month chips are hash links, so every tap counted as a
 * navigation and threw the reader back to the top of the county page - away
 * from the very numbers they had just asked to change. Same page, same county,
 * different window is a filter, not a destination.
 *
 * Compared on the route MINUS its trailing window segment, so switching county
 * still scrolls to the top the way arriving anywhere else does. */
const routeIdentity = (url) => String(url).replace(/\/(30|90|365)$/, "");

/* Both events, because the section now moves the PATH and the sub-route moves
   the fragment. A tab change is pushState (popstate on back); picking a county
   is a hash change. Listening to one would half-work in a way that looks like
   an intermittent bug. */
const onNavigate = (fn) => {
  window.addEventListener("hashchange", fn);
  window.addEventListener("popstate", fn);
};

onNavigate(async () => {
  const now = here();
  if (routeIdentity(now) !== routeIdentity(lastRoute)) window.scrollTo(0, 0);
  lastRoute = now;
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
  /* app.name, NOT app.title. index.html ships a bare "Nightlight" behind a
     comment explaining that the title is read by people who are not the
     reader - the tab switcher, history, a handed-over phone - and this line
     was overwriting it with "drug supply alerts and harm reduction" on every
     boot. The decision had been made twice and shipped neither time. */
  document.title = t("app.name");

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
  /* The sticky banner. Short by design - it is 26px of permanent chrome on a
     375px screen, so it carries the warning and the ask and nothing else. The
     full explanation of what "checked against a source" means stays in the
     footer, where there is room for it. */
  const bannerNote = document.getElementById("early-note");
  if (bannerNote) bannerNote.textContent = t("app.earlyBanner");
  const bannerLink = document.getElementById("early-link");
  if (bannerLink) {
    bannerLink.textContent = t("app.earlyBannerCta");
    bannerLink.href = `mailto:${t("app.earlyContact")}`;
  }

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
  onNavigate(sync);
  sync();
}

/* ------------------------------------------------------------------- boot */

(async function boot() {
  await i18n.init();
  applyStrings();

  /* Before the first render, so lastRoute below is seeded with the canonical
     URL rather than the one that is about to be replaced. */
  /* A malformed URL must never stop the app from rendering. routes.js no
     longer throws, and this is the second layer: whatever happens while
     normalising the address, the first paint still happens. */
  try { canonicalize(); } catch { /* leave the URL as it arrived */ }
  lastRoute = here();

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
      kindbar.classList.toggle("is-hidden", parseRoute().tab === "help");
    };
    syncKind();
    onNavigate(syncKind);
  }

  /* The tab bar's hrefs are real paths in the HTML, so right-click-copy and
     middle-click give a shareable URL and the bar still works with no JS.
     Clicking one, though, should not cost a round trip to fetch a document we
     already have - so intercept it and route in place.

     The native build rewrites them to hash links, because there is no server
     under Capacitor to turn /alerts into anything. */
  for (const a of navLinks) {
    const id = a.dataset.tab;
    if (!id) continue;
    a.setAttribute("href", toUrl(`#/${id}`));
    a.addEventListener("click", (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
      e.preventDefault();
      go(`#/${id}`);
    });
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
    /* Absolute path and an explicit root scope. "./sw.js" resolved against
       the document, which is /alerts now, so it asked for a worker at /sw.js
       that does not exist - and even served correctly a worker's scope
       defaults to its own directory, so one at /site/ would control none of
       the pages. netlify.toml sends Service-Worker-Allowed: / to permit the
       wider scope. */
    navigator.serviceWorker.register("/site/sw.js", { scope: "/" }).catch(() => {
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
function reveal(anchor, label, wantRoute) {
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
    /* Stop if the reader has gone somewhere else. Six seconds of polling is
       long enough to tap another tab, and findByText matches on heading TEXT -
       search.json has 13 titles that appear under more than one route, so this
       would force-open and scroll to a same-named heading on the wrong page.
       Compared through routeIdentity so the alerts filter chips, which change
       the hash without changing the destination, do not cancel a real reveal. */
    if (wantRoute && routeIdentity(here()) !== routeIdentity(wantRoute)) return;
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
  const status = document.getElementById("searchstatus");
  let mod = null;

  const close = () => {
    panel.hidden = true;
    btn.setAttribute("aria-expanded", "false");
    input.setAttribute("aria-expanded", "false");
    input.value = "";
    clear(results);
    status.textContent = "";
  };

  /* Quick Exit fires this. The panel clears itself rather than app.js reaching
     into a closure it does not own. */
  document.addEventListener(PANIC, close);

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
    if (!q.trim()) { status.textContent = ""; return; }

    if (!rs.length) {
      /* Into the live region, which survives the next clear(). */
      status.textContent =
        "Nothing matched. Try a drug name, its street name, or what you are " +
        "trying to find out.";
      return;
    }
    status.textContent = "";

    for (const r of rs) {
      /* Both branches were identical. The anchor is applied by reveal()
         after navigation rather than through the URL - see the note there. */
      const href = r.route;
      const a = h("a", { class: "sresult", href, role: "option" },
        h("span", { class: "sresult__kind" }, r.kind),
        h("span", { class: "sresult__label" }, r.label),
        r.why ? h("span", { class: "sresult__why" }, r.why) : null);
      a.addEventListener("click", () => {
        const { anchor, label, route } = r;
        close();
        /* Pass the DESTINATION, not the current hash. reveal() runs from this
           handler BEFORE the hash changes, so capturing location.hash here
           would abort the very navigation it exists to follow. */
        reveal(anchor, label, route);
      });
      results.appendChild(a);
    }
  });
}
