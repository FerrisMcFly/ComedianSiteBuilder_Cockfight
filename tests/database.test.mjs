// Runs every file in supabase/ against a real (in-memory) Postgres and checks the security rules.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const file = (f) => readFileSync(new URL("../supabase/" + f, import.meta.url), "utf8");
const OWNER = "11111111-1111-1111-1111-111111111111", COMIC = "22222222-2222-2222-2222-222222222222";
let db;
const q = async (s) => (await db.query(s)).rows;
async function as(uid, sql) {
  try { await db.exec(`${uid ? `set test.uid = '${uid}'; set role authenticated;` : "reset test.uid; set role anon;"} ${sql}; reset role;`); return "ok"; }
  catch (e) { await db.exec("reset role"); return e.message.split("\n")[0]; }
}

async function rows(uid, sql) {
  await db.exec(uid ? `set test.uid = '${uid}'; set role authenticated;` : "reset test.uid; set role anon;");
  try { return (await db.query(sql)).rows; } finally { await db.exec("reset role"); }
}

test("all database files run, and the upgrades can run twice", async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users (id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    create schema storage; create table storage.buckets (id text primary key, name text, public boolean);
    create table storage.objects (id serial primary key, bucket_id text, name text); alter table storage.objects enable row level security;
    grant usage on schema auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;`);
  for (const f of ["01_setup.sql", "02_seed.sql", "03_permissions.sql"]) await db.exec(file(f));
  await db.exec(`insert into auth.users values ('${OWNER}', 'owner@x'), ('${COMIC}', 'comic@x'); insert into admins (user_id) values ('${OWNER}');`);
  for (const f of ["04_platform.sql", "05_venues.sql", "06_community.sql", "07_more_sources.sql", "08_create_sites.sql", "09_places.sql", "10_fans.sql", "04_platform.sql", "06_community.sql", "07_more_sources.sql", "08_create_sites.sql", "09_places.sql", "10_fans.sql"]) await db.exec(file(f));
  await db.exec(`insert into sites (id, name) values ('othercomic', 'Other'); insert into admins (user_id, site_id) values ('${COMIC}', 'othercomic');`);
  assert.equal((await q("select count(*)::int n from venues"))[0].n, 109);
  assert.equal((await q("select count(*)::int n from episodes where site_id = 'cockfight'"))[0].n, 47);
  assert.equal((await q("select count(*)::int n from shows where venue_id is null"))[0].n, 0);
  assert.equal((await q("select count(*)::int n from announcements where pinned"))[0].n, 1);
  assert.equal((await q("select count(*)::int n from boards"))[0].n, 4);
});

test("sites stay separate", async () => {
  assert.equal(await as(COMIC, `insert into venues (name, city, verified, created_by_site) values ('Big Room', 'Austin', false, 'othercomic')`), "ok");
  assert.match(await as(COMIC, `insert into venues (name, city, verified, created_by_site) values ('Fake', 'Austin', true, 'othercomic')`), /row-level security/);
  await as(COMIC, `update shows set city = 'Hacked' where site_id = 'cockfight'`);
  await as(COMIC, `update venues set name = 'Hacked' where name = 'Laugh Boston'`);
  assert.equal((await q("select count(*)::int n from shows where city = 'Hacked'"))[0].n, 0);
  assert.equal((await q("select count(*)::int n from venues where name = 'Hacked'"))[0].n, 0);
  assert.match(await as(COMIC, `insert into announcements (site_id, text) values ('cockfight', 'hijack')`), /row-level security/);
});

test("forum and chat rules", async () => {
  const now = Date.now();
  const topic = (board, author, dev) => `insert into threads (site_id, board, title, author, created_at, last_at, device) values ('cockfight', '${board}', 'Hi', '${author}', ${now}, ${now}, '${dev}')`;
  assert.equal(await as(null, topic("general", "TacoKing", "d1")), "ok");
  const tid = (await q("select id from threads"))[0].id;
  const post = (author, body, dev) => `insert into posts (site_id, thread_id, author, body, created_at, device) values ('cockfight', '${tid}', '${author}', '${body}', ${Date.now()}, '${dev}')`;
  assert.equal(await as(null, post("TacoKing", "first", "d1")), "ok");
  assert.match(await as(null, post("TacoKing", "again", "d1")), /Slow down/);
  assert.match(await as(null, post("Lev", "fake", "d2")), /reserved/);
  await db.exec(`update sites set community = community || '{"banned_words": ["badword"]}' where id = 'cockfight'`);
  assert.match(await as(null, post("Rando", "a BADWORD here", "d3")), /doesn't allow/);
  await db.exec(`insert into bans (site_id, author, device) values ('cockfight', 'Troll', 'd4')`);
  assert.match(await as(null, post("troll", "hi", "d5")), /banned/);
  assert.match(await as(null, post("NewName", "hi", "d4")), /banned/);
  await db.exec(`update threads set locked = true`);
  assert.match(await as(null, post("Someone", "hi", "d6")), /locked/);
  assert.equal(await as(OWNER, post("Lev", "host reply", "x")), "ok");
  await db.exec(`update boards set locked = true where id = 'episodes'`);
  assert.match(await as(null, topic("episodes", "Fan", "d7")), /locked/);
  assert.match(await as(null, `insert into threads (site_id, board, title, author, created_at, last_at, pinned) values ('cockfight', 'general', 'x', 'Fan8', 1, 1, true)`), /row-level security/);
  const chat = (author, dev, extra = "") => `insert into chat_messages (site_id, author, body, device${extra ? ", is_mod" : ""}) values ('cockfight', '${author}', 'yo', '${dev}'${extra})`;
  assert.equal(await as(null, chat("Fan9", "d9")), "ok");
  assert.match(await as(null, chat("Fan9", "d9")), /Slow down/);
  assert.equal(await as(null, chat("Fan10", "d10", ", true")), "ok");
  assert.equal((await q("select is_mod from chat_messages where author = 'Fan10'"))[0].is_mod, false);
  await db.exec(`update sites set community = community || '{"chat_open": false}' where id = 'cockfight'`);
  assert.match(await as(null, chat("Fan11", "d11")), /closed/);
  assert.match(await as(null, "select * from bans"), /permission denied/);
});

test("the all-in-one upgrade file runs on the live setup", async () => {
  const fresh = new PGlite();
  await fresh.exec(`create role anon; create role authenticated; create schema auth; create table auth.users (id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
    create schema storage; create table storage.buckets (id text primary key, name text, public boolean);
    create table storage.objects (id serial primary key, bucket_id text, name text); alter table storage.objects enable row level security;`);
  await fresh.exec(file("01_setup.sql")); await fresh.exec(file("02_seed.sql"));
  await fresh.exec(`insert into auth.users values ('${OWNER}', 'owner@x'); insert into admins (user_id) values ('${OWNER}');`);
  await fresh.exec(file("UPGRADE_V1_ALL.sql"));
  await fresh.exec(file("UPGRADE_V1_ALL.sql"));
  assert.equal((await fresh.query("select count(*)::int n from venues")).rows[0].n, 109);
  assert.equal((await fresh.query("select count(*)::int n from boards")).rows[0].n, 4);
});

test("only platform admins can create sites, and a new site comes ready to use", async () => {
  assert.match(await as(COMIC, `select create_site('sneaky', 'Sneaky')`), /Only ComicTable platform admins/);
  assert.equal(await as(OWNER, `select create_site('john-smith', 'John Smith', 'johnsmithcomedy.com')`), "ok");
  assert.match(await as(OWNER, `select create_site('john-smith', 'Again')`), /already a site/);
  assert.match(await as(OWNER, `select create_site('Bad Id!', 'Bad')`), /lowercase letters/);
  const site = (await q("select * from sites where id = 'john-smith'"))[0];
  assert.equal(site.domain, "johnsmithcomedy.com"); assert.equal(site.features.forum, false);
  assert.equal((await q(`select role from admins where site_id = 'john-smith' and user_id = '${OWNER}'`))[0].role, "owner");
  assert.equal((await q("select count(*)::int n from boards where site_id = 'john-smith'"))[0].n, 3);
  // the new site's owner can now add shows there, and Cockfight's data is untouched
  assert.equal(await as(OWNER, `insert into hosts (id, site_id, name) values ('john-smith-john', 'john-smith', 'John Smith')`), "ok");
  assert.equal((await q("select count(*)::int n from hosts where site_id = 'cockfight'"))[0].n, 3);
});

test("anyone can ask for a site from comictable.com, only platform admins can read the requests", async () => {
  assert.equal(await as(null, `insert into site_requests (name, email, act) values ('Jane Doe', 'jane@x.com', 'Stand-up and a podcast')`), "ok");
  assert.match(await as(null, `insert into site_requests (name, email) values ('Spam', 'not-an-email')`), /check|violat/i);
  await assert.rejects(rows(null, `select * from site_requests`), /permission denied/);
  assert.equal((await rows(COMIC, `select count(*)::int n from site_requests`))[0].n, 0);
  assert.equal((await rows(OWNER, `select count(*)::int n from site_requests`))[0].n, 1);
});

test("fans join a site's list with their city, and the comic sees who's near each show", async () => {
  const boston = (await rows(null, "select id from places where name = 'Boston' and state = 'MA'"))[0].id;
  const nyc = (await rows(null, "select id from places where name = 'New York' and state = 'NY'"))[0].id;
  // clubs get a position from their city
  const club = (await q("select id, lat from venues where name = 'Laugh Boston'"))[0];
  assert.ok(club && club.lat > 42 && club.lat < 43, "Laugh Boston has a map position");
  // sign-ups are off until the site turns the fan list on
  assert.match(await as(null, `select join_fans('cockfight', 'a@x.com', ${boston})`), /isn't taking sign-ups/);
  await q(`update sites set features = features || '{"fans": true}' where id = 'cockfight'`);
  assert.equal((await rows(null, `select join_fans('cockfight', 'A@x.com', ${boston}) r`))[0].r, "joined");
  assert.equal((await rows(null, `select join_fans('cockfight', 'a@x.com', ${boston}, 100) r`))[0].r, "updated");
  assert.equal((await rows(null, `select join_fans('cockfight', 'ny@x.com', ${nyc}, 25) r`))[0].r, "joined");
  assert.match(await as(null, `select join_fans('cockfight', 'nope', ${boston})`), /doesn't look right/);
  assert.match(await as(null, `select join_fans('cockfight', 'b@x.com', -1)`), /Pick your city/);
  // nobody but the site's admins can read the list
  await assert.rejects(rows(null, "select * from fans"), /permission denied/);
  assert.equal((await rows(COMIC, "select count(*)::int n from fans"))[0].n, 0);
  assert.equal((await rows(OWNER, "select count(*)::int n from fans"))[0].n, 2);
  // a show at Laugh Boston reaches the Boston fan but not the one in New York who said 25 miles
  const host = (await q("select id from hosts where site_id = 'cockfight' limit 1"))[0].id;
  const show = (await q(`insert into shows (site_id, host, date, venue, venue_id) values ('cockfight', '${host}', current_date + 7, 'Laugh Boston', '${club.id}') returning id`))[0].id;
  const near = await rows(OWNER, "select * from fans_near_shows('cockfight')");
  assert.equal(near.find((r) => r.show_id === show).fans, 1);
  assert.deepEqual((await rows(OWNER, `select email from fans_near_show('${show}')`)).map((r) => r.email), ["a@x.com"]);
  assert.equal((await rows(COMIC, `select count(*)::int n from fans_near_show('${show}')`))[0].n, 0);
  // one-click leave
  const tok = (await q("select token from fans where email = 'ny@x.com'"))[0].token;
  assert.equal((await rows(null, `select leave_fans('${tok}') r`))[0].r, true);
  assert.equal((await q("select count(*)::int n from fans"))[0].n, 1);
});
