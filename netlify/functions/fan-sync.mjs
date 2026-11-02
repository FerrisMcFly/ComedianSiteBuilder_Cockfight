// POST /.netlify/functions/fan-sync { action, comic, key?, list_id? } (logged in, someone who can edit the comic)
//   status      → { connected, list_name, key_hint, last_run, last_count, last_error }
//   audiences   → { audiences: [{ id, name, members }] } for a pasted key
//   connect     → saves the key (encrypted) and audience, sends every fan now, returns the status
//   sync        → "Send now": fans who joined since the last run
//   disconnect  → forgets the key
// The key never comes back out. Table: supabase/29_fan_sync.sql. Helpers: netlify/lib/fan-sync.mjs.
import { createClient } from "@supabase/supabase-js";
import { audiences, seal, syncComic, statusOf, dcOf, MailchimpError } from "../lib/fan-sync.mjs";

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

// asks the database itself (as the person) whether they can edit this comic: the same rule as everywhere else
async function canEdit(url, key, token, comic) {
  const r = await fetch(url.replace(/\/$/, "") + "/rest/v1/rpc/can_edit_comic", { method: "POST",
    headers: { apikey: key, Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify({ c: comic }) });
  return r.ok && (await r.json().catch(() => false)) === true;
}

export default async (req) => {
  if (req.method !== "POST") return json(405, { error: "Use POST." });
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return json(500, { error: "This isn't set up yet." });
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const db = createClient(url, key, { auth: { persistSession: false } });
  const { data: who } = token ? await db.auth.getUser(token) : { data: null };
  if (!who || !who.user) return json(401, { error: "Log in first." });
  let body = {}; try { body = await req.json(); } catch (e) {}
  const comic = String(body.comic || "");
  if (!/^[a-z0-9][a-z0-9-]{1,60}$/.test(comic) || !(await canEdit(url, key, token, comic))) return json(403, { error: "You can't change this comic's fan list." });
  const row = async () => (await db.from("fan_syncs").select("*").eq("comic_id", comic).maybeSingle()).data;
  try {
    switch (body.action) {
      case "status": return json(200, statusOf(await row()));
      case "audiences": return json(200, { audiences: await audiences(body.key) });
      case "connect": {
        const k = String(body.key || "").trim();
        if (!dcOf(k)) return json(400, { error: "That doesn't look like a Mailchimp API key. It ends in something like -us21." });
        const list = (await audiences(k)).find((a) => a.id === body.list_id);
        if (!list) return json(400, { error: "Pick one of your audiences." });
        const { error } = await db.from("fan_syncs").upsert({ comic_id: comic, provider: "mailchimp", secret: seal(k), key_hint: k.split("-")[0].slice(-4), list_id: list.id, list_name: list.name,
          synced_until: null, last_run: null, last_count: 0, last_error: null, connected_by: who.user.id }, { onConflict: "comic_id" });
        if (error) return json(500, { error: /fan_syncs/.test(error.message) ? "This needs the latest database upgrade." : error.message });
        await syncComic(db, await row());
        return json(200, statusOf(await row()));
      }
      case "sync": {
        const r = await row();
        if (!r) return json(400, { error: "Connect Mailchimp first." });
        await syncComic(db, r);
        return json(200, statusOf(await row()));
      }
      case "disconnect":
        await db.from("fan_syncs").delete().eq("comic_id", comic);
        return json(200, { connected: false });
      default: return json(400, { error: "Unknown action." });
    }
  } catch (e) {
    if (e instanceof MailchimpError) return json(e.status === 401 ? 400 : e.status >= 500 ? 502 : 400, { error: e.message });
    return json(500, { error: "Something went wrong. Try again." });
  }
};
