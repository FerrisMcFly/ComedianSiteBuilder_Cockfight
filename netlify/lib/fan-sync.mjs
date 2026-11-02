// Sending a comic's fans to their own Mailchimp audience (Step 5, item 51). Used by netlify/functions/fan-sync.mjs
// (connect, "Send now", disconnect) and fan-sync-scheduled.mjs (new fans every 30 minutes). Table: 29_fan_sync.sql.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

// A Mailchimp API key ends in its data center ("…-us21"); that's the only host we ever call.
export const dcOf = (key) => { const m = String(key || "").trim().match(/^[0-9a-f]{32}-([a-z]{2}\d{1,3})$/i); return m ? m[1].toLowerCase() : null; };

// The key is kept encrypted with a secret only the server has (derived from the service key), so a copy of the
// database alone doesn't give anyone the comic's Mailchimp.
const secretKey = () => createHash("sha256").update("comictable-fan-sync:" + (process.env.SUPABASE_SERVICE_ROLE_KEY || "")).digest();
export function seal(text) {
  const iv = randomBytes(12), c = createCipheriv("aes-256-gcm", secretKey(), iv);
  const body = Buffer.concat([c.update(String(text), "utf8"), c.final()]);
  return ["v1", iv.toString("base64"), c.getAuthTag().toString("base64"), body.toString("base64")].join(".");
}
export function unseal(sealed) {
  try {
    const [v, iv, tag, body] = String(sealed).split(".");
    if (v !== "v1") return null;
    const d = createDecipheriv("aes-256-gcm", secretKey(), Buffer.from(iv, "base64"));
    d.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([d.update(Buffer.from(body, "base64")), d.final()]).toString("utf8");
  } catch (e) { return null; }
}

export class MailchimpError extends Error { constructor(msg, status) { super(msg); this.status = status; } }
async function mc(key, path, init = {}) {
  const dc = dcOf(key);
  if (!dc) throw new MailchimpError("That doesn't look like a Mailchimp API key. It ends in something like -us21.", 400);
  let r;
  try {
    r = await fetch("https://" + dc + ".api.mailchimp.com/3.0" + path, { ...init, signal: AbortSignal.timeout(15000),
      headers: { Authorization: "Basic " + Buffer.from("comictable:" + String(key).trim()).toString("base64"), "Content-Type": "application/json", ...(init.headers || {}) } });
  } catch (e) { throw new MailchimpError("Mailchimp didn't answer. Try again in a minute.", 502); }
  const body = await r.json().catch(() => ({}));
  if (r.status === 401 || r.status === 403) throw new MailchimpError("Mailchimp says that key doesn't work. Make a new one in Mailchimp and connect again.", 401);
  if (!r.ok) throw new MailchimpError((body && (body.detail || body.title)) || "Mailchimp had a problem (" + r.status + ").", r.status);
  return body;
}

// The comic's audiences, to pick one
export async function audiences(key) {
  const b = await mc(key, "/lists?count=100&fields=lists.id,lists.name,lists.stats.member_count");
  return (b.lists || []).map((l) => ({ id: l.id, name: l.name, members: (l.stats && l.stats.member_count) || 0 }));
}

// What each fan looks like in Mailchimp: subscribed (they signed up for show emails), first name, and tagged
// "ComicTable" plus their city.
export function memberFor(f) {
  const city = [f.city, f.state].filter(Boolean).join(", ");
  const first = String(f.name || "").trim().split(/\s+/)[0] || "";
  return { email_address: String(f.email).trim(), status: "subscribed", merge_fields: first ? { FNAME: first.slice(0, 80) } : {}, tags: ["ComicTable"].concat(city ? [city.slice(0, 100)] : []) };
}

// Adds fans in batches of 500. update_existing: false, so anyone already in the audience (including people who
// unsubscribed there) is left exactly as they are.
export async function pushFans(key, listId, fans) {
  if (!/^[0-9a-z]{4,20}$/i.test(String(listId || ""))) throw new MailchimpError("Pick an audience.", 400);
  let added = 0, already = 0, failed = 0;
  for (let i = 0; i < fans.length; i += 500) {
    const b = await mc(key, "/lists/" + listId + "?skip_merge_validation=true", { method: "POST", body: JSON.stringify({ members: fans.slice(i, i + 500).map(memberFor), update_existing: false }) });
    added += b.total_created || (b.new_members || []).length || 0;
    for (const e of b.errors || []) { if (e.error_code === "ERROR_CONTACT_EXISTS" || /already a list member/i.test(e.error || "")) already++; else failed++; }
  }
  return { added, already, failed };
}

// One comic's sync: fans who joined since the last run (all of them the first time). Records how it went.
export async function syncComic(db, row) {
  const key = unseal(row.secret);
  const now = new Date().toISOString();
  const save = (patch) => db.from("fan_syncs").update({ last_run: now, ...patch }).eq("comic_id", row.comic_id);
  if (!key) { await save({ last_error: "Reconnect Mailchimp: the saved key can't be read any more." }); return { comic: row.comic_id, error: "key" }; }
  let q = db.from("comic_fans").select("email,name,city,state,created_at").eq("comic_id", row.comic_id).order("created_at", { ascending: true }).limit(5000);
  if (row.synced_until) q = q.gte("created_at", row.synced_until); // gte: fans with the same timestamp are never missed; repeats are skipped by Mailchimp
  const { data: fans, error } = await q;
  if (error) return { comic: row.comic_id, error: error.message };
  if (!fans.length) { await save({ last_count: 0, last_error: null }); return { comic: row.comic_id, added: 0 }; }
  try {
    const r = await pushFans(key, row.list_id, fans);
    await save({ synced_until: fans[fans.length - 1].created_at, last_count: r.added, last_error: r.failed ? r.failed + (r.failed === 1 ? " fan" : " fans") + " couldn't be added (Mailchimp turned down the address)." : null });
    return { comic: row.comic_id, ...r };
  } catch (e) {
    await save({ last_error: e.message });
    return { comic: row.comic_id, error: e.message };
  }
}

// What the dashboard sees: never the key itself
export const statusOf = (row) => row ? { connected: true, provider: row.provider, list_id: row.list_id, list_name: row.list_name, key_hint: row.key_hint, last_run: row.last_run, last_count: row.last_count, last_error: row.last_error } : { connected: false };
