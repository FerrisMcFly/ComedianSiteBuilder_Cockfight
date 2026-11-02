// POST /.netlify/functions/invite-email { token, email } (logged in, whoever made the invite or can edit the comic)
// Emails an invite link (27_invites.sql) to the comic, as another way to send it besides a text. Once per link.
// Sent through Resend (RESEND_API_KEY); until that's set up it says so and the link can still be texted.
import { createClient } from "@supabase/supabase-js";
import { esc, fromName } from "../lib/fan-email.mjs";

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async (req) => {
  if (req.method !== "POST") return json(405, { error: "Use POST." });
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY, resend = process.env.RESEND_API_KEY;
  if (!url || !key) return json(500, { error: "This isn't set up yet." });
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const db = createClient(url, key, { auth: { persistSession: false } });
  const { data: who } = token ? await db.auth.getUser(token) : { data: null };
  if (!who || !who.user) return json(401, { error: "Log in first." });
  let body = {}; try { body = await req.json(); } catch (e) {}
  const to = String(body.email || "").trim();
  if (!/^[^@\s<>,;"]+@[^@\s<>,;"]+\.[^@\s<>,;"]+$/.test(to) || to.length > 200) return json(400, { error: "Add their email address." });
  if (!UUID.test(String(body.token || ""))) return json(400, { error: "Make a new link first." });
  const { data: inv } = await db.from("invites").select("*").eq("token", body.token).maybeSingle();
  if (!inv) return json(404, { error: "That link is gone. Make a new one." });
  let allowed = inv.created_by === who.user.id;
  if (!allowed) {
    const r = await fetch(url.replace(/\/$/, "") + "/rest/v1/rpc/can_edit_comic", { method: "POST", headers: { apikey: key, Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify({ c: inv.comic_id }) });
    allowed = r.ok && (await r.json().catch(() => false)) === true;
  }
  if (!allowed) return json(403, { error: "You can't send this invite." });
  if (inv.used_at) return json(400, { error: "That link was already used." });
  if (Date.parse(inv.expires_at) < Date.now()) return json(400, { error: "That link expired. Make a new one." });
  if (inv.emailed_at) return json(409, { error: "That link was already emailed. Text it, or make a new one." });
  if (!resend) return json(503, { error: "Email isn't switched on yet. Text the link for now." });
  const { data: comic } = await db.from("comics").select("name").eq("id", inv.comic_id).maybeSingle();
  const { data: site } = inv.site_id ? await db.from("sites").select("name").eq("id", inv.site_id).maybeSingle() : { data: null };
  const first = String((comic && comic.name) || "there").split(" ")[0];
  const link = (process.env.URL || "https://comictable.com").replace(/\/$/, "") + "/invite/" + inv.token;
  const line = "Your Coaster on ComicTable is ready" + (site ? ", and you're on " + site.name : "") + ". Tap below, pick a username and password, and it's yours. The link works once and lasts 7 days.";
  const { error: claimErr } = await db.from("invites").update({ emailed_at: new Date().toISOString() }).eq("token", inv.token);
  if (claimErr) return json(500, { error: /emailed_at/.test(claimErr.message) ? "This needs the latest database upgrade." : claimErr.message });
  const r = await fetch("https://api.resend.com/emails", { method: "POST", signal: AbortSignal.timeout(15000),
    headers: { Authorization: "Bearer " + resend, "Content-Type": "application/json", "Idempotency-Key": "invite-" + inv.token },
    body: JSON.stringify({ from: fromName("ComicTable") + " <" + (process.env.INVITE_EMAIL_FROM || process.env.FAN_EMAIL_FROM || "shows@comictable.com") + ">", to: [to],
      subject: first + ", your Coaster is ready", text: "Hey " + first + "! " + line + "\n\n" + link,
      html: '<!doctype html><html><body style="margin:0;background:#f4efe6;padding:24px 12px;font:16px/1.5 -apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;color:#1b1714"><div style="max-width:480px;margin:0 auto;background:#fff;border-radius:14px;padding:28px 24px">' +
        '<p style="margin:0 0 14px;font-size:20px;font-weight:800">Hey ' + esc(first) + "!</p><p style=\"margin:0 0 20px\">" + esc(line) + '</p><a href="' + esc(link) + '" style="display:inline-block;background:#e66a4b;color:#fff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:999px">Set up my Coaster</a>' +
        '<p style="margin:20px 0 0;font-size:12px;color:#7a7065;word-break:break-all">' + esc(link) + "</p></div></body></html>" }) });
  if (!r.ok) {
    await db.from("invites").update({ emailed_at: null }).eq("token", inv.token);
    const b = await r.json().catch(() => ({}));
    return json(502, { error: (b && b.message) || "The email didn't go. Text the link instead." });
  }
  return json(200, { sent: true });
};
