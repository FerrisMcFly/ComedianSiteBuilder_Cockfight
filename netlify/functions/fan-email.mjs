// POST /.netlify/functions/fan-email (logged in, someone who can edit the comic)
//   { action: "info", comic }                                  → { ready, left, per_week, sent: { <show id>: { count, at } } }
//   { action: "send", comic, show_id, subject, message }      → { sent }
// Emails the comic's fans within 50 miles of one of their shows. One email per show, three a week at most.
// Needs RESEND_API_KEY in Netlify (and the sending domain set up in Resend); until then "ready" is false.
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { fansNear, emailFor, sendAll, fromName, PER_WEEK } from "../lib/fan-email.mjs";

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function canEdit(url, key, token, comic) {
  const r = await fetch(url.replace(/\/$/, "") + "/rest/v1/rpc/can_edit_comic", { method: "POST",
    headers: { apikey: key, Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify({ c: comic }) });
  return r.ok && (await r.json().catch(() => false)) === true;
}

export default async (req) => {
  if (req.method !== "POST") return json(405, { error: "Use POST." });
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY, resend = process.env.RESEND_API_KEY;
  if (!url || !key) return json(500, { error: "This isn't set up yet." });
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const db = createClient(url, key, { auth: { persistSession: false } });
  const { data: who } = token ? await db.auth.getUser(token) : { data: null };
  if (!who || !who.user) return json(401, { error: "Log in first." });
  let body = {}; try { body = await req.json(); } catch (e) {}
  const comic = String(body.comic || "");
  if (!/^[a-z0-9][a-z0-9-]{1,60}$/.test(comic) || !(await canEdit(url, key, token, comic))) return json(403, { error: "You can't email this comic's fans." });

  const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString();
  const { data: recent, error: rErr } = await db.from("fan_emails").select("show_id,sent_count,status,created_at").eq("comic_id", comic).order("created_at", { ascending: false }).limit(200);
  if (rErr) return json(500, { error: /fan_emails/.test(rErr.message) ? "This needs the latest database upgrade." : rErr.message });
  const left = Math.max(0, PER_WEEK - recent.filter((e) => e.created_at > weekAgo && e.status !== "failed").length);

  if (body.action === "info") {
    const sent = {}; recent.forEach((e) => { if (e.show_id && !sent[e.show_id]) sent[e.show_id] = { count: e.sent_count, at: e.created_at, status: e.status }; });
    return json(200, { ready: !!resend, per_week: PER_WEEK, left, sent });
  }
  if (body.action !== "send") return json(400, { error: "Unknown action." });
  if (!resend) return json(503, { error: "Emailing fans isn't switched on yet." });
  const subject = String(body.subject || "").trim().slice(0, 150), message = String(body.message || "").trim().slice(0, 3000);
  if (!subject) return json(400, { error: "Add a subject." });
  if (message.length < 10) return json(400, { error: "Write a line or two for your fans." });
  if (!UUID.test(String(body.show_id || ""))) return json(400, { error: "Pick a show." });
  if (!left) return json(429, { error: "That's " + PER_WEEK + " emails this week. Fans stay happier that way; try again in a few days." });

  const { data: show } = await db.from("shows").select("id,comic_id,host,date,time,venue,venue_id,city,url").eq("id", body.show_id).maybeSingle();
  let mine = show && show.comic_id === comic;
  if (show && !mine && show.host) { const { data: h } = await db.from("hosts").select("comic_id").eq("id", show.host).maybeSingle(); mine = !!h && h.comic_id === comic; }
  if (!mine) return json(404, { error: "That show isn't one of yours." });
  if (String(show.date) < new Date(Date.now() - 864e5).toISOString().slice(0, 10)) return json(400, { error: "That show already happened." });
  const { data: venue } = show.venue_id ? await db.from("venues").select("lat,lng").eq("id", show.venue_id).maybeSingle() : { data: null };
  if (!venue || venue.lat == null) return json(400, { error: "Pick the club from the list on Shows first, so we know who's nearby." });
  const { data: fans } = await db.from("comic_fans").select("email,name,city,lat,lng,token").eq("comic_id", comic).not("lat", "is", null).limit(20000);
  const near = fansNear(fans || [], venue);
  if (!near.length) return json(400, { error: "Nobody on your list lives within 50 miles of this club yet." });
  const { data: c } = await db.from("comics").select("name").eq("id", comic).maybeSingle();

  // one email per show: the row goes in first, so a second tap (or a second person) can't send it twice
  const id = randomUUID();
  const { error: dup } = await db.from("fan_emails").insert({ id, comic_id: comic, show_id: show.id, subject, body: message, sent_by: who.user.id });
  if (dup) return json(409, { error: /duplicate|unique/i.test(dup.message) ? "You already emailed fans about this show." : dup.message });
  const base = (process.env.URL || "https://comictable.com").replace(/\/$/, "");
  const from = fromName(c && c.name) + " <" + (process.env.FAN_EMAIL_FROM || "shows@comictable.com") + ">";
  const emails = near.map((fan) => emailFor({ comic: { name: (c && c.name) || "Your comic" }, show, subject, message, fan, base, from }));
  try {
    const sent = await sendAll(emails, resend, id);
    await db.from("fan_emails").update({ status: "sent", sent_count: sent }).eq("id", id);
    return json(200, { sent });
  } catch (e) {
    // nothing went out: free the show up to try again. Some went: keep it, so nobody gets it twice.
    if (!e.sent) await db.from("fan_emails").delete().eq("id", id);
    else await db.from("fan_emails").update({ status: "failed", sent_count: e.sent }).eq("id", id);
    return json(502, { error: e.sent ? "It stopped partway: " + e.sent + " fans got it. " + e.message : e.message });
  }
};
