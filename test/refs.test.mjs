/* Every function that gets CALLED must actually exist.
 *
 * Written after a careless edit deleted drawLocated() from map.js while draw()
 * still called it. Nothing caught it: the file parsed, the module imported and
 * every unit test passed, because the throw only happened at the first paint -
 * where the router caught it and replaced the map with "This section could not
 * load." The map was blank on every route it appears on and the suite stayed
 * green.
 *
 * It immediately found a second one that had been shipping for far longer:
 * drawPickSoon(), called in four places and defined nowhere, left behind when
 * the color-indexed pick buffer was replaced by geometric hit testing.
 *
 * Deliberately biased toward false NEGATIVES. It reads the raw source rather
 * than trying to strip comments and strings first - an apostrophe in a comment
 * ("the buffer's margin") is enough to make that kind of stripping eat real
 * code, which is how the first draft of this test managed to report that
 * attributionBlock() was undefined while looking straight at its definition.
 * A name mentioned in a comment may therefore count as defined. That is the
 * right trade: this exists to catch deletions, and a test that cries wolf gets
 * ignored. */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const files = [];
(function walk(dir) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p);
    else if (e.endsWith(".js")) files.push(p);
  }
})("site/js");

/* Keywords that are followed by "(" but are not calls. */
const KEYWORDS = new Set([
  "if","for","while","switch","catch","return","typeof","void","delete","await",
  "yield","new","in","of","do","else","try","throw","case","function","async",
  "super","import","this","instanceof","export","default","let","const","var",
]);

/* Callable globals. */
const GLOBALS = new Set([
  "String","Number","Boolean","Array","Object","Math","JSON","Date","Map","Set",
  "WeakMap","WeakSet","Promise","Error","TypeError","RangeError","Symbol","BigInt",
  "RegExp","Proxy","Reflect","Intl","parseInt","parseFloat","isNaN","isFinite",
  "encodeURIComponent","decodeURIComponent","encodeURI","decodeURI","structuredClone",
  "setTimeout","clearTimeout","setInterval","clearInterval","queueMicrotask",
  "requestAnimationFrame","cancelAnimationFrame","fetch","alert","confirm","prompt",
  "addEventListener","removeEventListener","dispatchEvent","getComputedStyle",
  "matchMedia","btoa","atob","ResizeObserver","IntersectionObserver","MutationObserver",
  "AbortController","URL","URLSearchParams","Headers","Request","Response","FormData",
  "Blob","File","FileReader","Image","Audio","Worker","EventSource","WebSocket",
  "CustomEvent","Event","PointerEvent","KeyboardEvent","MouseEvent","TouchEvent",
  "Notification","Uint8Array","Uint8ClampedArray","Uint16Array","Uint32Array",
  "Int8Array","Int16Array","Int32Array","Float32Array","Float64Array","ArrayBuffer",
  "DataView","TextEncoder","TextDecoder","console","isSecureContext","reportError",
]);


/* Strip comments, strings and regex literals, replacing them with spaces so
   offsets and line numbers survive.

   This is a real character scanner rather than a pile of regexes. The regex
   approach cannot work here: stripping block comments first breaks on a string
   containing "*\/", and stripping strings first breaks on the apostrophe in a
   comment like "the buffer's margin". Both failure modes silently delete real
   code, and the first draft of this test hit the second one - it reported
   attributionBlock() as undefined while its definition sat three lines below
   the comment that ate it. */
function stripNonCode(src) {
  const out = new Array(src.length).fill(" ");
  const keep = (i) => { out[i] = src[i]; };
  let i = 0;
  // Tracks whether a "/" begins a regex literal or is a division operator.
  let prevSignificant = "";

  while (i < src.length) {
    const c = src[i], d = src[i + 1];

    if (c === "\n") { out[i] = "\n"; i++; continue; }

    if (c === "/" && d === "/") {
      while (i < src.length && src[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && d === "*") {
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) {
        if (src[i] === "\n") out[i] = "\n";
        i++;
      }
      i += 2;
      continue;
    }
    if (c === '"' || c === "'") {
      i++;
      while (i < src.length && src[i] !== c) {
        if (src[i] === "\\") i++;
        else if (src[i] === "\n") out[i] = "\n";
        i++;
      }
      i++;
      prevSignificant = "x";
      continue;
    }
    if (c === "`") {
      i++;
      while (i < src.length && src[i] !== "`") {
        if (src[i] === "\\") { i += 2; continue; }
        // ${ ... } holds real code, so scan it rather than blanking it.
        if (src[i] === "$" && src[i + 1] === "{") {
          keep(i); keep(i + 1);
          let depth = 1; i += 2;
          while (i < src.length && depth) {
            if (src[i] === "{") depth++;
            else if (src[i] === "}") depth--;
            keep(i); i++;
          }
          continue;
        }
        if (src[i] === "\n") out[i] = "\n";
        i++;
      }
      i++;
      prevSignificant = "x";
      continue;
    }
    // Regex literal, but only where a value cannot already have ended.
    if (c === "/" && /[(,=:[!&|?{};+\-*%~^<>]|^$/.test(prevSignificant)) {
      i++;
      let cls = false;
      while (i < src.length) {
        if (src[i] === "\\") { i += 2; continue; }
        if (src[i] === "[") cls = true;
        else if (src[i] === "]") cls = false;
        else if (src[i] === "/" && !cls) break;
        else if (src[i] === "\n") break;
        i++;
      }
      i++;
      while (i < src.length && /[a-z]/.test(src[i])) i++;   // flags
      prevSignificant = "x";
      continue;
    }

    keep(i);
    if (!/\s/.test(c)) prevSignificant = c;
    i++;
  }
  return out.join("");
}

const problems = [];
let callSites = 0;

for (const file of files) {
  const src = stripNonCode(readFileSync(file, "utf8"));
  const bound = new Set();
  const add = (re, g = 1) => {
    for (const m of src.matchAll(re)) {
      if (!m[g]) continue;
      for (const t of m[g].matchAll(/[A-Za-z_$][\w$]*/g)) bound.add(t[0]);
    }
  };

  // Declarations.
  add(/\bfunction\s*\*?\s*([A-Za-z_$][\w$]*)/g);
  add(/\bclass\s+([A-Za-z_$][\w$]*)/g);
  add(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g);
  // Imports, including "as" aliases.
  add(/\bimport\s+([^;]+?)\s+from/g);
  // Parameter lists: function (a, b), (a, b) =>, single-arg arrow, catch (e).
  add(/\bfunction\s*\*?\s*[A-Za-z_$][\w$]*\s*\(([^)]*)\)/g);
  add(/\bfunction\s*\(([^)]*)\)/g);
  add(/\(([^()]*)\)\s*=>/g);
  add(/([A-Za-z_$][\w$]*)\s*=>/g);
  add(/\bcatch\s*\(([^)]*)\)/g);
  // Destructured bindings of any shape, including array patterns with objects
  // nested inside them: const [{ findCountyFips }, shapes] = await ...
  add(/\b(?:const|let|var)\s*([[{][\s\S]*?)=[^=]/g);
  // Object method shorthand - add(list) { ... } - which is a definition even
  // though it looks exactly like a call site.
  add(/^\s*([A-Za-z_$][\w$]*)\s*\([^()]*\)\s*\{/gm);
  // Object properties holding functions: name: (x) => ... / name(x) { ... }
  add(/([A-Za-z_$][\w$]*)\s*:/g);

  for (const m of src.matchAll(/(^|[^\w$.?])([A-Za-z_$][\w$]*)\s*\(/gm)) {
    const name = m[2];
    if (KEYWORDS.has(name) || GLOBALS.has(name) || bound.has(name)) continue;
    callSites++;
    problems.push(`${file}: calls ${name}() but nothing defines or imports it`);
  }
}

const seen = [...new Set(problems)];
console.log("REFS\n");
if (seen.length) {
  for (const p of seen) console.log("  not ok " + p);
  console.log(`\n0 passed, ${seen.length} failed`);
  process.exit(1);
}
console.log("  ok   every called function is defined or imported");
console.log(`\n1 passed, 0 failed  |  ${files.length} files`);
