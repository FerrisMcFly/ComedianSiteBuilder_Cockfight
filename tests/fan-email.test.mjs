// Emailing fans near a show (netlify/functions/fan-email.mjs) and the unsubscribe link (unsub.mjs): runs the real
// functions and Supabase client against a small in-memory database, login and Resend.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const SHOW = "11111111-2222-4333-8444-555555555555", PAST = "11111111-2222-4333-8444-666666666666", OTHER = "11111111-2222-4333-8444-777777777777", HOSTED = "11111111-2222-4333-8444-888888888888";
const TOK = { rae: "aaaaaaaa-0000-4000-8000-000000000001", kim: "aaaaaaaa-0000-4000-8000-000000000002", den: "aaaaaaaa-0000-4000-8000-000000000003", site: "aaaaaaaa-0000-4000-8000-000000000004" };
const soon = new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10);
let tables, sentBatches, realFetch, handler, unsub, resendFails;
function reset() {
  tables = {
    comics: [{ id: "rita-r", name: "Rita Ramos" }],
    hosts: [{ id: "h-rita", comic_id: "rita-r", site_id: "cockfight" }],
    shows: [{ id: SHOW, comic_id: "rita-r", date: soon, time: "8:00 PM", venue: "Laugh Boston", venue_id: "v1", city: "Boston, MA", url: "https://tix.test/1" },
      { id: PAST, comic_id: "rita-r", date: "2020-01-01", venue: "Laugh Boston", venue_id: "v1", city: "Boston, MA" },
      { id: OTHER, comic_id: "sam-s", date: soon, venue: "Laugh Boston", venue_id: "v1" },
      { id: HOSTED, host: "h-rita", site_id: "cockfight", date: soon, venue: "Laugh Boston", venue_id: "v1", city: "Boston, MA" }],
    venues: [{ id: "v1", lat: 42.35, lng: -71.06 }],
    comic_fans: [
      { comic_id: "rita-r", email: "rae@x.com", name: "Rae", city: "Boston", lat: 42.36, lng: -71.05, token: TOK.rae },
      { comic_id: "rita-r", email: "Kim@X.com", name: "Kim", city: "Cambridge", lat: 42.37, lng: -71.11, token: TOK.kim },
      { comic_id: "rita-r", email: "den@x.com", city: "Denver", lat: 39.74, lng: -104.99, token: TOK.den },
      { comic_id: "rita-r", email: "nozip@x.com", lat: null, lng: null, token: "aaaaaaaa-0000-4000-8000-000000000009" },
      { comic_id: "sam-s", email: "kim@x.com", lat: 42.36, lng: -71.05, token: "aaaaaaaa-0000-4000-8000-000000000008" }],
    fans: [{ site_id: "cockfight", email: "kim@x.com", token: TOK.site }, { site_id: "cockfight", email: "keep@x.com", token: "aaaaaaaa-0000-4000-8000-00000000000a" }],
    fan_emails: [],
  };
  sentBatches = []; resendFails = false;
}
const send = (status, body) => new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
function filters(u) {
  const f = [];
  for (const [k, v] of u.searchParams) if (/^(eq|is|gte|ilike|not)\./.test(v)) f.push([k, v.split(".")[0], v.slice(v.indexOf(".") + 1)]);
  return (r) => f.every(([k, op, v]) => op === "eq" ? String(r[k]) === v : op === "gte" ? String(r[k]) >= v : op === "ilike" ? String(r[k]).toLowerCase() === v.replace(/\\(.)/g, "$1").toLowerCase()
    : op === "not" ? (v === "is.null" ? r[k] != null : true) : (r[k] ?? null) === null && v === "null");
}
async function fakeFetch(input, init = {}) {
  const u = new URL(typeof input === "string" ? input : input.url), method = (init.method || "GET").toUpperCase(), headers = new Headers(init.headers || {});
  if (u.hostname === "api.resend.com") {
    if (resendFails) return send(422, { message: "The comictable.com domain is not verified." });
    const b = JSON.parse(init.body); sentBatches.push({ auth: headers.get("authorization"), idem: headers.get("idempotency-key"), emails: b });
    return send(200, { data: b.map((_, i) => ({ id: "e" + i })) });
  }
  if (u.pathname === "/auth/v1/user") { const t = (headers.get("authorization") || "").replace("Bearer ", ""); return t === "tok-rita" ? send(200, { id: "u-rita", aud: "authenticated" }) : send(401, { message: "bad" }); }
  if (u.pathname === "/rest/v1/rpc/can_edit_comic") { const b = JSON.parse(init.body); return send(200, b.c === "rita-r"); }
  const t = u.pathname.replace("/rest/v1/", ""), rows = tables[t] || (tables[t] = []), match = filters(u);
  const one = /vnd\.pgrst\.object/.test(headers.get("accept") || "");
  if (method === "GET") { const l = rows.filter(match); return one ? send(200, l[0] || null) : send(200, l); }
  if (method === "PATCH") { const b = JSON.parse(init.body); rows.filter(match).forEach((r) => Object.assign(r, b)); return send(204); }
  if (method === "DELETE") { tables[t] = rows.filter((r) => !match(r)); return send(204); }
  if (method === "POST") {
    for (const r of [].concat(JSON.parse(init.body))) {
      if (t === "fan_emails" && r.show_id && rows.some((x) => x.show_id === r.show_id)) return send(409, { code: "23505", message: "duplicate key value violates unique constraint \"fan_emails_one_per_show\"" });
      rows.push({ created_at: new Date().toISOString(), status: "sending", sent_count: 0, ...r });
    }
    return send(201);
  }
  return send(400, {});
}
before(async () => {
  process.env.SUPABASE_URL = "https://db.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "service"; process.env.URL = "https://comictable.com";
  realFetch = globalThis.fetch; globalThis.fetch = fakeFetch;
  handler = (await import("../netlify/functions/fan-email.mjs")).default;
  unsub = (await import("../netlify/functions/unsub.mjs")).default;
});
after(() => { globalThis.fetch = realFetch; delete process.env.RESEND_API_KEY; delete process.env.URL; });
const call = async (body, token = "tok-rita") => { const r = await handler(new Request("https://x/.netlify/functions/fan-email", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + token }, body: JSON.stringify(body) })); return { status: r.status, body: await r.json() }; };
const mail = (extra) => call({ action: "send", comic: "rita-r", show_id: SHOW, subject: "Rita: Laugh Boston", message: "Boston! I'm back.\n\nBring a friend.", ...extra });

test("off until Resend is set up: the dashboard is told, and nothing can be sent", async () => {
  reset(); delete process.env.RESEND_API_KEY;
  assert.deepEqual((await call({ action: "info", comic: "rita-r" })).body, { ready: false, per_week: 3, left: 3, sent: {} });
  assert.equal((await mail()).status, 503);
  assert.equal(sentBatches.length, 0);
});

test("it goes to the comic's fans within 50 miles, each with the show, a counted Tickets link and their own unsubscribe", async () => {
  reset(); process.env.RESEND_API_KEY = "re_test";
  const r = await mail();
  assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.sent, 2);
  const emails = sentBatches[0].emails;
  assert.deepEqual(emails.map((e) => e.to[0]), ["rae@x.com", "Kim@X.com"], "Boston and Cambridge; not Denver, not fans without a ZIP, not another comic's");
  assert.equal(sentBatches[0].auth, "Bearer re_test");
  const e = emails[0];
  assert.equal(e.from, "Rita Ramos <shows@comictable.com>"); assert.equal(e.subject, "Rita: Laugh Boston");
  assert.match(e.html, /<p[^>]*>Boston! I&#39;m back\.<\/p><p[^>]*>Bring a friend\.<\/p>/, "their words, escaped, in paragraphs");
  assert.match(e.html, /href="https:\/\/comictable\.com\/go\/11111111-2222-4333-8444-555555555555\?f=email"/);
  assert.match(e.html, new RegExp("https://comictable.com/unsub/" + TOK.rae));
  assert.equal(e.headers["List-Unsubscribe"], "<https://comictable.com/unsub/" + TOK.rae + ">");
  assert.equal(e.headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
  assert.match(e.text, /Tickets: https:\/\/comictable\.com\/go\//);
  assert.deepEqual(tables.fan_emails.map((x) => [x.show_id, x.status, x.sent_count]), [[SHOW, "sent", 2]]);
  const info = (await call({ action: "info", comic: "rita-r" })).body;
  assert.equal(info.left, 2); assert.equal(info.sent[SHOW].count, 2);
});

test("once per show, three a week, only your own upcoming shows, and nothing scripted gets through", async () => {
  reset(); process.env.RESEND_API_KEY = "re_test";
  await mail();
  assert.match((await mail()).body.error, /already emailed/);
  assert.equal(sentBatches.length, 1);
  assert.equal((await mail({ show_id: OTHER })).status, 404);
  assert.match((await mail({ show_id: PAST })).body.error, /already happened/);
  assert.equal((await mail({ show_id: HOSTED })).status, 200, "a show on a site's lineup counts as theirs");
  assert.equal((await mail({ show_id: HOSTED })).status, 409);
  tables.fan_emails.push({ comic_id: "rita-r", show_id: null, status: "sent", created_at: new Date().toISOString() });
  tables.shows.push({ id: "11111111-2222-4333-8444-999999999999", comic_id: "rita-r", date: soon, venue_id: "v1" });
  assert.equal((await mail({ show_id: "11111111-2222-4333-8444-999999999999" })).status, 429);
  reset();
  await mail({ message: "<script>alert(1)</script> hi there", subject: "x" });
  assert.ok(!sentBatches[0].emails[0].html.includes("<script>"));
  reset(); tables.comics[0].name = 'Evil" <x@evil.com>, a';
  await mail();
  assert.equal(sentBatches[0].emails[0].from, "Evil xevil.com a <shows@comictable.com>");
  assert.equal((await call({ action: "info", comic: "sam-s" })).status, 403);
  assert.equal((await call({ action: "info", comic: "rita-r" }, "nobody")).status, 401);
});

test("if the email service says no, nothing is marked sent and the comic can try again", async () => {
  reset(); process.env.RESEND_API_KEY = "re_test"; resendFails = true;
  const r = await mail();
  assert.equal(r.status, 502); assert.match(r.body.error, /not verified/);
  assert.equal(tables.fan_emails.length, 0);
  resendFails = false;
  assert.equal((await mail()).status, 200);
});

test("unsubscribe: opening the link changes nothing; the button (or the mail app's one-click) takes them off every list", async () => {
  reset();
  const get = await unsub(new Request("https://comictable.com/unsub/" + TOK.kim));
  assert.match(await get.text(), /Stop all emails to Kim@X\.com[\s\S]*<form method="post">/);
  assert.equal(tables.comic_fans.length, 5, "a mail scanner opening it doesn't unsubscribe anyone");
  const post = await unsub(new Request("https://comictable.com/unsub/" + TOK.kim, { method: "POST", body: "List-Unsubscribe=One-Click" }));
  assert.match(await post.text(), /You're off the list/);
  assert.deepEqual(tables.comic_fans.map((f) => f.email), ["rae@x.com", "den@x.com", "nozip@x.com"], "Rita's and Sam's lists, any capitalization");
  assert.deepEqual(tables.fans.map((f) => f.email), ["keep@x.com"], "and the sites' lists");
  assert.match(await (await unsub(new Request("https://comictable.com/unsub/" + TOK.kim))).text(), /isn't on any list/);
  assert.match(await (await unsub(new Request("https://comictable.com/unsub/nope"))).text(), /doesn't work/);
  const build = readFileSync(new URL("../tools/build.mjs", import.meta.url), "utf8");
  assert.match(build, /"\/unsub\/\*  \/\.netlify\/functions\/unsub  200"/);
});
