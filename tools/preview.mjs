// Preview a site's design on your computer with the site's real data: node tools/preview.mjs <id> [port]
// Serves sites/<id>/ at http://localhost:8080 (or the port you give) the way the shared host does: the design's
// index.html, a config.js for that site, the data kit (sdk/) and the fan sign-up page (/join). Edit and refresh.
// It reads public data with the public key in platform/platform.json, the same as the live site.
// A template has no site of its own: preview it with any site's data, SITE=lev-fer node tools/preview.mjs punk-flyer
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, normalize, extname } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "application/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".woff2": "font/woff2" };
const inside = (p) => normalize(p).replace(/^(\.\.[/\\])+/, "");

// which file a path serves, for the design in sites/<id>/
export function route(id, path) {
  if (path === "/" || path === "/index.html") return join(root, "sites", id, "index.html");
  if (path === "/join" || path.startsWith("/join/")) return existsSync(join(root, "sites", id, "join.html")) ? join(root, "sites", id, "join.html") : join(root, "platform", "home", "join.html");
  if (path.startsWith("/sdk/")) return join(root, "platform", inside(path));
  return join(root, "sites", id, inside(path));
}
// the site whose data it shows: its own, or SITE for a template
export function siteFor(id, env = process.env) {
  const f = join(root, "sites", id, "site.json"), s = existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : {};
  return { id: env.SITE || (s.template ? "" : s.id || id), name: s.name || id };
}
export function configJs(siteId, name) {
  const p = JSON.parse(readFileSync(join(root, "platform", "platform.json"), "utf8"));
  return "window.COMICTABLE_CONFIG = " + JSON.stringify({ SITE_ID: siteId, SITE_NAME: name, LOGIN_DOMAIN: p.login_domain || "comictable.com", SUPABASE_URL: p.supabase_url, SUPABASE_ANON_KEY: p.supabase_anon_key }, null, 2) + ";\n";
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [id, port = "8080"] = process.argv.slice(2);
  if (!/^[a-z0-9_][a-z0-9_-]{1,40}$/.test(id || "") || !existsSync(join(root, "sites", id, "index.html"))) { console.error("Usage: node tools/preview.mjs <id> [port]   (a folder in sites/ with an index.html)"); process.exit(1); }
  const site = siteFor(id);
  if (!site.id) { console.error(`${id} is a template. Preview it with a site's data: SITE=lev-fer node tools/preview.mjs ${id}`); process.exit(1); }
  createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (path === "/config.js") { res.writeHead(200, { "content-type": TYPES[".js"] }); return res.end(configJs(site.id, site.name)); }
    const f = route(id, path);
    if (!f.startsWith(root) || !existsSync(f) || statSync(f).isDirectory()) { res.writeHead(404); return res.end("Not found"); }
    res.writeHead(200, { "content-type": TYPES[extname(f)] || "application/octet-stream", "cache-control": "no-store" });
    res.end(readFileSync(f));
  }).listen(+port, () => console.log(`${id} with ${site.id}'s data: http://localhost:${port}  (Ctrl+C to stop)`));
}
