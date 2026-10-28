// comictable.com/<comic>: a comic's Coaster. Serves the Coaster page with their name, photo and bio in the
// link preview, so a Coaster shared on iMessage, Instagram or X shows their face. The page loads the rest itself.
// Reached through the last rule in comictable.com's _redirects (tools/build.mjs); real files and pages always win.
// Fetches only the comic's name, bio and photo from the database; never the site itself.
import platform from "../../platform/platform.json" with { type: "json" };
import PAGE from "../lib/coaster-page.mjs";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const ID = /^\/([a-z0-9][a-z0-9-]{0,80})\/?$/i;

// Puts one comic's title, description and preview image into the page's <head>.
export function withPreview(html, c, origin) {
  const desc = String(c.short_bio || c.bio || `${c.name}'s next dates, Tape and links.`).replace(/\s+/g, " ").trim().slice(0, 180);
  const img = /^https:\/\//i.test(c.photo_url || "") ? c.photo_url : origin + "/brand/og-image.png";
  const url = origin + "/" + encodeURIComponent(c.id);
  const tags = [
    `<meta property="og:type" content="profile">`, `<meta property="og:site_name" content="ComicTable">`,
    `<meta property="og:title" content="${esc(c.name)}">`, `<meta property="og:description" content="${esc(desc)}">`,
    `<meta property="og:url" content="${esc(url)}">`, `<meta property="og:image" content="${esc(img)}">`,
    `<meta name="twitter:card" content="${c.photo_url ? "summary" : "summary_large_image"}">`,
    `<meta name="twitter:title" content="${esc(c.name)}">`, `<meta name="twitter:description" content="${esc(desc)}">`, `<meta name="twitter:image" content="${esc(img)}">`,
    `<link rel="canonical" href="${esc(url)}">`].join("\n");
  return html
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(c.name)} · ComicTable</title>`)
    .replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${esc(desc)}">`)
    .replace("</head>", tags + "\n</head>");
}

export default async (req, deps = {}) => {
  const get = deps.fetch || fetch;
  const url = new URL(req.url);
  const id = (url.pathname.match(ID) || [])[1];
  // The page is built in (netlify/lib/coaster-page.mjs): fetching /coaster.html from ourselves could loop back here.
  let html = PAGE;
  let comic = null, known = false;
  if (id) {
    try {
      const r = await get(`${platform.supabase_url}/rest/v1/comics?select=id,name,short_bio,bio,photo_url&id=eq.${encodeURIComponent(id.toLowerCase())}`,
        { headers: { apikey: platform.supabase_anon_key, Authorization: "Bearer " + platform.supabase_anon_key } });
      if (r.ok) { known = true; comic = (await r.json())[0] || null; }
    } catch (e) {}
  }
  if (comic) html = withPreview(html, comic, url.origin);
  // Only say "not found" when the database said so; if it couldn't be reached, the page tries again itself.
  return new Response(html, { status: known && !comic ? 404 : 200,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=0, must-revalidate", "netlify-cdn-cache-control": "public, s-maxage=300, stale-while-revalidate=600" } });
};
