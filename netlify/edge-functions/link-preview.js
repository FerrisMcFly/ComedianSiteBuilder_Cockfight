// Link previews (the card Discord, iMessage, Instagram and others show for a shared link) from the comic's dashboard.
// Link-preview robots don't run JavaScript, so the page's title, description and picture are filled in here,
// from Profile (tagline, About) and the first person's photo. Only pages that opt in by marking their tags
// with data-ct="title" | "description" | "image" are touched; anything else passes straight through.

const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const clip = (t, n) => { t = String(t || "").replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n - 1).replace(/\s+\S*$/, "") + "…" : t; };

// What the card should say, from the site row and its first person.
export function previewInfo(site, person) {
  if (!site) return null;
  const p = site.profile || {}, who = person || {};
  const line = clip((p.about || who.bio || "").split(/\n+/)[0], 160);
  const lead = p.tagline || who.title || "";
  // what the comic typed in Profile → Link preview wins; otherwise tagline, About and their photo
  return {
    title: clip(p.share_title, 70) || site.name + (lead ? " · " + clip(lead, 60) : ""),
    description: clip(p.share_text, 200) || [lead && line && !line.startsWith(lead) ? lead : "", line].filter(Boolean).join(". ").replace(/\.\.+/g, ".") || (site.name + " on ComicTable"),
    image: p.share_image || who.photo_url || ""
  };
}

// Swap the marked tags' content. Unmarked pages come back unchanged.
export function fillPreview(html, info) {
  if (!info || !/data-ct="/.test(html)) return html;
  let out = html.replace(/<meta([^>]*?)content="[^"]*"([^>]*?)data-ct="(title|description|image)"([^>]*)>/g, (m, a, b, k, c) =>
    k === "image" && !info.image ? "" : `<meta${a}content="${esc(info[k])}"${b}data-ct="${k}"${c}>`);
  out = out.replace(/<title>[^<]*<\/title>/, `<title>${esc(info.title)}</title>`);
  return out;
}

export default async (req, context) => {
  const res = await context.next();
  if (!(res.headers.get("content-type") || "").includes("text/html")) return res;
  const html = await res.text();
  const pass = () => new Response(html, res);
  if (!/data-ct="/.test(html)) return pass();
  try {
    const timeout = AbortSignal.timeout(1500);
    const cfgText = await fetch(new URL("/config.js", req.url), { signal: timeout }).then((r) => r.text());
    const cfg = JSON.parse(cfgText.slice(cfgText.indexOf("{"), cfgText.lastIndexOf("}") + 1));
    if (!cfg.SITE_ID || !cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) return pass();
    const api = (path) => fetch(cfg.SUPABASE_URL.replace(/\/$/, "") + "/rest/v1/" + path, { signal: timeout, headers: { apikey: cfg.SUPABASE_ANON_KEY, Authorization: "Bearer " + cfg.SUPABASE_ANON_KEY } }).then((r) => r.ok ? r.json() : []);
    const id = encodeURIComponent(cfg.SITE_ID);
    const [sites, people] = await Promise.all([api("sites?select=name,profile&id=eq." + id), api("hosts?select=name,title,bio,photo_url&hidden=is.false&order=sort.asc&limit=1&site_id=eq." + id)]);
    const headers = new Headers(res.headers); headers.delete("content-length");
    // a few minutes of caching keeps it quick; Profile changes show up in previews shortly after saving
    headers.set("cache-control", "public, max-age=0, must-revalidate"); headers.set("netlify-cdn-cache-control", "public, max-age=300");
    return new Response(fillPreview(html, previewInfo(sites[0], people[0])), { status: res.status, headers });
  } catch (e) {
    return pass();
  }
};

export const config = { path: ["/", "/index.html"] };
