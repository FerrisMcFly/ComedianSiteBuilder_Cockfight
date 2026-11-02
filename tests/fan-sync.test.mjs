// Mailchimp sync (netlify/functions/fan-sync.mjs, fan-sync-scheduled.mjs, netlify/lib/fan-sync.mjs): runs the real
// functions and Supabase client against a small in-memory database, login and Mailchimp.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

// a made-up key in Mailchimp's shape (built here so it never looks like a real one in the code)
const FAKE = "0123456789abcdef".repeat(2), KEY = FAKE + "-us21";
let tables, mcCalls, mcMembers, realFetch, handler, scheduled, lib, badKey;
function reset() {
  tables = {
    comics: [{ id: "rita-r", name: "Rita Ramos" }, { id: "sam-s", name: "Sam" }],
    comic_fans: [
      { comic_id: "rita-r", email: "rae@x.com", name: "Rae Lin", city: "Boston", state: "MA", created_at: "2026-10-01T10:00:00Z" },
      { comic_id: "rita-r", email: "jo@x.com", name: null, city: null, state: null, created_at: "2026-10-02T10:00:00Z" },
      { comic_id: "sam-s", email: "other@x.com", created_at: "2026-10-02T10:00:00Z" }],
    fan_syncs: [],
  };
  mcCalls = []; mcMembers = new Set(["already@x.com"]); badKey = false;
}
const send = (status, body) => new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
function filters(u) {
  const f = [];
  for (const [k, v] of u.searchParams) if (/^(eq|is|gte)\./.test(v)) f.push([k, v.split(".")[0], v.slice(v.indexOf(".") + 1)]);
  return (r) => f.every(([k, op, v]) => op === "eq" ? String(r[k]) === v : op === "gte" ? String(r[k]) >= v : (r[k] ?? null) === null && v === "null");
}
async function fakeFetch(input, init = {}) {
  const u = new URL(typeof input === "string" ? input : input.url), method = (init.method || "GET").toUpperCase(), headers = new Headers(init.headers || {});
  if (u.hostname === "us21.api.mailchimp.com") {
    mcCalls.push({ path: u.pathname + u.search, method, auth: headers.get("authorization"), body: init.body ? JSON.parse(init.body) : null });
    if (badKey) return send(401, { title: "API Key Invalid" });
    if (u.pathname === "/3.0/lists") return send(200, { lists: [{ id: "aud123", name: "Rita's fans", stats: { member_count: 40 } }] });
    const m = u.pathname.match(/^\/3\.0\/lists\/(\w+)$/);
    if (m && method === "POST") {
      const b = JSON.parse(init.body), out = { new_members: [], errors: [] };
      for (const x of b.members) { if (mcMembers.has(x.email_address)) out.errors.push({ email_address: x.email_address, error: x.email_address + " is already a list member", error_code: "ERROR_CONTACT_EXISTS" }); else { mcMembers.add(x.email_address); out.new_members.push(x); } }
      return send(200, { ...out, total_created: out.new_members.length, total_updated: 0, error_count: out.errors.length });
    }
    return send(404, {});
  }
  if (u.pathname === "/auth/v1/user") { const t = (headers.get("authorization") || "").replace("Bearer ", ""); return t === "tok-rita" ? send(200, { id: "u-rita", aud: "authenticated" }) : t === "tok-sam" ? send(200, { id: "u-sam", aud: "authenticated" }) : send(401, { message: "bad" }); }
  if (u.pathname === "/rest/v1/rpc/can_edit_comic") { const b = JSON.parse(init.body); const t = (headers.get("authorization") || "").replace("Bearer ", ""); return send(200, t === "tok-rita" && b.c === "rita-r"); }
  const t = u.pathname.replace("/rest/v1/", ""), rows = tables[t] || (tables[t] = []), match = filters(u);
  const one = /vnd\.pgrst\.object/.test(headers.get("accept") || "");
  if (method === "GET") { let l = rows.filter(match); const o = u.searchParams.get("order"); if (o) { const [k, dir] = o.split("."); l = [...l].sort((a, b) => String(a[k]).localeCompare(String(b[k])) * (dir === "desc" ? -1 : 1)); } return one ? (l.length ? send(200, l[0]) : send(200, null)) : send(200, l); }
  if (method === "PATCH") { const b = JSON.parse(init.body); rows.filter(match).forEach((r) => Object.assign(r, b)); return send(204); }
  if (method === "DELETE") { tables[t] = rows.filter((r) => !match(r)); return send(204); }
  if (method === "POST") { const keys = (u.searchParams.get("on_conflict") || "").split(",").filter(Boolean);
    for (const r of [].concat(JSON.parse(init.body))) { const i = rows.findIndex((x) => keys.length && keys.every((k) => x[k] === r[k])); if (i >= 0) rows[i] = { ...rows[i], ...r }; else rows.push(r); } return send(201); }
  return send(400, {});
}
before(async () => {
  process.env.SUPABASE_URL = "https://db.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "service"; process.env.SITE = "platform";
  realFetch = globalThis.fetch; globalThis.fetch = fakeFetch;
  handler = (await import("../netlify/functions/fan-sync.mjs")).default;
  scheduled = await import("../netlify/functions/fan-sync-scheduled.mjs");
  lib = await import("../netlify/lib/fan-sync.mjs");
});
after(() => { globalThis.fetch = realFetch; delete process.env.SITE; });
const call = async (body, token = "tok-rita") => { const r = await handler(new Request("https://x/.netlify/functions/fan-sync", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + token }, body: JSON.stringify(body) })); return { status: r.status, body: await r.json() }; };

test("connecting Mailchimp: find the audiences, connect, and every fan goes over, tagged with their city", async () => {
  reset();
  let r = await call({ action: "status", comic: "rita-r" });
  assert.deepEqual(r.body, { connected: false });
  r = await call({ action: "audiences", comic: "rita-r", key: KEY });
  assert.deepEqual(r.body.audiences, [{ id: "aud123", name: "Rita's fans", members: 40 }]);
  r = await call({ action: "connect", comic: "rita-r", key: KEY, list_id: "aud123" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.connected, true); assert.equal(r.body.list_name, "Rita's fans"); assert.equal(r.body.last_count, 2); assert.equal(r.body.key_hint, "cdef");
  const push = mcCalls.find((c) => c.method === "POST");
  assert.equal(push.path, "/3.0/lists/aud123?skip_merge_validation=true");
  assert.equal(push.body.update_existing, false, "anyone already there, including people who unsubscribed, is left alone");
  assert.deepEqual(push.body.members, [
    { email_address: "rae@x.com", status: "subscribed", merge_fields: { FNAME: "Rae" }, tags: ["ComicTable", "Boston, MA"] },
    { email_address: "jo@x.com", status: "subscribed", merge_fields: {}, tags: ["ComicTable"] }], "only Rita's fans");
  assert.equal(push.auth, "Basic " + Buffer.from("comictable:" + KEY).toString("base64"));
});

test("the key is stored encrypted and never comes back to the dashboard", async () => {
  reset();
  await call({ action: "connect", comic: "rita-r", key: KEY, list_id: "aud123" });
  const row = tables.fan_syncs[0];
  assert.ok(!JSON.stringify(row).includes(KEY.slice(0, 32)), "not stored as typed");
  assert.equal(lib.unseal(row.secret), KEY);
  const st = await call({ action: "status", comic: "rita-r" });
  assert.ok(!JSON.stringify(st.body).includes(KEY.slice(0, 32)) && !("secret" in st.body));
  process.env.SUPABASE_SERVICE_ROLE_KEY = "another"; assert.equal(lib.unseal(row.secret), null, "useless without the server's secret"); process.env.SUPABASE_SERVICE_ROLE_KEY = "service";
});

test("new fans follow: Send now and the 30-minute run send only who joined since; people already there are skipped", async () => {
  reset();
  await call({ action: "connect", comic: "rita-r", key: KEY, list_id: "aud123" });
  tables.comic_fans.push({ comic_id: "rita-r", email: "new@x.com", name: "Nia", city: "Chicago", state: "IL", created_at: "2026-10-05T10:00:00Z" },
    { comic_id: "rita-r", email: "already@x.com", created_at: "2026-10-06T10:00:00Z" });
  mcCalls = [];
  let r = await call({ action: "sync", comic: "rita-r" });
  assert.equal(r.body.last_count, 1);
  assert.deepEqual(mcCalls[0].body.members.map((m) => m.email_address), ["jo@x.com", "new@x.com", "already@x.com"], "from the last one sent on (repeats are harmless)");
  assert.equal(r.body.last_error, null);
  tables.comic_fans.push({ comic_id: "rita-r", email: "late@x.com", created_at: "2026-10-07T10:00:00Z" });
  await scheduled.default();
  assert.ok(mcMembers.has("late@x.com"));
  assert.equal(tables.fan_syncs[0].synced_until, "2026-10-07T10:00:00Z");
  assert.equal(scheduled.config.schedule, "*/30 * * * *");
});

test("a key Mailchimp turns down is said plainly; nobody else can touch a comic's sync; a bad key never reaches a stranger's server", async () => {
  reset();
  await call({ action: "connect", comic: "rita-r", key: KEY, list_id: "aud123" });
  badKey = true;
  const r = await call({ action: "sync", comic: "rita-r" });
  assert.match(r.body.last_error, /doesn't work/);
  assert.match((await call({ action: "audiences", comic: "rita-r", key: KEY })).body.error, /doesn't work/);
  assert.equal((await call({ action: "status", comic: "rita-r" }, "tok-sam")).status, 403, "Sam can't see Rita's");
  assert.equal((await call({ action: "status", comic: "rita-r" }, "nobody")).status, 401);
  mcCalls = [];
  assert.match((await call({ action: "audiences", comic: "rita-r", key: "abc-evil.example.com/x" })).body.error, /doesn't look like/);
  assert.equal(mcCalls.length, 0);
  assert.equal(lib.dcOf(KEY + ".evil.com"), null);
  assert.deepEqual((await call({ action: "disconnect", comic: "rita-r" })).body, { connected: false });
  assert.equal(tables.fan_syncs.length, 0);
});
