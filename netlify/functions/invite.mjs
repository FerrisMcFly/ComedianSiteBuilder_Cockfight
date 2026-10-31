// GET  /.netlify/functions/invite?token=…  → who the invite is for: { name, photo, handle, site, state }
// POST /.netlify/functions/invite { token, username, password } → makes their login, links it to their Coaster
// (and the site, if the invite came with one), and uses up the link. Then the page logs them in.
// Invite links are made in the dashboard (27_invites.sql). They work once and last 7 days.
import { createClient } from "@supabase/supabase-js";

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function emailTaken(db, email) {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    if (data.users.some((u) => (u.email || "").toLowerCase() === email)) return true;
    if (data.users.length < 1000) return false;
  }
  return false;
}

export default async (req) => {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return json(500, { error: "Invites aren't set up yet." });
  const db = createClient(url, key, { auth: { persistSession: false } });
  const domain = process.env.LOGIN_DOMAIN || "comictable.com";
  let body = {};
  if (req.method === "POST") { try { body = await req.json(); } catch (e) {} }
  const token = req.method === "GET" ? new URL(req.url).searchParams.get("token") : body.token;
  if (!UUID.test(String(token || ""))) return json(400, { error: "That link isn't complete. Ask for a new one." });

  const { data: inv } = await db.from("invites").select("*").eq("token", token).maybeSingle();
  if (!inv) return json(404, { error: "That link doesn't work. Ask for a new one." });
  const { data: comic } = await db.from("comics").select("id, name, handle, photo_url, user_id").eq("id", inv.comic_id).maybeSingle();
  if (!comic) return json(404, { error: "That Coaster is gone. Ask for a new link." });
  const { data: site } = inv.site_id ? await db.from("sites").select("id, name").eq("id", inv.site_id).maybeSingle() : { data: null };
  const state = inv.used_at || comic.user_id ? "used" : Date.parse(inv.expires_at) < Date.now() ? "expired" : "ok";

  if (req.method === "GET") return json(200, { name: comic.name, photo: comic.photo_url || "", handle: comic.handle || comic.id, site: site ? site.name : "", state });
  if (req.method !== "POST") return json(405, { error: "Use GET or POST." });
  if (state === "used") return json(400, { error: "This link was already used. Log in instead." });
  if (state === "expired") return json(400, { error: "This link expired. Ask for a new one." });

  const username = String(body.username || "").trim().toLowerCase();
  const email = username.includes("@") ? username : username + "@" + domain;
  if (!username.includes("@") && !/^[a-z0-9][a-z0-9._-]{2,29}$/.test(username)) return json(400, { error: "Pick a username: 3 to 30 letters or numbers, no spaces." });
  if (username.includes("@") && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(username)) return json(400, { error: "That email doesn't look right." });
  const password = String(body.password || "");
  if (password.length < 8) return json(400, { error: "Your password needs at least 8 characters." });
  if (await emailTaken(db, email)) return json(400, { error: username.includes("@") ? "That email already has a login. Log in instead, or use another." : "That username's taken. Try another." });

  const { data: made, error: mkErr } = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name: comic.name } });
  if (mkErr) return json(400, { error: mkErr.message });
  const uid = made.user.id;
  // claim the Coaster (only if nobody has in the meantime)
  const { data: claimed, error: cErr } = await db.from("comics").update({ user_id: uid }).eq("id", comic.id).is("user_id", null).select("id");
  if (cErr || !claimed || !claimed.length) { await db.auth.admin.deleteUser(uid); return json(400, { error: "Someone already set up this Coaster. Ask for a new link." }); }
  if (inv.site_id) await db.from("admins").upsert({ user_id: uid, site_id: inv.site_id, role: inv.site_role || "editor" }, { onConflict: "user_id,site_id" });
  await db.from("invites").update({ used_at: new Date().toISOString(), used_by: uid }).eq("token", token);
  return json(200, { ok: true, email });
};
