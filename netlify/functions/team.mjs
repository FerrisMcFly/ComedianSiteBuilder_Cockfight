// POST /.netlify/functions/team  { site_id, action: "list" | "add" | "remove", email?, password?, user_id? }
// Manages who can log in to a site's admin. Any admin can see the team; only owners can add or remove people.
import { createClient } from "@supabase/supabase-js";

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
  let { data: me } = await db.from("admins").select("role").eq("user_id", who.user.id).eq("site_id", site).maybeSingle();
  // ComicTable super admins can manage every site's team without being on it
  if (!me) { const { data: sup } = await db.from("platform_admins").select("user_id").eq("user_id", who.user.id).maybeSingle(); if (sup) me = { role: "owner" }; }
  if (!me) return json(403, { error: "You're not an admin of this site." });

  if (body.action === "list") {
    const { data: rows, error } = await db.from("admins").select("user_id, role").eq("site_id", site);
    if (error) return json(500, { error: error.message });
    const team = [];
    for (const r of rows) {
      const { data } = await db.auth.admin.getUserById(r.user_id);
      team.push({ user_id: r.user_id, role: r.role, email: data?.user?.email || "", you: r.user_id === who.user.id, last_sign_in: data?.user?.last_sign_in_at || null });
    }
    return json(200, { team, you_are: me.role });
  }

  if (me.role !== "owner") return json(403, { error: "Only owners can add or remove people from the team." });

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
    const role = body.role === "owner" ? "owner" : "editor";
    const { error } = await db.from("admins").upsert({ user_id: user.id, site_id: site, role }, { onConflict: "user_id,site_id" });
    if (error) return json(500, { error: error.message });
    return json(200, { ok: true, existed: !!user.last_sign_in_at });
  }

  if (body.action === "remove") {
    if (body.user_id === who.user.id) return json(400, { error: "You can't remove yourself." });
    const { error } = await db.from("admins").delete().eq("user_id", body.user_id).eq("site_id", site);
    if (error) return json(500, { error: error.message });
    return json(200, { ok: true });
  }

  return json(400, { error: "Unknown action." });
};
