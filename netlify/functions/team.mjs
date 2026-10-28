// POST /.netlify/functions/team  { site_id, action: "list" | "add" | "set_role" | "remove" | "link_comic" | "unlink_comic", email?, password?, user_id?, role? }
//                                { action: "staff_add", email, password?, role: "admin" | "staff" }   (ComicTable admins only)
// Manages who can log in to a site's admin. Any admin can see the team; only owners can add, change or remove people.
// Site roles: owner (everything, including the team), editor (everything but the team), shows (dates and clubs), moderator (forum and chat).
import { createClient } from "@supabase/supabase-js";
import { accessFor } from "../lib/access.mjs";

const SITE_ROLES = ["owner", "editor", "shows", "moderator"];
const siteRole = (r) => (SITE_ROLES.includes(r) ? r : "editor");
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

async function findUserByEmail(db, email) {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const hit = data.users.find((u) => (u.email || "").toLowerCase() === email.toLowerCase());
    if (hit) return hit;
    if (data.users.length < 1000) return null;
  }
  return null;
}

export default async (req) => {
  if (req.method !== "POST") return json(405, { error: "Use POST." });
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return json(500, { error: "Team management isn't set up yet: add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Netlify, then redeploy." });
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return json(401, { error: "Log in first." });
  let body = {};
  try { body = await req.json(); } catch (e) {}
  const site = body.site_id;
  const db = createClient(url, key, { auth: { persistSession: false } });
  const { data: who, error: authErr } = await db.auth.getUser(token);
  if (authErr || !who?.user) return json(401, { error: "Your login expired. Log in again." });

  // ComicTable staff: only ComicTable admins add people (an existing login, or a new one with a starting password)
  if (body.action === "staff_add") {
    const { data: boss } = await db.from("platform_admins").select("role").eq("user_id", who.user.id).maybeSingle();
    if (!boss || (boss.role || "admin") !== "admin") return json(403, { error: "Only ComicTable admins can add staff." });
    const email = String(body.email || "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json(400, { error: "That doesn't look like a valid email." });
    let user = await findUserByEmail(db, email);
    if (!user) {
      const password = String(body.password || "");
      if (password.length < 8) return json(400, { error: "They don't have a login yet. Give them a starting password of at least 8 characters." });
      const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
      if (error) return json(400, { error: error.message });
      user = data.user;
    }
    const role = body.role === "admin" ? "admin" : "staff";
    const { error } = await db.from("platform_admins").upsert({ user_id: user.id, role }, { onConflict: "user_id" });
    if (error) return json(500, { error: error.message });
    return json(200, { ok: true, existed: !!user.last_sign_in_at });
  }
  // ComicTable admins manage every site's team; staff and editors can see it; only owners change it
  const me = await accessFor(db, who.user.id, site);
  if (!me.role) return json(403, { error: "You're not on this site's team." });

  if (body.action === "list") {
    const { data: rows, error } = await db.from("admins").select("user_id, role").eq("site_id", site);
    if (error) return json(500, { error: error.message });
    const team = [];
    for (const r of rows) {
      const { data } = await db.auth.admin.getUserById(r.user_id);
      team.push({ user_id: r.user_id, role: r.role, email: data?.user?.email || "", you: r.user_id === who.user.id, last_sign_in: data?.user?.last_sign_in_at || null });
    }
    // which comic each login belongs to, if any
    const { data: linked } = await db.from("comics").select("id, name, user_id").in("user_id", team.map((t) => t.user_id));
    for (const t of team) { const c = (linked || []).find((x) => x.user_id === t.user_id); if (c) { t.comic_id = c.id; t.comic_name = c.name; } }
    return json(200, { team, you_are: me.role });
  }

  if (me.role !== "owner") return json(403, { error: "Only owners can add, change or remove people on the team." });

  if (body.action === "set_role") {
    if (body.user_id === who.user.id) return json(400, { error: "You can't change your own access." });
    const { error } = await db.from("admins").update({ role: siteRole(body.role) }).eq("user_id", body.user_id).eq("site_id", site);
    if (error) return json(500, { error: error.message });
    return json(200, { ok: true });
  }

  if (body.action === "add") {
    const email = String(body.email || "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json(400, { error: "That doesn't look like a valid login." });
    let user = await findUserByEmail(db, email);
    if (!user) {
      const password = String(body.password || "");
      if (password.length < 8) return json(400, { error: "Give them a password of at least 8 characters." });
      const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
      if (error) return json(400, { error: error.message });
      user = data.user;
    }
    const role = siteRole(body.role);
    const { error } = await db.from("admins").upsert({ user_id: user.id, site_id: site, role }, { onConflict: "user_id,site_id" });
    if (error) return json(500, { error: error.message });
    return json(200, { ok: true, existed: !!user.last_sign_in_at });
  }

  // Give a comic on this site their own login. They can then edit their profile and dates from any site they're on,
  // and they join this site's team.
  if (body.action === "link_comic") {
    const { data: onSite } = await db.from("hosts").select("comic_id").eq("site_id", site).eq("comic_id", body.comic_id || "").maybeSingle();
    if (!onSite) return json(400, { error: "That person isn't on this site." });
    const email = String(body.email || "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json(400, { error: "That doesn't look like a valid login." });
    let user = await findUserByEmail(db, email);
    if (!user) {
      const password = String(body.password || "");
      if (password.length < 8) return json(400, { error: "Give them a password of at least 8 characters." });
      const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
      if (error) return json(400, { error: error.message });
      user = data.user;
    }
    const { data: comic } = await db.from("comics").select("id, name, user_id").eq("id", body.comic_id).maybeSingle();
    if (comic.user_id && comic.user_id !== user.id) return json(400, { error: comic.name + " already has a login. Unlink it first." });
    const { data: other } = await db.from("comics").select("name").eq("user_id", user.id).neq("id", comic.id).maybeSingle();
    if (other) return json(400, { error: "That login already belongs to " + other.name + "." });
    const up = await db.from("comics").update({ user_id: user.id }).eq("id", comic.id);
    if (up.error) return json(500, { error: up.error.message });
    const role = siteRole(body.role);
    const { error } = await db.from("admins").upsert({ user_id: user.id, site_id: site, role }, { onConflict: "user_id,site_id" });
    if (error) return json(500, { error: error.message });
    return json(200, { ok: true, existed: !!user.last_sign_in_at });
  }
  if (body.action === "unlink_comic") {
    const { data: onSite } = await db.from("hosts").select("comic_id").eq("site_id", site).eq("comic_id", body.comic_id || "").maybeSingle();
    if (!onSite) return json(400, { error: "That person isn't on this site." });
    const up = await db.from("comics").update({ user_id: null }).eq("id", body.comic_id || "");
    if (up.error) return json(500, { error: up.error.message });
    return json(200, { ok: true });
  }

  if (body.action === "remove") {
    if (body.user_id === who.user.id) return json(400, { error: "You can't remove yourself." });
    const { error } = await db.from("admins").delete().eq("user_id", body.user_id).eq("site_id", site);
    if (error) return json(500, { error: error.message });
    return json(200, { ok: true });
  }

  return json(400, { error: "Unknown action." });
};
