// comictable.com/go/<show>?f=site|coaster|embed|email&s=<site>: a Tickets tap. Counts it (ticket_taps, 28_ticket_taps.sql)
// and sends the fan straight on to that show's ticket page. It only ever goes to the ticket link saved on the show,
// so nobody can use it to send people somewhere else. Link-preview robots and the like aren't counted.
import { createClient } from "@supabase/supabase-js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROBOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|whatsapp|discord|slack|telegram|skype|vkshare|pinterest|headless|lighthouse|curl|wget|python|node-fetch|axios/i;
const SOURCES = ["site", "coaster", "embed", "email"];
const away = (to) => new Response(null, { status: 302, headers: { Location: to, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer-when-downgrade" } });

export const isRobot = (ua) => !ua || ROBOT.test(ua);

export default async (req) => {
  const u = new URL(req.url);
  const id = (u.pathname.match(/\/go\/([^/?#]+)/) || [])[1] || "";
  const home = u.origin + "/";
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!UUID.test(id) || !url || !key) return away(home);
  const db = createClient(url, key, { auth: { persistSession: false } });
  const { data: show } = await db.from("shows").select("id, url, comic_id").eq("id", id).maybeSingle();
  const to = show && /^https?:\/\//i.test(String(show.url || "").trim()) ? String(show.url).trim() : "";
  if (!to) return away(home);
  if (req.method === "GET" && !isRobot(req.headers.get("user-agent") || "")) {
    const f = u.searchParams.get("f"), s = u.searchParams.get("s");
    const tap = { show_id: show.id, comic_id: show.comic_id || null, source: SOURCES.includes(f) ? f : "other", site_id: /^[a-z0-9][a-z0-9-]{1,40}$/.test(s || "") ? s : null };
    try {
      const { error } = await db.from("ticket_taps").insert(tap);
      // a site id that doesn't exist (or a database without ticket_taps yet) never stops the fan getting their tickets
      if (error && tap.site_id) await db.from("ticket_taps").insert({ ...tap, site_id: null });
    } catch (e) {}
  }
  return away(to);
};
