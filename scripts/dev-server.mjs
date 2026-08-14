// Local development server.
//
// Exists for one reason: `python3 -m http.server` sends no Cache-Control at
// all, so browsers apply heuristic caching and happily serve a stale app.js or
// app.css for minutes. That produced a long run of "I don't see any change"
// during development, and worse, several minutes of debugging a bug that had
// already been fixed on disk.
//
// Everything here is no-store. This is a dev tool; it is never the production
// host (that is GitHub Pages), so there is no cost to disabling caching.
//
//   node scripts/dev-server.mjs [port]

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.argv[2]) || 8765;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

/* The app routes netlify.toml rewrites onto site/index.html. Parsed from the
   same file production reads, so there is one list, not two. */
const APP_ROUTES = new Set(
  [...(await readFile(path.join(ROOT, "netlify.toml"), "utf8"))
    .matchAll(/from\s*=\s*"(\/[a-z-]+)"\s*\n\s*to\s*=\s*"\/site\/index\.html"/g)]
    .map((m) => m[1])
);

const server = createServer(async (req, res) => {
  try {
    let rel = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (rel.endsWith("/")) rel += "index.html";

    // Stay inside the project. ROOT has no trailing separator, so a bare
    // startsWith(ROOT) also matches a SIBLING dir sharing the prefix
    // (…/project vs …/project-notes). Require ROOT + separator, or ROOT itself.
    const file = path.join(ROOT, rel);
    if (file !== ROOT && !file.startsWith(ROOT + path.sep)) {
      res.writeHead(403).end("forbidden");
      return;
    }

    let info = await stat(file).catch(() => null);

    /* Stand in for netlify.toml's app-route rewrites, so /alerts and /test
       serve the app shell here the way they do in production. The list is
       read from netlify.toml rather than duplicated, or the two drift and a
       route works locally and 404s live. */
    let target = file;
    if (!info?.isFile() && APP_ROUTES.has(rel)) {
      target = path.join(ROOT, "site", "index.html");
      info = await stat(target).catch(() => null);
    }

    if (!info?.isFile()) {
      res.writeHead(404, { "content-type": "text/plain" }).end("not found");
      return;
    }

    const body = await readFile(target);
    res.writeHead(200, {
      "content-type": TYPES[path.extname(file)] || "application/octet-stream",
      // The whole point.
      "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
      pragma: "no-cache",
      expires: "0",
    }).end(body);
  } catch (e) {
    res.writeHead(500, { "content-type": "text/plain" }).end(String(e.message));
  }
});

// Bind loopback only. Without an explicit host Node listens on 0.0.0.0, which
// would expose the whole project tree to anyone on the same network.
server.listen(PORT, "127.0.0.1", () => {
  console.log(`Nightlight dev server → http://localhost:${PORT}/site/`);
  console.log("All responses are no-store, so a plain reload always shows the latest build.");
});
