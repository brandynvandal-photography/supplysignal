// The shell, as the build outputs ship it: minified, and on the web hashed.
//
// Shared by scripts/build-site.mjs (dist/, the web deploy) and
// scripts/build-app.mjs (www/, the Capacitor bundle). Neither the dev server
// nor any test reads this file's output for the app's own logic - site/ is the
// source, readable and fully commented, and it is what gets served on
// localhost and imported by the test suite. This module only changes how the
// bytes are PACKED on the way into a build directory; it never changes what
// they do.
//
// WHY MINIFY AT BUILD AND NOT IN THE SOURCE. app.css was 200 KB raw and 62% of
// it was comments, every byte of them render-blocking on a phone; the shell's
// JS was 63 KB of comment for 30 KB of code. Those comments are the most
// valuable thing in the repository - the rules are written where they are
// enforced - and nobody is going to give them up for bytes. So the source
// keeps them and the build strips them. esbuild does the stripping: minify
// only, ES module format, NO bundling. The files stay separate on purpose -
// the service worker's SHELL/WARM lists, the offline test and the CSP all
// reason about files by name, and one bundle would force every reader to
// re-download the whole app for a one-line fix.
//
// WHY HASH (web only). netlify.toml had to mark every shell file no-cache,
// because the names were fixed: a returning reader's browser could not be
// allowed to trust a cached app.js after a deploy. That made every boot a row
// of conditional requests even when nothing had changed. A content hash in
// the name turns that around - a file whose name is its contents can be
// cached forever (Cache-Control: immutable), and a deploy that changes it
// changes the name, so index.html (which stays unhashed and no-cache) is the
// one thing that has to be revalidated. The Capacitor bundle is on local disk
// with no cache between it and the reader, so it gets the minification and
// not the renaming; test/offline.test.mjs resolves its paths by their source
// names.
//
// WHAT IS HASHED: site/js/**, site/css/app.css, and the national data
// bundles (everything under data/ except alerts.json, index.json and
// counties/, which the ingest rewrites and which stay unhashed and no-cache).
// NOT hashed: index.html, sw.js, manifest.webmanifest, img/, w/ - the entry
// points, and the files that have to be found at a known URL.
//
// PRIVACY IS UNCHANGED BY THIS. Every hashed name is a function of a national
// file's bytes, the same for every reader; nothing here is ever keyed by a
// county, a substance or a page. The hashed data bundles live under data/h/
// rather than beside the unhashed ones so the Netlify header rules for the
// two caching regimes never overlap - see netlify.toml.

import { readFile, readdir, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import * as esbuild from "esbuild";

/* ------------------------------------------------------------ utilities */

/** Every file under `dir`, as posix paths relative to `dir`. */
export async function walk(dir, base = dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...await walk(p, base));
    else out.push(path.relative(base, p).split(path.sep).join("/"));
  }
  return out.sort();
}

export async function dirSize(dir) {
  let total = 0;
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    total += e.isDirectory() ? await dirSize(p) : (await stat(p)).size;
  }
  return total;
}

/** Eight hex characters of SHA-256 - the same length sw.js's VERSION uses. */
export const sha8 = (s) => createHash("sha256").update(s).digest("hex").slice(0, 8);

/** `js/views/help.js` + `1a2b3c4d` -> `js/views/help.1a2b3c4d.js` */
export function hashedName(rel, hash) {
  const ext = path.posix.extname(rel);
  return `${rel.slice(0, -ext.length)}.${hash}${ext}`;
}

/* -------------------------------------------------------------- minify */

/* esbuild's transform API, one file at a time. `bundle` is never set, so
   import specifiers come out exactly as they went in - which is what lets the
   hashing pass below rewrite them as plain strings.

   target is left at esnext on purpose: the SOURCE decides which syntax old
   phones get (roundRect is feature-tested, not assumed; see map.js), and a
   lowering pass here would be a second, invisible place that decision was
   made. charset utf8 keeps the em dashes and curly quotes as bytes rather
   than \u escapes: modules are always decoded as UTF-8, and the stylesheet
   and classic scripts inherit the document's charset. */
export async function minifyJs(src, file) {
  const r = await esbuild.transform(src, {
    loader: "js", format: "esm", minify: true, charset: "utf8",
    legalComments: "none", sourcefile: file,
  });
  return r.code;
}

export async function minifyCss(src, file) {
  const r = await esbuild.transform(src, {
    loader: "css", minify: true, charset: "utf8",
    legalComments: "none", sourcefile: file,
  });
  return r.code;
}

/* ------------------------------------------------------------ the shell */

/** Code only: block and line comments removed, so a path quoted in a comment
 *  is never taken for a reference. Same rule the tests use. */
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** The marker each of data.js and i18n.js carries for the data manifest. */
const MANIFEST_MARK = /const HASHED = \{\};/;

/**
 * Stage the shell for a build directory.
 *
 * @param {object} o
 * @param {string}  o.site         absolute path of site/
 * @param {boolean} o.hash         rename js/css by content hash (web only)
 * @param {Object<string,string>} o.data
 *        data manifest: path relative to data/ -> hashed path relative to
 *        data/ (e.g. "substances.json" -> "h/substances.1a2b3c4d.json").
 *        Empty when nothing is hashed.
 * @returns {Promise<{files: Map<string,{out:string, body:Buffer|string}>, renamed: Map<string,string>}>}
 *        files: every file under site/, keyed by its source-relative path,
 *        with the path it should be written to and its final contents.
 *        renamed: source path -> output path for everything that moved.
 */
export async function stageShell({ site, hash, data = {} }) {
  const all = await walk(site);
  const js = all.filter((r) => r.startsWith("js/") && r.endsWith(".js"));
  const css = all.filter((r) => r.startsWith("css/") && r.endsWith(".css"));
  const minified = new Set([...js, ...css]);

  /* 1. Read, inject the data manifest, minify. The manifest goes into the
        SOURCE text before minification, at a marker the two modules carry -
        after minification the constant could have any name or none. */
  const text = new Map();
  for (const rel of all) {
    if (!minified.has(rel) && rel !== "sw.js" && rel !== "index.html") continue;
    let src = await readFile(path.join(site, rel), "utf8");
    if (rel === "js/data.js" || rel === "js/i18n.js") {
      if (!MANIFEST_MARK.test(src)) {
        throw new Error(`${rel} has lost its "const HASHED = {};" marker - the build cannot hand it the data manifest`);
      }
      if (Object.keys(data).length) {
        src = src.replace(MANIFEST_MARK, `const HASHED = ${JSON.stringify(data)};`);
      }
    }
    text.set(rel, src);
  }
  const out = new Map();                      // rel -> final text
  for (const rel of js) out.set(rel, await minifyJs(text.get(rel), rel));
  for (const rel of css) out.set(rel, await minifyCss(text.get(rel), rel));

  /* 2. Every reference one shell file makes to another, read from the SOURCE
        with comments stripped. A reference is a quoted relative path that
        resolves to a real file: against the referring file's own directory
        (import specifiers), against site/ (the WARM list in app.js and SHELL
        in sw.js are written relative to the worker), or "../data/<file>" for
        a data bundle fetched by literal name (map.js's mesh). Anything that
        resolves to nothing is left alone - a string that merely looks like a
        path is not this pass's business. */
  const refs = new Map();                     // rel -> [{spec, kind, target}]
  const LITERAL = /(["'])((?:\.\.?\/)[^"'\n]+?)\1/g;
  for (const rel of [...js, "sw.js"]) {
    const list = [];
    const seen = new Set();
    for (const m of strip(text.get(rel)).matchAll(LITERAL)) {
      const spec = m[2];
      if (seen.has(spec)) continue;
      seen.add(spec);
      const byFile = path.posix.normalize(path.posix.join(path.posix.dirname(rel), spec));
      const bySite = path.posix.normalize(spec);
      if (minified.has(byFile)) list.push({ spec, kind: "site", target: byFile });
      else if (minified.has(bySite)) list.push({ spec, kind: "site", target: bySite });
      else if (spec.startsWith("../data/") && data[spec.slice("../data/".length)]) {
        list.push({ spec, kind: "data", target: spec.slice("../data/".length) });
      }
      /* Anything else - "./index.html" in SHELL, a string that merely looks
         like a path - resolves to nothing hashed and is left exactly as it is. */
    }
    refs.set(rel, list);
  }

  /* 3. Names. A file's hash covers its own minified bytes AND the identity of
        everything it imports, transitively - so when ui.js changes, every
        module that imports it gets a new name too, and a browser holding the
        old app.js can never be handed a new ui.js it was not written against.
        The transitive set is collected as a set (not an order), so an import
        cycle cannot send this round forever. Data references count by their
        hashed name, which already carries the bundle's content. */
  const renamed = new Map();
  if (hash) {
    const own = new Map([...out].map(([rel, body]) => [rel, createHash("sha256").update(body).digest("hex")]));
    const closure = (rel) => {
      const set = new Set();
      const stack = [rel];
      while (stack.length) {
        const cur = stack.pop();
        for (const r of refs.get(cur) || []) {
          if (r.kind === "site" && !set.has(r.target)) { set.add(r.target); stack.push(r.target); }
          if (r.kind === "data") set.add(`data:${data[r.target]}`);
        }
      }
      set.delete(rel);
      return [...set].sort();
    };
    for (const rel of minified) {
      const h = createHash("sha256").update(own.get(rel));
      for (const dep of closure(rel)) h.update(dep.startsWith("data:") ? dep : `${dep}:${own.get(dep)}`);
      renamed.set(rel, hashedName(rel, h.digest("hex").slice(0, 8)));
    }
  }

  /* 4. Rewrite the references to the new names. Exact quoted literals only -
        the same strings step 2 found - so nothing that was not a reference is
        touched. The form of the specifier is kept (./, ../, the directory
        part); only the basename gains the hash. */
  const newSpec = (r) => {
    if (r.kind === "data") return `../data/${data[r.target]}`;
    const to = renamed.get(r.target);
    if (!to) return r.spec;
    return path.posix.join(path.posix.dirname(r.spec), path.posix.basename(to))
      .replace(/^(?!\.)/, "./");              // posix.join drops a leading "./"
  };
  const rewrite = (body, list) => {
    for (const r of list) {
      const to = newSpec(r);
      if (to === r.spec) continue;
      body = body.split(`"${r.spec}"`).join(`"${to}"`).split(`'${r.spec}'`).join(`'${to}'`);
    }
    return body;
  };
  if (hash) {
    for (const rel of js) out.set(rel, rewrite(out.get(rel), refs.get(rel)));
    out.set("sw.js", rewrite(text.get("sw.js"), refs.get("sw.js")));

    /* index.html names shell files as absolute /site/... paths. */
    let html = text.get("index.html");
    for (const [from, to] of renamed) {
      html = html.split(`"/site/${from}"`).join(`"/site/${to}"`);
    }
    out.set("index.html", html);
  }

  /* 5. Assemble. Everything under site/ goes out; minified files as text at
        their (possibly new) names, everything else byte for byte. */
  const files = new Map();
  for (const rel of all) {
    const body = out.has(rel) ? out.get(rel) : await readFile(path.join(site, rel));
    files.set(rel, { out: renamed.get(rel) || rel, body });
  }
  return { files, renamed };
}

/* --------------------------------------------------------- data bundles */

/**
 * Which data files are hashed, which are copied by their own name, and which
 * never ship. Shared by both builds so the two directories cannot disagree
 * about what a dataset is.
 *
 * UNHASHED on purpose:
 *   alerts.json   rewritten by the ingest every few hours and refreshed by
 *                 the packaged app from this exact URL (data.js REMOTE_ALERTS)
 *   index.json    the ingest's scan ledger; only its FIPS list ships, inside
 *                 topics.json (scripts/build-topics.mjs)
 *   counties/     per-county files the client never fetches
 */
export const DATA_UNHASHED = new Set(["alerts.json", "index.json", "counties"]);

/**
 * Plan the data directory for a build.
 *
 * @param {string} dataDir   absolute path of data/
 * @param {object} o
 * @param {Set<string>} o.skip      top-level names that never ship
 * @param {Set<string>} o.topics    the per-topic files folded into topics.json
 * @param {boolean}     o.hash      rename national bundles by content
 * @returns {Promise<{files: Map<string,{out:string, body:Buffer}>, manifest: Object<string,string>}>}
 */
export async function stageData(dataDir, { skip, topics, hash }) {
  const files = new Map();
  const manifest = {};
  for (const rel of await walk(dataDir)) {
    const top = rel.split("/")[0];
    if (skip.has(top) || topics.has(top)) continue;
    const body = await readFile(path.join(dataDir, rel));
    let out = rel;
    if (hash && !DATA_UNHASHED.has(top)) {
      out = `h/${hashedName(rel, sha8(body))}`;
      manifest[rel] = out;
    }
    files.set(rel, { out, body });
  }
  return { files, manifest };
}
