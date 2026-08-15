/* Marks the document as the packaged app, before the body paints.
 *
 * WHY A SEPARATE FILE LOADED BLOCKING IN <head>, which is not free: the boot
 * splash is markup so it is on screen at first paint, and it must appear ONLY
 * in the TestFlight/App Store build. That means the decision has to be made
 * before the body renders, or the web gets a flash of a splash it is not
 * supposed to have. A class set by app.js is far too late — that runs after
 * the module graph parses. The CSP has no unsafe-inline, so this cannot be an
 * inline <script>; a same-origin file is the only way to run code that early.
 *
 * The PROTOCOL rather than the Capacitor bridge. data.js:packaged() already
 * uses exactly this test, and it is true the instant the document exists,
 * whereas globalThis.Capacitor depends on the native layer having injected its
 * bridge script first — an ordering this file must not rely on.
 *
 * Kept in step with data.js:packaged() by a test.
 */
if (location.protocol === "capacitor:" || location.protocol === "ionic:") {
  document.documentElement.classList.add("is-packaged");
}
