// Emailing an invite link (netlify/functions/invite-email.mjs): real function and Supabase client, fake database and Resend.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

const T1 = "11111111-2222-4333-8444-555555555555", T2 = "11111111-2222-4333-8444-666666666666";
let tables, sent, realFetch, handler, resendFails;
function reset() {
  const soon = new Date(Date.now() + 864e5).toISOString(), past = new Date(Date.now() - 864e5).toISOString();
  tables = {
    comics: [{ id: "rita-r", name: "Rita Ramos" }],
    sites: [{ id: "cockfight", name: "Cockfight" }],
    invites: [{ token: T1, comic_id: "rita-r", site_id: "cockfight", created_by: "u-ferris", expires_at: soon, used_at: null, emailed_at: null },
      { token: T2, comic_id: "rita-r", site_id: null, created_by: "u-ferris", expires_at: past, used_at: null, emailed_at: null }],
  };
  sent = []; resendFails = false;
}
const send = (status, body) => new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
async function fakeFetch(input, init = {}) {
  const u = new URL(typeof input === "string" ? input : input.url), method = (init.method || "GET").toUpperCase(), headers = new Headers(init.headers || {});
  if (u.hostname === "api.resend.com") { if (resendFails) return send(422, { message: "Domain not verified" }); sent.push(JSON.parse(init.body)); return send(200, { id: "e1" }); }
  const t = (headers.get("authorization") || "").replace("Bearer ", "");
  if (u.pathname === "/auth/v1/user") return ({ "tok-ferris": "u-ferris", "tok-other": "u-other" })[t] ? send(200, { id: ({ "tok-ferris": "u-ferris", "tok-other": "u-other" })[t], aud: "authenticated" }) : send(401, {});
  if (u.pathname === "/rest/v1/rpc/can_edit_comic") return send(200, false);
  const tbl = u.pathname.replace("/rest/v1/", ""), rows = tables[tbl] || [];
  const f = [...u.searchParams].filter(([, v]) => v.startsWith("eq.")).map(([k, v]) => [k, v.slice(3)]);
  const hit = rows.filter((r) => f.every(([k, v]) => String(r[k]) === v));
  if (method === "GET") return /vnd\.pgrst\.object/.test(headers.get("accept") || "") ? send(200, hit[0] || null) : send(200, hit);
  if (method === "PATCH") { const b = JSON.parse(init.body); hit.forEach((r) => Object.assign(r, b)); return send(204); }
  return send(400, {});
}
before(async () => {
  process.env.SUPABASE_URL = "https://db.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "service"; process.env.URL = "https://comictable.com";
  realFetch = globalThis.fetch; globalThis.fetch = fakeFetch;
  handler = (await import("../netlify/functions/invite-email.mjs")).default;
});
after(() => { globalThis.fetch = realFetch; delete process.env.RESEND_API_KEY; delete process.env.URL; });
const post = async (body, tok = "tok-ferris") => { const r = await handler(new Request("https://x/.netlify/functions/invite-email", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + tok }, body: JSON.stringify(body) })); return { status: r.status, body: await r.json() }; };

test("an invite link can be emailed once: it says who it's from, what it's for, and links to the set-up page", async () => {
  reset(); process.env.RESEND_API_KEY = "re_test";
  const r = await post({ token: T1, email: "rita@x.com" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(sent[0].to, ["rita@x.com"]);
  assert.equal(sent[0].subject, "Rita, your Coaster is ready");
  assert.equal(sent[0].from, "ComicTable <shows@comictable.com>");
  assert.match(sent[0].html, new RegExp('href="https://comictable.com/invite/' + T1 + '"'));
  assert.match(sent[0].text, /you're on Cockfight/);
  assert.ok(tables.invites[0].emailed_at);
  assert.equal((await post({ token: T1, email: "rita@x.com" })).status, 409, "once per link");
  assert.equal(sent.length, 1);
});

test("only for links that still work, sent by whoever made them; off until email is switched on; a failed send can be retried", async () => {
  reset(); delete process.env.RESEND_API_KEY;
  assert.match((await post({ token: T1, email: "rita@x.com" })).body.error, /isn't switched on/);
  assert.equal(tables.invites[0].emailed_at, null);
  process.env.RESEND_API_KEY = "re_test";
  assert.match((await post({ token: T2, email: "rita@x.com" })).body.error, /expired/);
  assert.equal((await post({ token: T1, email: "rita@x.com" }, "tok-other")).status, 403);
  assert.equal((await post({ token: T1, email: "nope" })).status, 400);
  assert.equal((await post({ token: T1, email: "a@b.co, c@d.co" })).status, 400, "one address only");
  resendFails = true;
  assert.equal((await post({ token: T1, email: "rita@x.com" })).status, 502);
  assert.equal(tables.invites[0].emailed_at, null);
  resendFails = false;
  assert.equal((await post({ token: T1, email: "rita@x.com" })).status, 200);
});
