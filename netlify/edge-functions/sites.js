// One ComicTable project runs every comic's site (founder, Oct 31): instead of a Netlify project per comic, a comic's
// own address points here, and this looks up which site it belongs to and serves that site's design.
//   ritaramoscomedy.com/            → Rita's site, in her design
//   comictable.com/s/rita-ramos/    → the same site, before she has an address (and on previews)
// A design is one page (sites/<design>/index.html, copied to /designs/<design>.html by the build) that loads
// config.js and sdk/csb.js. config.js is made here, per site. comictable.com itself passes straight through.

const PLATFORM_HOSTS = /^(comictable\.com|www\.comictable\.com|localhost|127\.0\.0\.1)$|\.netlify\.app$/;
const SITE_ID = /^[a-z0-9][a-z0-9-]{1,40}$/;
const CACHE_MS = 60 * 1000;
const cache = new Map();
let platformCfg = null;

export const cleanHost = (h) => String(h || "").toLowerCase().replace(/:\d+$/, "").replace(/^www\./, "");

// Which site a request is for, and the path inside it. null: not a site request (comictable.com's own pages).
export function siteRequest(url) {
  const u = new URL(url), host = cleanHost(u.hostname);
  const m = u.pathname.match(/^\/s\/([a-z0-9-]+)(\/.*)?$/);
  if (m && SITE_ID.test(m[1])) return { by: "id", key: m[1], path: m[2] || "", base: "/s/" + m[1] + "/" };
  if (PLATFORM_HOSTS.test(u.hostname.toLowerCase()) || PLATFORM_HOSTS.test(host)) return null;
  return { by: "domain", key: host, path: u.pathname, base: "/" };
}

// The design a site uses: one picked for it, its template, or one made just for it, else Starter.
export function designsFor(site) {
  const t = (site && site.theme) || {};
  const list = [t.design, t.way === "template" ? t.template : null, site && site.id, "starter"].filter((x) => x && SITE_ID.test(String(x)));
  return [...new Set(list)];
}

export const configFor = (site, cfg) => "window.COMICTABLE_CONFIG = " + JSON.stringify({ SITE_ID: site.id, SITE_NAME: site.name, LOGIN_DOMAIN: cfg.LOGIN_DOMAIN || "comictable.com", SUPABASE_URL: cfg.SUPABASE_URL, SUPABASE_ANON_KEY: cfg.SUPABASE_ANON_KEY }, null, 2) + ";\n";

const page = (status, title, line) => new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title>
<style>body{margin:0;min-height:100vh;display:grid;place-content:center;gap:8px;padding:24px;text-align:center;background:#13100E;color:#F3EAD7;font:16px/1.5 system-ui,sans-serif}h1{margin:0;font:900 34px/1 system-ui,sans-serif;text-transform:uppercase}p{margin:0;color:#A89F92}a{color:#E66A4B}</style></head>
<body><h1>${title}</h1><p>${line}</p><p><a href="https://comictable.com">ComicTable</a></p></body></html>`, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });

async function lookup(req, by, key) {
  const k = by + ":" + key, hit = cache.get(k);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.site;
  if (!platformCfg) platformCfg = await fetch(new URL("/ct-config.json", req.url)).then((r) => r.json());
  const q = by === "id" ? "id=eq." + encodeURIComponent(key) : "domain=in.(" + [key, "www." + key].map(encodeURIComponent).join(",") + ")";
  const rows = await fetch(platformCfg.SUPABASE_URL.replace(/\/$/, "") + "/rest/v1/sites?select=id,name,domain,theme&limit=1&" + q, {
    headers: { apikey: platformCfg.SUPABASE_ANON_KEY, Authorization: "Bearer " + platformCfg.SUPABASE_ANON_KEY } }).then((r) => r.ok ? r.json() : []);
  const site = rows[0] || null;
  cache.set(k, { at: Date.now(), site });
  return site;
}

export default async (req, context) => {
  const r = siteRequest(req.url);
  if (!r) return context.next();
  // comictable.com/s/<id> → /s/<id>/, so the design's relative config.js and sdk/ resolve under it
  if (r.by === "id" && r.path === "") return Response.redirect(new URL(r.base, req.url), 301);
  let site;
  try { site = await lookup(req, r.by, r.key); } catch (e) { return page(503, "Back in a minute", "This site couldn't load. Try again shortly."); }
  if (!site) return page(404, "Nothing here yet", r.by === "domain" ? "This address isn't set up on ComicTable yet." : "There's no site with that name.");
  const path = r.path.replace(/^\/?/, "/");
  if (path === "/config.js") return new Response(configFor(site, platformCfg), { headers: { "content-type": "application/javascript; charset=utf-8", "cache-control": "public, max-age=0, must-revalidate", "netlify-cdn-cache-control": "public, max-age=60" } });
  if (path.startsWith("/sdk/")) return new URL(path, req.url);
  if (path === "/join" || path.startsWith("/join/")) return new URL("/join.html", req.url);
  if (path === "/admin" || path === "/admin.html" || path === "/login" || path === "/dashboard") return Response.redirect("https://comictable.com/login", 302);
  if (path === "/robots.txt") return new Response("User-agent: *\nAllow: /\n", { headers: { "content-type": "text/plain" } });
  if (path !== "/" && path !== "/index.html") return page(404, "Page not found", "Try the home page.");
  for (const d of designsFor(site)) {
    const res = await fetch(new URL("/designs/" + d + ".html", req.url));
    if (res.ok) return new Response(await res.text(), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=0, must-revalidate", "netlify-cdn-cache-control": "public, max-age=60" } });
  }
  return page(500, "Something's off", "This site's design is missing.");
};

// comictable.com's own files skip this entirely
export const config = { path: "/*", excludedPath: ["/sdk/*", "/designs/*", "/fonts/*", "/brand/*", "/themes/*", "/ct-config.json", "/.netlify/*", "/embed.js"] };
