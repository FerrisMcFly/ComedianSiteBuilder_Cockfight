// The server functions' idea of who someone is on a site (netlify/lib/access.mjs) matches the database rules.
import { test } from "node:test";
import assert from "node:assert/strict";
import { accessFor } from "../netlify/lib/access.mjs";

const fakeDb = (admins, plats) => ({ from: (t) => {
  const rows = t === "admins" ? admins : plats, f = {};
  const b = { select: () => b, eq: (k, v) => { f[k] = v; return b; },
    maybeSingle: async () => ({ data: rows.find((r) => Object.entries(f).every(([k, v]) => r[k] === v)) || null }) };
  return b;
} });

test("site roles and ComicTable roles decide what the server functions allow", async () => {
  const db = fakeDb([{ user_id: "own", site_id: "s", role: "owner" }, { user_id: "ed", site_id: "s", role: "editor" },
    { user_id: "book", site_id: "s", role: "shows" }, { user_id: "mod", site_id: "s", role: "moderator" }, { user_id: "old", site_id: "s" }],
    [{ user_id: "boss", role: "admin" }, { user_id: "staff", role: "staff" }, { user_id: "legacy" }]);
  const a = async (u) => accessFor(db, u, "s");
  assert.equal((await a("own")).role, "owner");
  assert.equal((await a("old")).role, "owner", "a team row from before roles counts as owner");
  assert.equal((await a("boss")).role, "owner", "ComicTable admins act as owners");
  assert.equal((await a("legacy")).role, "owner", "a super admin from before roles is an admin");
  assert.equal((await a("staff")).role, "editor", "staff can work on the site but not change its team");
  assert.ok((await a("ed")).full);
  const book = await a("book");
  assert.equal(book.full, false); assert.ok(book.can("shows")); assert.ok(!book.can("community"));
  const mod = await a("mod");
  assert.ok(mod.can("community")); assert.ok(!mod.can("shows"));
  assert.equal((await a("nobody")).role, null);
});
