// Invite links (netlify/functions/invite.mjs): the link a comic gets by text. Runs the real function and Supabase client
// against a small in-memory stand-in for the database and logins.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const T1 = "11111111-2222-4333-8444-555555555555", T2 = "11111111-2222-4333-8444-666666666666", T3 = "11111111-2222-4333-8444-777777777777";
let tables, users, realFetch, handler;
function reset() {
  users = [{ id: "u-taken", email: "taken@comictable.com" }];
  const soon = new Date(Date.now() + 864e5).toISOString(), past = new Date(Date.now() - 864e5).toISOString();
  tables = {
    comics: [{ id: "rita-r", name: "Rita Ramos", handle: "rita-ramos", photo_url: "https://p/rita.jpg", user_id: null }],
    sites: [{ id: "cockfight", name: "Cockfight" }],
    invites: [{ token: T1, comic_id: "rita-r", site_id: "cockfight", site_role: "editor", expires_at: soon, used_at: null },
      { token: T2, comic_id: "rita-r", site_id: null, expires_at: past, used_at: null },
      { token: T3, comic_id: "rita-r", site_id: null, expires_at: soon, used_at: null }],
    admins: [],
  };
}
const send = (status, body) => new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
function filters(u) {
  const f = [];
  for (const [k, v] of u.searchParams) if (/^(eq|is)\./.test(v)) f.push([k, v.split(".")[0], v.slice(v.indexOf(".") + 1)]);
  return (r) => f.every(([k, op, v]) => op === "eq" ? String(r[k]) === v : (r[k] ?? null) === null && v === "null");
}
async function fakeFetch(input, init = {}) {
  const u = new URL(typeof input === "string" ? input : input.url), method = (init.method || "GET").toUpperCase(), headers = new Headers(init.headers || {});
  if (u.pathname === "/auth/v1/admin/users" && method === "GET") return send(200, { users, aud: "authenticated" });
  if (u.pathname === "/auth/v1/admin/users" && method === "POST") { const b = JSON.parse(init.body); const nu = { id: "u-" + users.length, email: b.email }; users.push(nu); return send(200, nu); }
  const del = u.pathname.match(/^\/auth\/v1\/admin\/users\/(.+)$/); if (del && method === "DELETE") { users = users.filter((x) => x.id !== del[1]); return send(200, {}); }
  const t = u.pathname.replace("/rest/v1/", ""), rows = tables[t] || (tables[t] = []), match = filters(u);
  const one = /vnd\.pgrst\.object/.test(headers.get("accept") || "");
  if (method === "GET") { const l = rows.filter(match); return one ? (l.length ? send(200, l[0]) : send(406, { message: "none" })) : send(200, l); }
  if (method === "PATCH") { const b = JSON.parse(init.body); const hit = rows.filter(match); hit.forEach((r) => Object.assign(r, b)); return /return=representation/.test(headers.get("prefer") || "") ? send(200, hit) : send(204); }
  if (method === "POST") { const keys = (u.searchParams.get("on_conflict") || "").split(",").filter(Boolean);
    for (const r of [].concat(JSON.parse(init.body))) { const i = rows.findIndex((x) => keys.length && keys.every((k) => x[k] === r[k])); if (i >= 0) rows[i] = { ...rows[i], ...r }; else rows.push(r); } return send(201); }
  return send(400, {});
}
before(async () => {
  process.env.SUPABASE_URL = "https://db.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "service";
  realFetch = globalThis.fetch; globalThis.fetch = fakeFetch;
  handler = (await import("../netlify/functions/invite.mjs")).default;
});
after(() => { globalThis.fetch = realFetch; });
const get = async (token) => { const r = await handler(new Request("https://x/.netlify/functions/invite?token=" + token)); return { status: r.status, body: await r.json() }; };
const post = async (body) => { const r = await handler(new Request("https://x/.netlify/functions/invite", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })); return { status: r.status, body: await r.json() }; };

test("the link shows who it's for; it makes their login, claims their Coaster, adds them to the site, and works once", async () => {
  reset();
  let r = await get(T1);
  assert.deepEqual(r.body, { name: "Rita Ramos", photo: "https://p/rita.jpg", handle: "rita-ramos", site: "Cockfight", state: "ok" });
  r = await post({ token: T1, username: "Taken", password: "longenough" });
  assert.equal(r.status, 400); assert.match(r.body.error, /taken/);
  r = await post({ token: T1, username: "rita", password: "short" });
  assert.match(r.body.error, /8 characters/);
  r = await post({ token: T1, username: "Rita", password: "longenough" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.email, "rita@comictable.com", "a username becomes a login with no email needed");
  const uid = users.find((u) => u.email === "rita@comictable.com").id;
  assert.equal(tables.comics[0].user_id, uid, "their Coaster is theirs now");
  assert.deepEqual(tables.admins, [{ user_id: uid, site_id: "cockfight", role: "editor" }]);
  assert.ok(tables.invites[0].used_at);
  assert.equal((await get(T1)).body.state, "used");
  assert.match((await post({ token: T1, username: "rita2", password: "longenough" })).body.error, /already used/);
});

test("an expired link says so; a bad one says so; a Coaster someone else claimed can't be taken", async () => {
  reset();
  assert.equal((await get(T2)).body.state, "expired");
  assert.match((await post({ token: T2, username: "rita", password: "longenough" })).body.error, /expired/);
  assert.equal((await get("nope")).status, 400);
  tables.comics[0].user_id = "someone";
  assert.equal((await get(T3)).body.state, "used");
});

test("comictable.com/invite/<token> is the page; it's set up in the build", () => {
  const build = readFileSync(new URL("../tools/build.mjs", import.meta.url), "utf8");
  assert.match(build, /\/invite\/\*  \/invite\.html  200/);
  const page = readFileSync(new URL("../platform/home/invite.html", import.meta.url), "utf8");
  assert.match(page, /noindex/);
  assert.match(page, /Open my Coaster/);
});
