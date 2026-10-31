// The team function (netlify/functions/team.mjs): a comic's own Coaster team (manager, agent, assistant).
// Runs the real function and Supabase client against a small in-memory stand-in for the database and logins.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

const RITA = "77777777-0000-0000-0000-000000000001", MGR = "77777777-0000-0000-0000-000000000002",
  ASSIST = "77777777-0000-0000-0000-000000000003", STRANGER = "77777777-0000-0000-0000-000000000004", STAFF = "77777777-0000-0000-0000-000000000005";
let tables, users, realFetch, handler;

function reset() {
  users = [RITA, MGR, ASSIST, STRANGER, STAFF].map((id, i) => ({ id, email: ["rita", "mgr", "assist", "stranger", "staff"][i] + "@x.com", last_sign_in_at: "2026-10-01" }));
  tables = {
    comics: [{ id: "rita", name: "Rita", user_id: RITA }],
    comic_team: [{ comic_id: "rita", user_id: MGR, role: "owner" }, { comic_id: "rita", user_id: ASSIST, role: "shows" }],
    platform_admins: [{ user_id: STAFF, role: "staff" }],
    admins: [], hosts: [],
  };
}
const send = (status, body) => new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
function filters(u) {
  const f = [];
  for (const [k, v] of u.searchParams) if (/^(eq|neq|in)\./.test(v)) f.push([k, v.split(".")[0], v.slice(v.indexOf(".") + 1)]);
  return (r) => f.every(([k, op, v]) => op === "eq" ? String(r[k]) === v : op === "neq" ? String(r[k]) !== v : v.replace(/^\(|\)$/g, "").split(",").includes(String(r[k])));
}
async function fakeFetch(input, init = {}) {
  const u = new URL(typeof input === "string" ? input : input.url), method = (init.method || "GET").toUpperCase();
  const headers = new Headers(init.headers || {});
  if (u.pathname === "/auth/v1/user") { const t = (headers.get("authorization") || "").replace("Bearer ", ""); const user = users.find((x) => x.id === t); return user ? send(200, user) : send(401, { msg: "bad" }); }
  if (u.pathname === "/auth/v1/admin/users" && method === "GET") return send(200, { users, aud: "authenticated" });
  if (u.pathname === "/auth/v1/admin/users" && method === "POST") { const b = JSON.parse(init.body); const nu = { id: "77777777-0000-0000-0000-00000000000" + (users.length + 1), email: b.email, last_sign_in_at: null }; users.push(nu); return send(200, nu); }
  const one = u.pathname.match(/^\/auth\/v1\/admin\/users\/(.+)$/); if (one) return send(200, users.find((x) => x.id === one[1]));
  const t = u.pathname.replace("/rest/v1/", ""), rows = tables[t] || (tables[t] = []), match = filters(u);
  const out = (list) => /vnd\.pgrst\.object/.test(headers.get("accept") || "") ? (list.length ? send(200, list[0]) : send(406, { message: "none" })) : send(200, list);
  if (method === "GET" || method === "HEAD") return out(rows.filter(match));
  if (method === "POST") {
    const keys = (u.searchParams.get("on_conflict") || "").split(",").filter(Boolean);
    for (const r of [].concat(JSON.parse(init.body))) { const i = rows.findIndex((x) => keys.length && keys.every((k) => x[k] === r[k])); if (i >= 0) rows[i] = { ...rows[i], ...r }; else rows.push(r); }
    return send(201);
  }
  if (method === "PATCH") { const b = JSON.parse(init.body); rows.filter(match).forEach((r) => Object.assign(r, b)); return send(204); }
  if (method === "DELETE") { tables[t] = rows.filter((r) => !match(r)); return send(204); }
  return send(400, {});
}
before(async () => {
  process.env.SUPABASE_URL = "https://db.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "service";
  realFetch = globalThis.fetch; globalThis.fetch = fakeFetch;
  handler = (await import("../netlify/functions/team.mjs")).default;
});
after(() => { globalThis.fetch = realFetch; });
async function call(as, body) {
  const r = await handler(new Request("https://x/.netlify/functions/team", { method: "POST", headers: { authorization: "Bearer " + as, "content-type": "application/json" }, body: JSON.stringify(body) }));
  return { status: r.status, body: await r.json() };
}

test("a comic sees their team, and can add people with the same role (two owners is fine)", async () => {
  reset();
  let r = await call(RITA, { action: "coaster_team", comic_id: "rita" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body.team.map((m) => [m.email, m.role]), [["mgr@x.com", "owner"], ["assist@x.com", "shows"]]);
  assert.equal(r.body.can_change, true);
  r = await call(RITA, { action: "coaster_team_add", comic_id: "rita", email: "stranger@x.com", role: "owner" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(tables.comic_team.filter((m) => m.role === "owner").length, 2);
  r = await call(RITA, { action: "coaster_team_add", comic_id: "rita", email: "new@x.com", role: "editor" });
  assert.equal(r.status, 400, "a brand-new login needs a starting password");
  r = await call(RITA, { action: "coaster_team_add", comic_id: "rita", email: "new@x.com", password: "longenough", role: "editor" });
  assert.equal(r.status, 200);
  assert.ok(tables.comic_team.some((m) => m.role === "editor" && users.find((u) => u.id === m.user_id).email === "new@x.com"));
});

test("a team owner can change the team; Shows-only can look but not change; strangers can't see it", async () => {
  reset();
  let r = await call(MGR, { action: "coaster_team_role", comic_id: "rita", user_id: ASSIST, role: "editor" });
  assert.equal(r.status, 200); assert.equal(tables.comic_team.find((m) => m.user_id === ASSIST).role, "editor");
  r = await call(ASSIST, { action: "coaster_team", comic_id: "rita" });
  assert.equal(r.status, 200); assert.equal(r.body.can_change, false);
  r = await call(ASSIST, { action: "coaster_team_remove", comic_id: "rita", user_id: MGR });
  assert.equal(r.status, 403);
  r = await call(STRANGER, { action: "coaster_team", comic_id: "rita" });
  assert.equal(r.status, 403);
  r = await call(MGR, { action: "coaster_team_remove", comic_id: "rita", user_id: ASSIST });
  assert.equal(r.status, 200); assert.ok(!tables.comic_team.some((m) => m.user_id === ASSIST));
});

test("the comic's own login can't be added to their team, and ComicTable staff can manage any team", async () => {
  reset();
  let r = await call(MGR, { action: "coaster_team_add", comic_id: "rita", email: "rita@x.com" });
  assert.equal(r.status, 400); assert.match(r.body.error, /own login/);
  r = await call(STAFF, { action: "coaster_team_add", comic_id: "rita", email: "stranger@x.com", role: "nonsense" });
  assert.equal(r.status, 200); assert.equal(tables.comic_team.find((m) => m.user_id === STRANGER).role, "editor", "unknown roles become Editor");
  r = await call(STAFF, { action: "coaster_team", comic_id: "nobody" });
  assert.equal(r.status, 400);
});
