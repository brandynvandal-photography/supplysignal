// Ship the working copy to an environment.
//
//   node scripts/ship.mjs staging               # -> staging branch
//   node scripts/ship.mjs prod -m "why"         # -> main, gated on staging
//
// WHY THIS EXISTS. Until 2026-08-18 every deploy went straight to production:
// the working copy is not a git checkout, so "deploying" meant hand-rsyncing
// changed files into a scratch clone and pushing main. There was no place to
// look at a change before nightlight.help served it, and the service worker
// VERSION had to be re-hashed by hand on every single edit - a ritual
// performed about thirty times in one session, wrong on the first try most of
// them.
//
// THE MODEL. Two environments, one repository:
//
//   staging  the `staging` branch. Netlify serves it at a branch URL once
//            branch deploys are enabled (Site configuration -> Build & deploy
//            -> Branch deploys -> add "staging"). It is where QA/UAT happens.
//            Its copy of netlify.toml gets an X-Robots-Tag: noindex header
//            injected at ship time so a search engine never meets it.
//   prod     the `main` branch -> nightlight.help. A prod ship REFUSES to
//            push a tree that differs from what staging currently holds,
//            because promoting exactly what QA looked at is the entire point
//            of having a staging step. --force overrides it, loudly, for the
//            day staging is broken and prod needs a hotfix anyway.
//
// WHAT SHIPS. An allowlist, mirroring what was always cherry-picked by hand:
// site/, our data files, scripts/, test/, src/, docs/, and the root config.
// The ingest bot's output - alerts.json, index.json, runs.json, counties/,
// feeds/, the caches - is EXCLUDED in both directions: we never overwrite the
// bot's fresher data with our stale copy (the "git checkout -- data/alerts..."
// dance, automated away), and rsync's delete never touches what it excludes.
//
// THE SERVICE WORKER IS SYNCED, NOT CHECKED. test/sw.test.mjs recomputes the
// hash and fails on mismatch, which is right for CI and maddening for a human:
// the failure message contains the value to paste in. This script just writes
// it before running the tests, so the ritual is gone and the test still
// guards every other path to a deploy.
//
// A ship records what it shipped in .shipped-<env>.json (tree hash + commit).
// The iOS release script refuses to package a bundle whose tree hash does not
// match a recorded ship - so an app build can always be traced to the exact
// web tree its environment was serving, and "it works on the site but not in
// the app" starts from the same bytes.

import { execFileSync, execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
/* OUTSIDE THE WORKING COPY, on purpose. The first run put the scratch clone
   and the ship receipts at the repo root, and test/publish.test.mjs flagged
   both as unruled top-level paths inside five minutes - the allowlist doing
   its job against the deploy tool itself. State lives in the cache dir where
   nothing serves it and no test walks it. */
const STATE = path.join(os.homedir(), ".cache", "nightlight");
const CLONE = path.join(STATE, "deploy-clone");
const REMOTE = "https://github.com/brandynvandal-photography/supplysignal.git";

/* ------------------------------------------------------------------ args */

const args = process.argv.slice(2);
const env = args[0];
if (!["staging", "prod", "hash"].includes(env)) {
  console.error("usage: node scripts/ship.mjs staging|prod [-m message] [--force] [--skip-tests]");
  console.error("       node scripts/ship.mjs hash    # sync sw VERSION, print the ship-set hash");
  process.exit(2);
}
const force = args.includes("--force");
const skipTests = args.includes("--skip-tests");
const mi = args.indexOf("-m");
const message = mi > -1 ? args[mi + 1] : null;
if (env === "prod" && !message) {
  console.error("prod ships carry a real commit message: -m \"what and why\"");
  process.exit(2);
}
const BRANCH = env === "prod" ? "main" : "staging";
const HASH_ONLY = env === "hash";

/* -------------------------------------------------------- what ships */

/* Directories rsynced with --delete (wholly ours), and root files copied.
   data/ is special-cased below because the bot owns part of it. */
const OURS_DIRS = ["site", "scripts", "test", "src", "docs"];
const OURS_FILES = ["netlify.toml", "package.json", "README.md", "PRIVACY.md",
                    "EVIDENCE.md", "DESIGN-BRIEF.md", "OUTREACH.md"];

/* The staging-only netlify.toml injection, shared by the writer and by the
   prod gate, which must strip it before comparing trees - otherwise staging
   can never equal prod byte-for-byte and the gate would refuse every
   legitimate promotion. Found on the first real promotion attempt. */
const MARK = "# --- staging-only: injected by scripts/ship.mjs, never on main ---";

/* The bot's files. Never shipped, never deleted on the remote by us. */
const BOT_EXCLUDES = [
  "alerts.json", "index.json", "runs.json", "counties",
  ".cache.json", ".rotation.json", ".medex.json",
];

/* ------------------------------------------------- the ship-set hash */

/* One hash over every byte this script would ship, path-order stable. The
   prod parity gate and the iOS release gate both compare it, so it has to be
   computable from a bare directory tree - no git required. */
function shipTreeHash(root) {
  const files = [];
  const walk = (rel) => {
    const abs = path.join(root, rel);
    if (!existsSync(abs)) return;
    for (const e of readdirSync(abs, { withFileTypes: true })) {
      if (e.name === ".DS_Store") continue;
      const r = path.join(rel, e.name);
      if (e.isDirectory()) walk(r);
      else files.push(r);
    }
  };
  for (const d of OURS_DIRS) walk(d);
  // data/, minus the bot's files
  const dataAbs = path.join(root, "data");
  if (existsSync(dataAbs)) {
    for (const e of readdirSync(dataAbs, { withFileTypes: true })) {
      if (BOT_EXCLUDES.includes(e.name) || e.name === ".DS_Store") continue;
      const r = path.join("data", e.name);
      if (e.isDirectory()) walk(r);
      else files.push(r);
    }
  }
  for (const f of OURS_FILES) if (existsSync(path.join(root, f))) files.push(f);

  files.sort();
  const h = createHash("sha256");
  for (const f of files) {
    h.update(f);
    h.update(readFileSync(path.join(root, f)));
  }
  return h.digest("hex").slice(0, 12);
}

/* ------------------------------------------- 1. sync the service worker */

/* MIRRORS test/sw.test.mjs EXACTLY - same filter, same relative-path salt,
   and sw.js excluded from its own hash, which is what makes a single write
   sufficient. The first draft of this block re-derived the hash from
   first principles and got all three details wrong; the test is the
   specification, so this is a transcription of it, not an interpretation. */
const swPath = path.join(ROOT, "site", "sw.js");
{
  const all = [];
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const f = path.join(d, e.name);
      if (e.isDirectory()) walk(f);
      else all.push(f);
    }
  };
  walk(path.join(ROOT, "site"));
  const cached = all
    .filter((f) => /\.(js|css)$/.test(f) || f.endsWith(path.sep + "index.html"))
    .filter((f) => path.basename(f) !== "sw.js")
    .sort();
  const h = createHash("sha256");
  for (const f of cached) {
    h.update(path.relative(ROOT, f));
    h.update(readFileSync(f));
  }
  const want = "nl-" + h.digest("hex").slice(0, 8);
  const sw = readFileSync(swPath, "utf8");
  const have = sw.match(/const VERSION = "([^"]+)"/)?.[1];
  if (have !== want) {
    writeFileSync(swPath, sw.replace(/const VERSION = "[^"]+"/, `const VERSION = "${want}"`));
    console.log(`sw.js VERSION synced: ${have} -> ${want}`);
  }
}

if (HASH_ONLY) {
  console.log(shipTreeHash(ROOT));
  process.exit(0);
}

/* ------------------------------------------------------- 2. run tests */

if (skipTests) {
  console.log("tests SKIPPED by flag - staging can absorb that; prod should not");
  if (env === "prod" && !force) {
    console.error("refusing --skip-tests on prod without --force");
    process.exit(1);
  }
} else {
  console.log("running the suite...");
  try {
    execSync("npm test", { cwd: ROOT, stdio: "pipe" });
    console.log("all suites pass");
  } catch (e) {
    const out = String(e.stdout || "") + String(e.stderr || "");
    console.error(out.split("\n").filter((l) => /not ok|FAIL/.test(l)).join("\n") || out.slice(-800));
    console.error("tests failed - nothing shipped");
    process.exit(1);
  }
}

/* -------------------------------------------------- 3. fresh clone */

const run = (cmd, opts = {}) => execSync(cmd, { stdio: "pipe", ...opts }).toString().trim();
execSync(`mkdir -p "${STATE}"`);
if (existsSync(CLONE)) {
  try {
    run(`git -C "${CLONE}" fetch origin --prune`);
    run(`git -C "${CLONE}" checkout -f ${BRANCH} 2>/dev/null || git -C "${CLONE}" checkout -b ${BRANCH} origin/main`);
    run(`git -C "${CLONE}" reset --hard origin/${BRANCH} 2>/dev/null || true`);
  } catch {
    rmSync(CLONE, { recursive: true, force: true });
  }
}
if (!existsSync(CLONE)) {
  console.log("cloning...");
  run(`git clone "${REMOTE}" "${CLONE}"`);
  run(`git -C "${CLONE}" checkout ${BRANCH} 2>/dev/null || git -C "${CLONE}" checkout -b ${BRANCH} origin/main`);
}

/* ------------------------------------- 4. prod gate: parity with staging */

const localHash = shipTreeHash(ROOT);
if (env === "prod") {
  let stagingHash = null;
  try {
    run(`git -C "${CLONE}" fetch origin staging`);
    const tmp = mkdtempSync(path.join(os.tmpdir(), "nl-staging-"));
    execSync(`git -C "${CLONE}" archive origin/staging | tar -x -C "${tmp}"`);
    // Strip our own staging-only injection before comparing.
    const t = path.join(tmp, "netlify.toml");
    if (existsSync(t)) {
      const raw = readFileSync(t, "utf8");
      /* The injection is "\n" + MARK + block appended to a file already
         ending in a newline. Stripping must remove that added "\n" too, or
         the gate compares X against X-plus-one-byte forever. It did. */
      const cut = raw.indexOf("\n" + MARK);
      if (cut > -1) writeFileSync(t, raw.slice(0, cut));
    }
    stagingHash = shipTreeHash(tmp);
    rmSync(tmp, { recursive: true, force: true });
  } catch {
    console.error("no staging branch found - ship staging first");
    if (!force) process.exit(1);
  }
  if (stagingHash && stagingHash !== localHash) {
    console.error(`PROD GATE: working copy (${localHash}) does not match staging (${stagingHash}).`);
    console.error("Prod ships exactly what QA saw. Ship staging, look at it, then ship prod.");
    if (!force) process.exit(1);
    console.error("--force: shipping anyway. Say why in the commit message.");
  } else if (stagingHash) {
    console.log(`prod gate: matches staging (${localHash})`);
  }
}

/* -------------------------------------------------------- 5. rsync */

const rsync = (from, to, del) =>
  execFileSync("rsync", ["-rc", ...(del ? ["--delete"] : []), "--exclude", ".DS_Store", from, to]);

for (const d of OURS_DIRS) rsync(path.join(ROOT, d) + "/", path.join(CLONE, d) + "/", true);
{
  const ex = BOT_EXCLUDES.flatMap((f) => ["--exclude", f]);
  execFileSync("rsync", ["-rc", "--exclude", ".DS_Store", ...ex,
    path.join(ROOT, "data") + "/", path.join(CLONE, "data") + "/"]);
  // Belt and braces: if an excluded name ever slips through a future edit,
  // put the bot's copy back before committing.
  for (const f of BOT_EXCLUDES) {
    try { run(`git -C "${CLONE}" checkout -- "data/${f}"`); } catch { /* untracked; fine */ }
  }
}
for (const f of OURS_FILES) {
  if (existsSync(path.join(ROOT, f))) rsync(path.join(ROOT, f), path.join(CLONE, f), false);
}

/* Staging never gets indexed. Injected into the BRANCH copy only, marker-
   guarded so re-ships do not stack copies; prod's netlify.toml is untouched. */
if (env === "staging") {
  const tomlPath = path.join(CLONE, "netlify.toml");
  let toml = readFileSync(tomlPath, "utf8");
  if (!toml.includes(MARK)) {
    toml += `\n${MARK}\n[[headers]]\n  for = "/*"\n  [headers.values]\n    X-Robots-Tag = "noindex"\n`;
    writeFileSync(tomlPath, toml);
  }
}

/* ------------------------------------------------------ 6. commit, push */

const status = run(`git -C "${CLONE}" status --short`);
if (!status) {
  console.log(`nothing to ship - ${BRANCH} already matches (${localHash})`);
} else {
  console.log(status.split("\n").slice(0, 20).join("\n"));
  run(`git -C "${CLONE}" add -A`);
  const msg = message || `ship(${env}): ${new Date().toISOString().slice(0, 16)}`;
  execFileSync("git", ["-C", CLONE, "commit", "-q", "-m", msg]);
  run(`git -C "${CLONE}" push -q origin ${BRANCH}`);
  console.log(`pushed ${BRANCH}: ${run(`git -C "${CLONE}" log --oneline -1`)}`);
}

const sha = run(`git -C "${CLONE}" rev-parse HEAD`);
writeFileSync(path.join(STATE, `shipped-${env}.json`),
  JSON.stringify({ env, branch: BRANCH, sha, tree: localHash, when: new Date().toISOString() }, null, 2) + "\n");

console.log(`\nshipped ${env}  tree=${localHash}  ${sha.slice(0, 8)}`);
if (env === "staging") {
  console.log("QA URL: the staging branch deploy on Netlify (enable under");
  console.log("Site configuration -> Build & deploy -> Branch deploys, once).");
}
