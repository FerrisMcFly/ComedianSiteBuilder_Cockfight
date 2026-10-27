// POST /.netlify/functions/import-now  { site_id, source_id?, kind? }
// Called by the admin's "Import now" button. Only that site's admins can run it.
import { createClient } from "@supabase/supabase-js";
import { runSources } from "../lib/importer.mjs";

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

export default async (req) => {
  if (req.method !== "POST") return json(405, { error: "Use POST." });
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return json(500, { error: "Imports aren't set up yet: add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Netlify's environment variables, then redeploy." });
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return json(401, { error: "Log in first." });
  let body = {};
  try { body = await req.json(); } catch (e) {}
  const db = createClient(url, key, { auth: { persistSession: false } });
  const { data: who, error: authErr } = await db.auth.getUser(token);
  if (authErr || !who?.user) return json(401, { error: "Your login expired. Log in again." });
  const { data: adminRow } = await db.from("admins").select("site_id").eq("user_id", who.user.id).eq("site_id", body.site_id).maybeSingle();
  const { data: sup } = adminRow ? { data: null } : await db.from("platform_admins").select("user_id").eq("user_id", who.user.id).maybeSingle();
  if (!adminRow && !sup) return json(403, { error: "You're not an admin of this site." });
  // This site's sources, plus (for a site's comics) the ones they connected on their other sites.
  const { data: lineup } = await db.from("hosts").select("comic_id").eq("site_id", body.site_id);
  const comics = [...new Set((lineup || []).map((x) => x.comic_id).filter(Boolean))];
  let q = db.from("sources").select("*").eq("enabled", true);
  q = comics.length ? q.or(`site_id.eq.${body.site_id},comic_id.in.(${comics.join(",")})`) : q.eq("site_id", body.site_id);
  if (body.source_id) q = q.eq("id", body.source_id);
  else if (body.kind) q = q.eq("kind", body.kind);
  let { data: sources, error } = await q;
  if (error) return json(500, { error: error.message });
  // "Check all" for videos or shows runs everything this site sees; a podcast only runs this site's own feeds
  if (!body.source_id) sources = sources.filter((s) => s.site_id === body.site_id || s.kind !== "podcast");
  if (!sources.length) return json(200, { results: [], message: "No import sources yet." });
  return json(200, { results: await runSources(db, sources) });
};
