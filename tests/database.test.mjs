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
    create schema storage; create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (id serial primary key, bucket_id text, name text); alter table storage.objects enable row level security;
    create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
    grant usage on schema storage to anon, authenticated; grant select, insert, update, delete on storage.objects to authenticated; grant usage, select on sequence storage.objects_id_seq to authenticated; grant execute on function storage.foldername(text) to authenticated;
    grant usage on schema auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;`);
  for (const f of ["01_setup.sql", "02_seed.sql", "03_permissions.sql"]) await db.exec(file(f));
  await db.exec(`insert into auth.users values ('${OWNER}', 'owner@x'), ('${COMIC}', 'comic@x'); insert into admins (user_id) values ('${OWNER}');`);
  for (const f of ["04_platform.sql", "05_venues.sql", "06_community.sql", "07_more_sources.sql", "08_create_sites.sql", "09_places.sql", "10_fans.sql", "11_comics.sql", "12_show_finder.sql", "13_me.sql", "14_blog.sql", "15_home_picks.sql", "16_photo_uploads.sql", "17_press_kit.sql", "18_fan_signup.sql", "19_more_socials.sql", "20_showcase.sql", "21_coasters.sql", "22_news.sql", "99_rules.sql", "04_platform.sql", "06_community.sql", "07_more_sources.sql", "08_create_sites.sql", "09_places.sql", "10_fans.sql", "11_comics.sql", "12_show_finder.sql", "13_me.sql", "14_blog.sql", "15_home_picks.sql", "16_photo_uploads.sql", "17_press_kit.sql", "18_fan_signup.sql", "19_more_socials.sql", "20_showcase.sql", "21_coasters.sql", "22_news.sql", "99_rules.sql"]) await db.exec(file(f));
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
    create schema storage; create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (id serial primary key, bucket_id text, name text); alter table storage.objects enable row level security;
    create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;`);
  await fresh.exec(file("01_setup.sql")); await fresh.exec(file("02_seed.sql"));
  await fresh.exec(`insert into auth.users values ('${OWNER}', 'owner@x'); insert into admins (user_id) values ('${OWNER}');`);
  await fresh.exec(file("UPGRADE_V1_ALL.sql"));
  await fresh.exec(file("UPGRADE_V1_ALL.sql"));
  assert.equal((await fresh.query("select count(*)::int n from venues")).rows[0].n, 109);
  assert.equal((await fresh.query("select count(*)::int n from boards")).rows[0].n, 4);
});

test("only platform admins can create sites, and a new site comes ready to use", async () => {
  assert.match(await as(COMIC, `select create_site('sneaky', 'Sneaky')`), /Only ComicTable (platform )?admins/);
  assert.equal(await as(OWNER, `select create_site('john-smith', 'John Smith', 'johnsmithcomedy.com')`), "ok");
  assert.match(await as(OWNER, `select create_site('john-smith', 'Again')`), /already a site/);
  assert.match(await as(OWNER, `select create_site('Bad Id!', 'Bad')`), /lowercase letters/);
  const site = (await q("select * from sites where id = 'john-smith'"))[0];
  assert.equal(site.domain, "johnsmithcomedy.com"); assert.equal(site.features.forum, false);
  assert.equal((await q(`select count(*)::int n from admins where site_id = 'john-smith'`))[0].n, 0, "the super admin isn't put on the comic's team");
  assert.equal((await q("select count(*)::int n from boards where site_id = 'john-smith'"))[0].n, 3);
  // the new site's owner can now add shows there, and Cockfight's data is untouched
  assert.equal(await as(OWNER, `insert into hosts (id, site_id, name) values ('john-smith-john', 'john-smith', 'John Smith')`), "ok");
  assert.equal((await q("select count(*)::int n from hosts where site_id = 'cockfight'"))[0].n, 3);
});

test("anyone can ask for a site from comictable.com, only platform admins can read the requests", async () => {
  assert.equal(await as(null, `insert into site_requests (name, email, act) values ('Rita Ramos', 'rita@x.com', 'Stand-up and a podcast')`), "ok");
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
  assert.deepEqual((await rows(OWNER, `select email from fans_near_show('${show}', 'cockfight')`)).map((r) => r.email), ["a@x.com"]);
  assert.equal((await rows(COMIC, `select count(*)::int n from fans_near_show('${show}', 'cockfight')`))[0].n, 0);
  // one-click leave
  const tok = (await q("select token from fans where email = 'ny@x.com'"))[0].token;
  assert.equal((await rows(null, `select leave_fans('${tok}') r`))[0].r, true);
  assert.equal((await q("select count(*)::int n from fans"))[0].n, 1);
});

test("QR sign-up: fans can say where they met, it's kept on re-signup, and the list knows it came from a QR code", async () => {
  const boston = (await rows(null, "select id from places where name = 'Boston' and state = 'MA'"))[0].id;
  assert.equal((await rows(null, `select join_fans('cockfight', 'qr@x.com', ${boston}, 50, 'Laugh Boston · Nov 19', 'qr') r`))[0].r, "joined");
  assert.equal((await rows(null, `select join_fans('cockfight', 'qr@x.com', ${boston}, 100) r`))[0].r, "updated");
  const f = (await q("select met_at, source, radius_mi from fans where email = 'qr@x.com'"))[0];
  assert.deepEqual([f.met_at, f.source, f.radius_mi], ["Laugh Boston · Nov 19", "qr", 100]);
  assert.equal((await rows(null, `select join_fans('cockfight', 'odd@x.com', ${boston}, 50, null, 'hacker') r`))[0].r, "joined");
  assert.equal((await q("select source from fans where email = 'odd@x.com'"))[0].source, "site");
  assert.equal((await rows(null, `select join_fans('cockfight', 'long@x.com', ${boston}, 50, repeat('x', 500)) r`))[0].r, "joined");
  assert.equal((await q("select length(met_at) n from fans where email = 'long@x.com'"))[0].n, 200);
});

test("super admins manage every site; a comic's team only sees their own", async () => {
  await q(`insert into sites (id, name) values ('rita', 'Rita') on conflict do nothing`);
  await q(`insert into hosts (id, site_id, name) values ('rita-rita', 'rita', 'Rita') on conflict do nothing`);
  await q(`insert into admins (user_id, site_id, role) values ('${COMIC}', 'rita', 'owner') on conflict do nothing`);
  // OWNER is a super admin and isn't on Rita's team, but can still edit her site
  assert.equal(await as(OWNER, `update hosts set bio = 'hi' where id = 'rita-rita'`), "ok");
  assert.equal((await q("select bio from hosts where id = 'rita-rita'"))[0].bio, "hi");
  // Rita's team can't touch Cockfight
  assert.equal(await as(COMIC, `update hosts set bio = 'hacked' where site_id = 'cockfight'`), "ok");
  assert.equal((await q("select count(*)::int n from hosts where bio = 'hacked'"))[0].n, 0);
  // the super admin list is for super admins only
  assert.equal((await rows(OWNER, "select * from platform_admin_list()")).length, 1);
  assert.equal((await rows(COMIC, "select * from platform_admin_list()")).length, 0);
  assert.match(await as(COMIC, `select remove_platform_admin('${OWNER}')`), /Only (super|ComicTable) admins/);
  assert.match(await as(OWNER, `select remove_platform_admin('${OWNER}')`), /can't remove yourself/);
});

test("comics: one profile and one set of dates, on every site they're part of", async () => {
  // Cockfight's people became comics
  const tristan = (await q("select comic_id from hosts where site_id = 'cockfight' and name ilike 'tristan%'"))[0].comic_id;
  assert.equal(tristan, "tristan-bowling");
  // a second show with Tristan and a new co-host; COMIC runs it
  await q(`insert into sites (id, name) values ('apes', 'Modern Apes') on conflict do nothing`);
  await q(`insert into admins (user_id, site_id, role) values ('${COMIC}', 'apes', 'owner') on conflict do nothing`);
  assert.equal(await as(COMIC, `insert into comics (id, name, bio) values ('daniel-bridge-gadd', 'Daniel Bridge-Gadd', 'Daniel''s bio')`), "ok");
  assert.equal(await as(COMIC, `insert into hosts (id, site_id, comic_id, sort) values ('apes-tristan', 'apes', '${tristan}', 0), ('apes-daniel', 'apes', 'daniel-bridge-gadd', 1)`), "ok");
  const apesT = (await q("select * from hosts where id = 'apes-tristan'"))[0];
  assert.equal(apesT.name, "Tristan Bowling", "joining a site copies the comic's profile");

  // Modern Apes adds a Tristan date once: it shows on both sites
  const venue = (await q("select id from venues where name = 'Laugh Boston'"))[0].id;
  assert.equal(await as(COMIC, `insert into shows (site_id, host, date, time, venue, venue_id) values ('apes', 'apes-tristan', current_date + 3, '8:00 PM', 'Laugh Boston', '${venue}')`), "ok");
  const id = (await q("select id from shows where host = 'apes-tristan'"))[0].id;
  const onCF = (await rows(null, "select r from site_shows('cockfight') r")).map((x) => x.r).find((r) => r.id === id);
  assert.ok(onCF, "Tristan's Modern Apes date is on Cockfight too");
  assert.equal(onCF.host, (await q("select id from hosts where site_id = 'cockfight' and comic_id = 'tristan-bowling'"))[0].id, "and it points at his Cockfight page");
  assert.ok((await rows(null, "select r from site_shows('apes') r")).some((x) => x.r.id === id));

  // Cockfight's team (OWNER, a super admin here) can edit it, and so can COMIC who isn't on Cockfight
  assert.equal(await as(COMIC, `update shows set status = 'few_left' where id = '${id}'`), "ok");
  assert.equal((await q(`select status from shows where id = '${id}'`))[0].status, "few_left");

  // Daniel's dates don't leak onto Cockfight
  await q(`insert into shows (site_id, host, date, venue) values ('apes', 'apes-daniel', current_date + 4, 'Somewhere')`);
  assert.ok(!(await rows(null, "select r from site_shows('cockfight') r")).some((x) => x.r.venue === "Somewhere"));
  // and COMIC can't touch Cockfight-only comics' dates
  const lev = (await q("select id from hosts where site_id = 'cockfight' and name ilike 'lev%'"))[0].id;
  await q(`insert into shows (site_id, host, date, venue) values ('cockfight', '${lev}', current_date + 5, 'Lev Room')`);
  assert.equal(await as(COMIC, `update shows set venue = 'hacked' where venue = 'Lev Room'`), "ok");
  assert.equal((await q("select count(*)::int n from shows where venue = 'hacked'"))[0].n, 0);

  // a show event belongs to the site, with a lineup
  await q(`insert into shows (site_id, date, venue, lineup) values ('apes', current_date + 6, 'Apes LIVE', array['tristan-bowling', 'daniel-bridge-gadd'])`);
  const ev = (await rows(null, "select r from site_shows('apes') r")).map((x) => x.r).find((r) => r.venue === "Apes LIVE");
  assert.equal(ev.event, true); assert.deepEqual(ev.lineup_hosts, ["apes-tristan", "apes-daniel"]);
  assert.ok(!(await rows(null, "select r from site_shows('cockfight') r")).some((x) => x.r.venue === "Apes LIVE"), "events stay on their own site");

  // shared bio by default, a site can write its own
  assert.equal(await as(COMIC, `update comics set bio = 'New shared bio' where id = 'tristan-bowling'`), "ok");
  assert.equal((await q("select bio from hosts where comic_id = 'tristan-bowling' and site_id = 'cockfight'"))[0].bio, "New shared bio");
  await q(`update hosts set bio = 'Cockfight chef bio', own_bio = true where comic_id = 'tristan-bowling' and site_id = 'cockfight'`);
  await q(`update comics set bio = 'Newer shared bio', photo_url = 'https://p/t.jpg' where id = 'tristan-bowling'`);
  const [cf, ap] = [(await q("select * from hosts where comic_id = 'tristan-bowling' and site_id = 'cockfight'"))[0], (await q("select * from hosts where id = 'apes-tristan'"))[0]];
  assert.equal(cf.bio, "Cockfight chef bio"); assert.equal(ap.bio, "Newer shared bio");
  assert.equal(cf.photo_url, "https://p/t.jpg"); assert.equal(ap.photo_url, "https://p/t.jpg");
  await q(`update hosts set own_bio = false where comic_id = 'tristan-bowling' and site_id = 'cockfight'`);
  assert.equal((await q("select bio from hosts where comic_id = 'tristan-bowling' and site_id = 'cockfight'"))[0].bio, "Newer shared bio");

  // hiding a date on one site only
  assert.equal(await as(OWNER, `insert into site_hidden (site_id, kind, item_id) values ('cockfight', 'show', '${id}')`), "ok");
  assert.ok(!(await rows(null, "select r from site_shows('cockfight') r")).some((x) => x.r.id === id));
  assert.ok((await rows(null, "select r from site_shows('apes') r")).some((x) => x.r.id === id));

  // moving a date to someone else moves it to their comic
  const moved = (await q(`insert into shows (site_id, host, date, venue) values ('apes', 'apes-tristan', current_date + 9, 'Move Me') returning id`))[0].id;
  await q(`update shows set host = 'apes-daniel' where id = '${moved}'`);
  assert.equal((await q(`select comic_id from shows where id = '${moved}'`))[0].comic_id, "daniel-bridge-gadd");
  // taking Tristan off Modern Apes keeps his dates
  await q("delete from hosts where id = 'apes-tristan'");
  assert.equal((await q(`select comic_id from shows where id = '${id}'`))[0].comic_id, "tristan-bowling");
  assert.ok(!(await rows(null, "select r from site_shows('apes') r")).some((x) => x.r.id === id));
});

test("the one-file upgrade runs on a v1 database, twice", async () => {
  const fresh = new PGlite();
  await fresh.exec(`create role anon; create role authenticated; create schema auth; create table auth.users (id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    create schema storage; create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (id serial primary key, bucket_id text, name text); alter table storage.objects enable row level security;
    create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;`);
  for (const f of ["01_setup.sql", "02_seed.sql", "03_permissions.sql", "UPGRADE_V1_ALL.sql", "UPGRADE_V2_ALL.sql", "UPGRADE_V2_ALL.sql"]) await fresh.exec(file(f));
  // the newest bundle, then an older one again by mistake: the current rules must survive
  await fresh.exec(file("UPGRADE_V3_ALL.sql")); await fresh.exec(file("UPGRADE_V2_ALL.sql"));
  const fn = (await fresh.query("select pg_get_functiondef('public.is_site_admin(text)'::regprocedure) d")).rows[0].d;
  assert.match(fn, /role in \('owner', 'editor'\)/, "re-running the v2 bundle after v3 keeps the roles");
  assert.ok((await fresh.query("select 1 from information_schema.columns where table_name = 'platform_admins' and column_name = 'role'")).rows.length);
  assert.equal((await fresh.query("select count(*)::int n from comics")).rows[0].n, (await fresh.query("select count(*)::int n from hosts")).rows[0].n);
  assert.equal((await fresh.query("select count(*)::int n from hosts where comic_id is null")).rows[0].n, 0);
  await fresh.close();
});

test("show finder: show sources and found shows follow the same rules as shows", async () => {
  assert.equal(await as(OWNER, `insert into sources (site_id, kind, url, comic_id, auto_add) values ('cockfight', 'shows', 'https://club.example/cal', 'tristan-bowling', false)`), "ok");
  assert.match(await as(OWNER, `insert into sources (site_id, kind, url) values ('cockfight', 'tiktok', 'https://x')`), /check/i);
  assert.equal(await as(OWNER, `insert into found_shows (site_id, comic_id, key, date, venue) values ('cockfight', 'tristan-bowling', 'k1', current_date + 2, 'Zanies')`), "ok");
  // COMIC isn't on any site with Tristan any more, so they see nothing
  assert.equal((await rows(COMIC, "select count(*)::int n from found_shows where comic_id = 'tristan-bowling'"))[0].n, 0);
  assert.equal((await rows(OWNER, "select count(*)::int n from found_shows"))[0].n, 1);
  // the same listing is only kept once
  assert.match(await as(OWNER, `insert into found_shows (site_id, comic_id, key, date) values ('cockfight', 'tristan-bowling', 'k1', current_date + 2)`), /duplicate|unique/i);
});

test("a comic's own login can edit their profile and dates on every site they're on, and sees them all in one list", async () => {
  const LEV = "33333333-3333-3333-3333-333333333333";
  await q(`insert into auth.users values ('${LEV}', 'lev@x') on conflict do nothing`);
  await q(`update comics set user_id = '${LEV}' where id = 'lev-fer'`);
  // Lev isn't on anyone's team, but his comic login still covers his own stuff
  assert.equal(await as(LEV, `update comics set bio = 'Lev wrote this' where id = 'lev-fer'`), "ok");
  assert.equal((await q("select bio from hosts where comic_id = 'lev-fer' and site_id = 'cockfight'"))[0].bio, "Lev wrote this");
  assert.equal(await as(LEV, `update comics set bio = 'not mine' where id = 'colum-tyrrell'`), "ok");
  assert.notEqual((await q("select bio from comics where id = 'colum-tyrrell'"))[0].bio, "not mine");
  const levHost = (await q("select id from hosts where comic_id = 'lev-fer' and site_id = 'cockfight'"))[0].id;
  assert.equal(await as(LEV, `insert into shows (site_id, host, date, venue) values ('cockfight', '${levHost}', current_date + 8, 'Lev solo night')`), "ok");
  // ...but not Cockfight's own stuff
  assert.equal(await as(LEV, `update sites set name = 'Levfight' where id = 'cockfight'`), "ok");
  assert.equal((await q("select name from sites where id = 'cockfight'"))[0].name, "Cockfight");
  const mine = (await rows(LEV, "select r from comic_shows('lev-fer') r")).map((x) => x.r);
  assert.ok(mine.some((r) => r.venue === "Lev solo night" && r.site_name === "Cockfight"));
});

test("blog: drafts are private, published posts are public and get a date", async () => {
  assert.equal(await as(OWNER, `insert into blog_posts (site_id, slug, title, body) values ('cockfight', 'hello', 'Hello', 'Draft text')`), "ok");
  assert.equal((await rows(null, "select count(*)::int n from blog_posts"))[0].n, 0, "drafts stay hidden");
  assert.equal(await as(OWNER, `update blog_posts set published = true where slug = 'hello'`), "ok");
  const pub = (await rows(null, "select * from blog_posts"));
  assert.equal(pub.length, 1); assert.ok(pub[0].published_at);
  assert.equal(await as(COMIC, `update blog_posts set title = 'hacked'`), "ok");
  assert.equal((await q("select title from blog_posts"))[0].title, "Hello");
  assert.match(await as(OWNER, `insert into blog_posts (site_id, slug, title) values ('cockfight', 'Bad Slug!', 'x')`), /check/i);
});

test("home picks: public sees live ones, only the site's admins change them", async () => {
  await db.exec(`insert into home_picks (site_id, headline, sort) values ('cockfight', 'Big news', 0);
    insert into home_picks (site_id, headline, hidden, sort) values ('cockfight', 'Secret', true, 1);`);
  const pub = await rows(null, "select headline from home_picks where site_id = 'cockfight' and from_announcement is null order by sort");
  assert.deepEqual(pub.map((r) => r.headline), ["Big news"]);
  assert.match(await as(null, `insert into home_picks (site_id, headline) values ('cockfight', 'hijack')`), /permission denied|row-level security/);
  assert.match(await as(COMIC, `insert into home_picks (site_id, headline) values ('cockfight', 'hijack')`), /row-level security/);
  await as(COMIC, `update home_picks set headline = 'Hacked' where site_id = 'cockfight'`);
  assert.equal((await q("select count(*)::int n from home_picks where headline = 'Hacked'"))[0].n, 0);
  assert.equal(await as(COMIC, `insert into home_picks (site_id, headline, kind) values ('othercomic', 'My special', 'video')`), "ok");
  assert.match(await as(COMIC, `insert into home_picks (site_id, headline, kind) values ('othercomic', 'x', 'nonsense')`), /check constraint/);
});

test("press kit: anyone can see a comic's approved photos and bios; only people who can edit that comic change them", async () => {
  const LEV = "33333333-3333-3333-3333-333333333333";
  assert.equal(await as(LEV, `update comics set short_bio = 'Lev is a comic.', booking_contact = 'book@lev.example' where id = 'lev-fer'`), "ok");
  assert.equal((await q("select short_bio from comics where id = 'lev-fer'"))[0].short_bio, "Lev is a comic.");
  assert.equal(await as(LEV, `insert into press_photos (comic_id, url, credit, orientation, is_primary) values ('lev-fer', 'https://p/lev-1.jpg', 'Photo: A. Person', 'portrait', true)`), "ok");
  assert.match(await as(LEV, `insert into press_photos (comic_id, url, is_primary) values ('lev-fer', 'https://p/lev-2.jpg', true)`), /duplicate|unique/i, "only one primary photo");
  assert.match(await as(LEV, `insert into press_photos (comic_id, url) values ('colum-tyrrell', 'https://p/not-mine.jpg')`), /row-level security/i);
  assert.equal((await rows(null, "select url from press_photos where comic_id = 'lev-fer'")).length, 1, "clubs see it without logging in");
  // files: a comic uploads into their own folder only
  assert.equal(await as(LEV, `insert into storage.objects (bucket_id, name) values ('press', 'lev-fer/headshot.jpg')`), "ok");
  assert.match(await as(LEV, `insert into storage.objects (bucket_id, name) values ('press', 'colum-tyrrell/headshot.jpg')`), /row-level security/i);
  assert.match(await as(LEV, `update comics set short_bio = repeat('x', 601) where id = 'lev-fer'`), /check/i);
});

test("more socials: a comic's Threads, Twitch and the rest follow them to every site", async () => {
  await db.exec(`update comics set socials = '{"threads": "https://www.threads.net/@lev", "twitch": "https://www.twitch.tv/lev"}' where id = 'lev-fer'`);
  const hs = await q("select socials from hosts where comic_id = 'lev-fer'");
  assert.ok(hs.length > 0 && hs.every((h) => h.socials.threads === "https://www.threads.net/@lev" && h.socials.twitch), JSON.stringify(hs));
  await assert.rejects(db.exec(`update comics set socials = '"nope"' where id = 'lev-fer'`), /socials_size/);
});

test("comictable.com showcase: anyone can read it, only super admins change it", async () => {
  const row = (await rows(null, "select featured_site, showcase from platform_settings"))[0];
  assert.equal(row.featured_site, "cockfight");
  assert.equal(row.showcase[0].site, "cockfight");
  await db.exec(`insert into auth.users values ('44444444-4444-4444-4444-444444444444', 'boss@x') on conflict do nothing; insert into platform_admins (user_id) values ('44444444-4444-4444-4444-444444444444') on conflict do nothing`);
  assert.equal(await as("44444444-4444-4444-4444-444444444444", `update platform_settings set featured_site = 'othercomic' where id = 1`), "ok");
  await as(COMIC, `update platform_settings set featured_site = 'cockfight' where id = 1`);
  assert.equal((await q("select featured_site from platform_settings"))[0].featured_site, "othercomic", "a site's own team can't change ComicTable's front page");
  assert.match(await as(OWNER, `insert into platform_settings (id) values (2)`), /check|row-level/i);
});

test("roles: shows-only people do dates and clubs, moderators do the forum and chat, staff can't run ComicTable itself", async () => {
  const BOOKER = "55555555-5555-5555-5555-555555555555", MOD = "66666666-6666-6666-6666-666666666666", STAFF = "77777777-7777-7777-7777-777777777777", BOSS = "44444444-4444-4444-4444-444444444444";
  await db.exec(`insert into auth.users values ('${BOOKER}', 'booker@x'), ('${MOD}', 'mod@x'), ('${STAFF}', 'staff@x') on conflict do nothing;
    insert into admins (user_id, site_id, role) values ('${BOOKER}', 'cockfight', 'shows'), ('${MOD}', 'cockfight', 'moderator');
    insert into platform_admins (user_id, role) values ('${STAFF}', 'staff') on conflict (user_id) do update set role = 'staff';`);
  // shows-only
  assert.equal(await as(BOOKER, `insert into shows (site_id, date, venue, city) values ('cockfight', current_date + 3, 'Zanies', 'Chicago')`), "ok");
  assert.equal(await as(BOOKER, `insert into venues (name, city, verified, created_by_site) values ('New Room', 'Austin', false, 'cockfight')`), "ok");
  assert.match(await as(BOOKER, `insert into venues (name, city, verified, created_by_site) values ('Fake Verified', 'Austin', true, 'cockfight')`), /row-level/i);
  await as(BOOKER, `update episodes set title = 'hacked' where site_id = 'cockfight'`);
  assert.equal((await q("select count(*)::int n from episodes where title = 'hacked'"))[0].n, 0, "shows-only can't touch episodes");
  await as(BOOKER, `update comics set bio = 'booker wrote this' where id = 'tristan-bowling'`);
  assert.notEqual((await q("select bio from comics where id = 'tristan-bowling'"))[0].bio, "booker wrote this", "or comics' profiles");
  assert.equal((await rows(BOOKER, "select * from fans where site_id = 'cockfight'")).length, 0, "or the fan list");
  // moderator
  assert.match(await as(MOD, `insert into shows (site_id, date, venue) values ('cockfight', current_date + 4, 'Nope')`), /row-level/i);
  assert.equal(await as(MOD, `insert into bans (site_id, author, reason) values ('cockfight', 'troll', 'spam')`), "ok");
  // staff: every site's content, but not ComicTable itself
  assert.equal(await as(STAFF, `update episodes set title = title where site_id = 'cockfight'`), "ok");
  assert.match(await as(STAFF, `select public.create_site('newone', 'New One')`), /Only ComicTable admins/);
  await as(STAFF, `update platform_settings set featured_site = null where id = 1`);
  assert.notEqual((await q("select featured_site from platform_settings"))[0].featured_site, null, "staff can't change the front page");
  assert.match(await as(STAFF, `select public.set_platform_role('${STAFF}', 'admin')`), /Only ComicTable admins/, "or promote themselves");
  assert.equal(await as(BOSS, `select public.set_platform_role('${STAFF}', 'admin')`), "ok");
  assert.equal((await q(`select role from platform_admins where user_id = '${STAFF}'`))[0].role, "admin");
  assert.match(await as(OWNER, `insert into admins (user_id, site_id, role) values ('${MOD}', 'othercomic', 'boss')`), /check|row-level|permission/i);
});

test("rules: photos only go into a site you can edit, moderators can't add comics, shows people can remove their own new clubs", async () => {
  const MOD = "66666666-6666-6666-6666-666666666666", BOOKER = "55555555-5555-5555-5555-555555555555";
  assert.match(await as(MOD, `insert into storage.objects (bucket_id, name) values ('photos', 'cockfight/x.jpg')`), /row-level/i, "a moderator can't upload site photos");
  assert.equal(await as(OWNER, `insert into storage.objects (bucket_id, name) values ('photos', 'cockfight/ok.jpg')`), "ok");
  assert.match(await as(COMIC, `insert into storage.objects (bucket_id, name) values ('photos', 'cockfight/sneaky.jpg')`), /row-level/i, "another site's team can't upload into Cockfight's folder");
  assert.match(await as(MOD, `insert into comics (id, name) values ('mod-made', 'Nope')`), /row-level/i);
  await q(`insert into venues (name, city, verified, created_by_site) values ('Booker Room', 'Austin', false, 'cockfight')`);
  assert.equal(await as(BOOKER, `delete from venues where name = 'Booker Room'`), "ok");
  assert.equal((await q("select count(*)::int n from venues where name = 'Booker Room'"))[0].n, 0);
});

test("Coasters: a Tape and a look, a site's own photo, asking a comic with a login first, and who else is on the bill", async () => {
  const LEV = "33333333-3333-3333-3333-333333333333";
  await q(`update comics set user_id = '${LEV}' where id = 'lev-fer'`);
  // the Coaster itself
  assert.equal(await as(LEV, `update comics set tape_url = 'https://www.youtube.com/watch?v=abc', tape_title = 'Live at the Cellar', look = 'spooky' where id = 'lev-fer'`), "ok");
  assert.match(await as(LEV, `update comics set look = 'neon-vomit' where id = 'lev-fer'`), /check constraint/i);
  assert.match(await as(LEV, `update comics set tape_url = 'javascript:alert(1)' where id = 'lev-fer'`), /check constraint/i);
  assert.match(await as(OWNER, `insert into comics (id, name) values ('login', 'Login Person')`), /reserved|check constraint/i, "comictable.com/login stays the login page");
  // a site can't just add a comic who has their own login: it asks, and the comic says yes
  assert.equal((await q("select count(*)::int n from hosts where site_id = 'othercomic' and comic_id = 'lev-fer'"))[0].n, 0);
  assert.match(await as(COMIC, `insert into hosts (id, site_id, comic_id, name, sort) values ('othercomic-lev', 'othercomic', 'lev-fer', 'Lev Fer', 0)`), /Ask them first/);
  assert.equal(await as(COMIC, `insert into hosts (id, site_id, comic_id, name, sort) values ('othercomic-colum', 'othercomic', 'colum-tyrrell', 'Colum', 0)`), "ok", "no login, no ask");
  assert.equal(await as(COMIC, `insert into coaster_requests (comic_id, site_id, requested_by) values ('lev-fer', 'othercomic', '${COMIC}')`), "ok");
  assert.match(await as(COMIC, `insert into coaster_requests (comic_id, site_id, requested_by) values ('lev-fer', 'cockfight', '${COMIC}')`), /row-level/i, "only for your own site");
  const req = (await rows(LEV, "select id from coaster_requests where status = 'pending'"))[0];
  assert.ok(req, "Lev sees the request");
  assert.equal((await rows("88888888-8888-8888-8888-888888888888", "select id from coaster_requests")).length, 0, "strangers don't");
  assert.match(await as(COMIC, `select answer_coaster_request('${req.id}', true)`), /Only the comic/);
  assert.equal(await as(LEV, `select answer_coaster_request('${req.id}', true)`), "ok");
  assert.equal((await q("select count(*)::int n from hosts where site_id = 'othercomic' and comic_id = 'lev-fer'"))[0].n, 1);
  assert.match(await as(LEV, `select answer_coaster_request('${req.id}', false)`), /already answered/);
  // a photo just for one site
  const levCF = (await q("select id from hosts where comic_id = 'lev-fer' and site_id = 'cockfight'"))[0].id;
  await q(`update hosts set own_photo = true, photo_url = 'https://cf.example/lev.jpg' where id = '${levCF}'`);
  // an older upgrade run again can't undo the rules that keep sites in step
  await db.exec(file("UPGRADE_V2_ALL.sql"));
  await q(`update comics set photo_url = 'https://new.example/lev.jpg', socials = '{"threads":"https://threads.net/@lev"}' where id = 'lev-fer'`);
  const cps = await q("select site_id, photo_url, socials from hosts where comic_id = 'lev-fer' order by site_id");
  assert.equal(cps.find((x) => x.site_id === "cockfight").photo_url, "https://cf.example/lev.jpg", "Cockfight keeps its own photo");
  assert.equal(cps.find((x) => x.site_id === "othercomic").photo_url, "https://new.example/lev.jpg", "other sites follow the Coaster");
  assert.equal(cps.find((x) => x.site_id === "cockfight").socials.threads, "https://threads.net/@lev", "socials still follow after an old upgrade runs again");
  await q(`update hosts set own_photo = false where id = '${levCF}'`);
  assert.equal((await q(`select photo_url from hosts where id = '${levCF}'`))[0].photo_url, "https://new.example/lev.jpg", "back to the Coaster's photo");
  // also on the bill: same club, same night, both comics leave it on
  const v = (await q("select id from venues limit 1"))[0].id;
  await q(`delete from shows where date = current_date + 20`);
  await q(`insert into shows (site_id, comic_id, date, venue_id, venue) values ('cockfight', 'lev-fer', current_date + 20, '${v}', 'X'), ('cockfight', 'colum-tyrrell', current_date + 20, '${v}', 'X')`);
  const bill = await rows(null, "select * from also_on_bill('lev-fer')");
  assert.ok(bill.some((b) => b.comic_id === "colum-tyrrell"), "Colum shows up on Lev's bill without anyone tagging");
  await q(`update comics set on_bills = false where id = 'colum-tyrrell'`);
  assert.ok(!(await rows(null, "select * from also_on_bill('lev-fer')")).some((b) => b.comic_id === "colum-tyrrell"), "switched off, he doesn't");
  await q(`update comics set on_bills = true where id = 'colum-tyrrell'`);
});

test("Coasters: preset looks for everyone; a Custom look comes with a site or Pro; only ComicTable admins give Pro", async () => {
  const LEV = "33333333-3333-3333-3333-333333333333", SOLO = "99999999-9999-9999-9999-999999999999", BOSS = "44444444-4444-4444-4444-444444444444";
  await q(`insert into auth.users values ('${SOLO}', 'solo@x') on conflict do nothing`);
  await q(`insert into comics (id, name, user_id) values ('solo-sam', 'Solo Sam', '${SOLO}') on conflict do nothing`);
  assert.equal(await as(SOLO, `update comics set look = 'mustard' where id = 'solo-sam'`), "ok", "presets are for everyone");
  assert.match(await as(SOLO, `update comics set look = 'custom', coaster = '{"style":{"pulp":"#ffffff"}}' where id = 'solo-sam'`), /come with a site/);
  assert.match(await as(SOLO, `update comics set pro = true where id = 'solo-sam'`), /Only ComicTable admins/);
  assert.equal(await as(BOSS, `update comics set pro = true where id = 'solo-sam'`), "ok");
  assert.equal(await as(SOLO, `update comics set look = 'custom', coaster = '{"style":{"pulp":"#ffffff"}}' where id = 'solo-sam'`), "ok", "Pro gets Custom");
  assert.equal(await as(LEV, `update comics set look = 'custom', coaster = '{"style":{"pulp":"#000000"}}' where id = 'lev-fer'`), "ok", "Lev is on a site, so he gets Custom");
  assert.equal(await as(LEV, `update comics set bio = 'still fine' where id = 'lev-fer'`), "ok");
});

test("Coaster addresses: one rule for everyone (full name with dashes), made automatically, never clashing", async () => {
  const LEV = "33333333-3333-3333-3333-333333333333", BOSS = "44444444-4444-4444-4444-444444444444";
  assert.equal((await q("select handle from comics where id = 'lev-fer'"))[0].handle, "lev-fer", "existing comics got their address");
  assert.equal((await q("select count(*)::int n from comics where handle is null"))[0].n, 0);
  await q(`insert into comics (id, name) values ('lev-2-test', 'Lev Fer')`);
  assert.equal((await q("select handle from comics where id = 'lev-2-test'"))[0].handle, "lev-fer-2", "a second Lev Fer doesn't take the first one's address");
  await q(`insert into comics (id, name) values ('press-person', 'Press')`);
  assert.equal((await q("select handle from comics where id = 'press-person'"))[0].handle, "press-comic", "comictable.com's own pages stay theirs");
  assert.match(await as(LEV, `update comics set handle = 'king-lev' where id = 'lev-fer'`), /set by ComicTable/);
  assert.equal(await as(BOSS, `update comics set handle = 'lev-f' where id = 'lev-2-test'`), "ok", "ComicTable admins can fix one by hand");
  assert.match(await as(BOSS, `update comics set handle = 'Lev Fer!' where id = 'lev-2-test'`), /check constraint/);
  await q(`delete from comics where id in ('lev-2-test', 'press-person')`);
  const bill = await rows(null, "select * from also_on_bill('lev-fer')");
  assert.ok(bill.every((b) => b.handle), "shared bills link by address");
});

test("a Coaster with no site: the comic adds their own dates, and they show on their Coaster", async () => {
  const SOLO = "99999999-9999-9999-9999-999999999999";
  assert.equal(await as(SOLO, `insert into shows (comic_id, date, venue, city) values ('solo-sam', current_date + 4, 'Comedy Cellar', 'New York')`), "ok");
  assert.match(await as(SOLO, `insert into shows (comic_id, date, venue) values ('lev-fer', current_date + 4, 'Not mine')`), /row-level/i);
  assert.match(await as(null, `insert into shows (date, venue) values (current_date + 4, 'Nobody')`), /row-level|check|permission/i);
  const mine = (await rows(null, "select r from comic_shows('solo-sam') r")).map((x) => x.r);
  assert.ok(mine.some((r) => r.venue === "Comedy Cellar" && r.site_id === null));
  // an older upgrade run again keeps it working
  await db.exec(file("UPGRADE_V2_ALL.sql"));
  assert.ok((await rows(null, "select r from comic_shows('solo-sam') r")).some((x) => x.r.venue === "Comedy Cellar"));
});

test("News: every announcement moved into News as a banner, once; News takes styles and start dates", async () => {
  const ann = (await q("select count(*)::int n from announcements where coalesce(trim(text), '') <> ''"))[0].n;
  assert.ok(ann > 0, "the seed has announcements");
  const moved = await q("select style, kind, headline, from_announcement from home_picks where from_announcement is not null");
  assert.equal(moved.length, ann);
  assert.ok(moved.every((p) => p.style === "banner" && p.kind === "announcement"));
  await db.exec(file("22_news.sql"));
  assert.equal((await q("select count(*)::int n from home_picks where from_announcement is not null"))[0].n, ann, "running it again doesn't copy them twice");
  assert.equal(await as(OWNER, `insert into home_picks (site_id, headline, style, starts_on) values ('cockfight', 'Strip test', 'strip', current_date + 3)`), "ok");
  assert.match(await as(OWNER, `insert into home_picks (site_id, headline, style) values ('cockfight', 'Bad', 'popup')`), /check constraint/);
});
