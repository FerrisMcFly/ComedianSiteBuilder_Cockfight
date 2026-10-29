import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { splitTitle, prettyDuration, parsePodcastFeed, parseYouTubeFeed, runSources, appleId, cleanDescription } from "../netlify/lib/importer.mjs";

test("titles split into number + name", () => {
  assert.deepEqual(splitTitle("Marathon Chainsaw | E91"), { num: 91, title: "Marathon Chainsaw" });
  assert.deepEqual(splitTitle("Lev vs. Cumtown | E84 Part 2"), { num: 84, title: "Lev vs. Cumtown (Part 2)" });
  assert.deepEqual(splitTitle("Ep. 12 - The Big One"), { num: 12, title: "The Big One" });
  assert.deepEqual(splitTitle("Episode 7: Pilot"), { num: 7, title: "Pilot" });
  assert.deepEqual(splitTitle("No Number Here"), { num: null, title: "No Number Here" });
  assert.deepEqual(splitTitle("Whatever", "33"), { num: 33, title: "Whatever" });
});

test("durations read nicely", () => {
  assert.equal(prettyDuration("01:20:03"), "1h 20m");
  assert.equal(prettyDuration("4803"), "1h 20m");
  assert.equal(prettyDuration("52:10"), "52m");
  assert.equal(prettyDuration(""), null);
});

test("promo lines are removed from descriptions", () => {
  assert.equal(cleanDescription("<p>Cockfight Podcast Patreon for Part 2: https://x</p>"), null);
  assert.equal(cleanDescription("<p>The guys finally go to the Knicks game.</p><p>Patreon: https://x</p>"), "The guys finally go to the Knicks game.");
});

test("apple links give an id", () => {
  assert.equal(appleId("https://podcasts.apple.com/us/podcast/cockfight/id1792746019"), "1792746019");
  assert.equal(appleId("https://feeds.megaphone.fm/X"), null);
});

test("podcast feed parses", () => {
  const eps = parsePodcastFeed(readFileSync(new URL("./fixtures/podcast.xml", import.meta.url), "utf8"));
  assert.equal(eps.length, 3);
  assert.equal(eps[0].num, 92); assert.equal(eps[0].posted, "2026-10-29"); assert.equal(eps[0].length, "1h 20m");
  assert.equal(eps[0].patreon, "p2"); assert.match(eps[0].blurb, /Knicks/);
  assert.equal(eps[2].title, "Lev vs. Cumtown (Part 2)"); assert.equal(eps[2].patreon, "p1");
});

test("youtube feed parses", () => {
  const v = parseYouTubeFeed(readFileSync(new URL("./fixtures/youtube.xml", import.meta.url), "utf8"));
  assert.equal(v.length, 2); assert.equal(v[0].youtube_id, "AAAAAAAAAAA"); assert.equal(v[1].thumbnail_url, "https://i.ytimg.com/vi/BBBBBBBBBBB/hqdefault.jpg");
});

// A tiny stand-in for the Supabase client
function fakeDb(tables) {
  return { from(t) {
    const f = []; let op = "select", payload;
    const b = {
      select() { return b; }, eq(k, v) { f.push((r) => r[k] === v); return b; },
      or(expr) { const alts = expr.split(",").map((p) => p.match(/^(\w+)\.eq\.(.*)$/)); f.push((r) => alts.some(([, k, v]) => String(r[k]) === v)); return b; },
      insert(r) { op = "insert"; payload = r; return b; }, update(r) { op = "update"; payload = r; return b; },
      then(res, rej) {
        const rows = tables[t] || (tables[t] = []);
        if (op === "insert") { [].concat(payload).forEach((x) => rows.push({ id: "n" + rows.length, ...x })); return Promise.resolve({ error: null }).then(res, rej); }
        if (op === "update") { rows.filter((r) => f.every((fn) => fn(r))).forEach((r) => Object.assign(r, payload)); return Promise.resolve({ error: null }).then(res, rej); }
        return Promise.resolve({ data: rows.filter((r) => f.every((fn) => fn(r))), error: null }).then(res, rej);
      } };
    return b;
  } };
}

test("import adds new episodes and only fills blanks on existing ones", async () => {
  const feed = readFileSync(new URL("./fixtures/podcast.xml", import.meta.url), "utf8");
  globalThis.fetch = async (url) => ({ ok: true, status: 200, text: async () => feed, json: async () => ({}) });
  const tables = {
    episodes: [
      { id: "e91", site_id: "cockfight", num: 91, title: "Marathon Chainsaw", posted: "2026-10-22", length: null, url: "https://apple/typed-by-hand", blurb: "Typed by hand", patreon: "p2", guid: null },
      { id: "e84", site_id: "cockfight", num: 84, title: "Lev vs. Cumtown (Part 2)", posted: "2026-09-03", length: "1h 5m", url: null, blurb: null, patreon: null, guid: null }
    ],
    sources: [{ id: "s1", site_id: "cockfight", kind: "podcast", url: "https://feeds.megaphone.fm/ULARE4132235124", enabled: true }]
  };
  const res = await runSources(fakeDb(tables), tables.sources);
  assert.equal(res[0].ok, true, res[0].status);
  const e = Object.fromEntries(tables.episodes.map((x) => [x.num, x]));
  assert.equal(Object.keys(e).length, 3);
  assert.equal(e[92].title, "Big Night Out"); assert.equal(e[92].site_id, "cockfight");
  assert.equal(e[91].url, "https://apple/typed-by-hand"); assert.equal(e[91].blurb, "Typed by hand");
  assert.equal(e[91].length, "1h 20m"); assert.equal(e[91].guid, "abc-91");
  assert.equal(e[84].patreon, "p1");
  assert.match(tables.sources[0].last_status, /1 new/);
  // running again changes nothing
  const again = await runSources(fakeDb(tables), tables.sources);
  assert.match(again[0].status, /^0 new, 0 filled/);
});

test("youtube import adds only new videos", async () => {
  const feed = readFileSync(new URL("./fixtures/youtube.xml", import.meta.url), "utf8");
  globalThis.fetch = async () => ({ ok: true, status: 200, text: async () => feed });
  const tables = { videos: [{ id: "v", site_id: "cockfight", youtube_id: "AAAAAAAAAAA" }], sources: [{ id: "y", site_id: "cockfight", kind: "youtube", url: "https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv", enabled: true }] };
  const res = await runSources(fakeDb(tables), tables.sources);
  assert.equal(res[0].ok, true, res[0].status);
  assert.equal(tables.videos.length, 2); assert.equal(tables.videos[1].youtube_id, "BBBBBBBBBBB");
});

test("two podcasts on one site keep their own numbering", async () => {
  const feedA = readFileSync(new URL("./fixtures/podcast.xml", import.meta.url), "utf8");
  const feedB = feedA.replace("<title>Cockfight</title>", "<title>Lev's Side Show</title>").replace(/abc-/g, "lev-").replace("Big Night Out", "Lev Alone");
  globalThis.fetch = async (url) => ({ ok: true, status: 200, text: async () => (String(url).includes("lev") ? feedB : feedA), json: async () => ({}) });
  const tables = { episodes: [], sources: [
    { id: "s1", site_id: "cockfight", kind: "podcast", url: "https://feeds.example.com/cockfight", enabled: true },
    { id: "s2", site_id: "cockfight", kind: "podcast", url: "https://feeds.example.com/lev", enabled: true }] };
  const res = await runSources(fakeDb(tables), tables.sources);
  assert.ok(res.every((r) => r.ok), JSON.stringify(res));
  assert.equal(tables.episodes.length, 6);
  const levs = tables.episodes.filter((e) => e.source_id === "s2");
  assert.equal(levs.length, 3); assert.ok(levs.every((e) => e.show_name === "Lev's Side Show"));
  assert.ok(levs.some((e) => e.num === 92 && e.title === "Lev Alone"));
  assert.equal(tables.sources[0].label, "Cockfight"); assert.equal(tables.sources[1].label, "Lev's Side Show");
});

test("a person's channel tags its videos with that person", async () => {
  const feed = readFileSync(new URL("./fixtures/youtube.xml", import.meta.url), "utf8").replace("<entry>", "<title>Lev Fer</title><author><name>Lev Fer</name></author><entry>");
  globalThis.fetch = async () => ({ ok: true, status: 200, text: async () => feed });
  const tables = { videos: [], sources: [{ id: "y2", site_id: "cockfight", kind: "youtube", url: "https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv", host: "lev", enabled: true }] };
  await runSources(fakeDb(tables), tables.sources);
  assert.equal(tables.videos.length, 2);
  assert.ok(tables.videos.every((v) => v.host === "lev" && v.channel === "Lev Fer" && v.source_id === "y2"));
});

test("a comic's own channel isn't imported twice when they're on two sites", async () => {
  const feed = readFileSync(new URL("./fixtures/youtube.xml", import.meta.url), "utf8");
  globalThis.fetch = async () => ({ ok: true, status: 200, text: async () => feed });
  // Tristan's videos were already imported through Cockfight
  const tables = { videos: [{ id: "a", site_id: "cockfight", comic_id: "tristan-bowling", youtube_id: "AAAAAAAAAAA" }],
    sources: [{ id: "y3", site_id: "apes", kind: "youtube", url: "https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv", comic_id: "tristan-bowling", enabled: true }] };
  await runSources(fakeDb(tables), tables.sources);
  assert.deepEqual(tables.videos.map((v) => v.youtube_id), ["AAAAAAAAAAA", "BBBBBBBBBBB"]);
  assert.equal(tables.videos[1].comic_id, "tristan-bowling");
});

test("YouTube Shorts: the channel's Shorts-only list marks them, new and old, and brings in Shorts not in the latest uploads", async () => {
  const feed = readFileSync(new URL("./fixtures/youtube.xml", import.meta.url), "utf8");
  const shortsFeed = `<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015"><entry><yt:videoId>BBBBBBBBBBB</yt:videoId><title>Short one</title><published>2026-10-23T15:00:00+00:00</published></entry>
    <entry><yt:videoId>AAAAAAAAAAA</yt:videoId><title>Old short</title><published>2026-10-20T15:00:00+00:00</published></entry>
    <entry><yt:videoId>CCCCCCCCCCC</yt:videoId><title>Older short</title><published>2026-09-01T15:00:00+00:00</published></entry></feed>`;
  const asked = [];
  globalThis.fetch = async (url) => { asked.push(String(url)); return { ok: true, status: 200, text: async () => (String(url).includes("playlist_id=UUSH") ? shortsFeed : feed) }; };
  const tables = { videos: [{ id: "v", site_id: "cockfight", youtube_id: "AAAAAAAAAAA", is_short: false }], sources: [{ id: "y", site_id: "cockfight", kind: "youtube", url: "https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv", enabled: true }] };
  const res = await runSources(fakeDb(tables), tables.sources);
  assert.ok(asked.some((u) => u.includes("playlist_id=UUSHabcdefghijklmnopqrstuv")), "the Shorts list is UUSH + the channel id");
  assert.match(res[0].status, /3 Shorts/);
  const by = Object.fromEntries(tables.videos.map((v) => [v.youtube_id, v]));
  assert.deepEqual([by.AAAAAAAAAAA.is_short, by.BBBBBBBBBBB.is_short, by.CCCCCCCCCCC.is_short], [true, true, true]);
});

test("Spotify: with the keys and the site's Spotify show link, episodes get their Spotify links by title", async () => {
  const { normTitle, spotifyShowId } = await import("../netlify/lib/importer.mjs");
  assert.equal(normTitle("92. Marathon Chainsaw!"), normTitle("Marathon Chainsaw"));
  assert.equal(spotifyShowId("https://open.spotify.com/show/1234567890abcdefghijkl?si=x"), "1234567890abcdefghijkl");
  const feed = readFileSync(new URL("./fixtures/podcast.xml", import.meta.url), "utf8");
  process.env.SPOTIFY_CLIENT_ID = "id"; process.env.SPOTIFY_CLIENT_SECRET = "secret";
  const firstTitle = parsePodcastFeed(feed)[0].title;
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes("accounts.spotify.com")) return { ok: true, status: 200, json: async () => ({ access_token: "t" }) };
    if (u.includes("api.spotify.com")) return { ok: true, status: 200, json: async () => ({ items: [{ name: "1. " + firstTitle, external_urls: { spotify: "https://open.spotify.com/episode/abc" } }], next: null }) };
    return { ok: true, status: 200, text: async () => feed, json: async () => ({}) };
  };
  const tables = { sites: [{ id: "cockfight", profile: { spotify_url: "https://open.spotify.com/show/1234567890abcdefghijkl" } }], episodes: [], sources: [{ id: "p", site_id: "cockfight", kind: "podcast", url: "https://feeds.example/pod.xml", enabled: true }] };
  const res = await runSources(fakeDb(tables), tables.sources);
  delete process.env.SPOTIFY_CLIENT_ID; delete process.env.SPOTIFY_CLIENT_SECRET;
  assert.match(res[0].status, /1 Spotify links/, res[0].status);
  assert.equal(tables.episodes.find((e) => e.title === firstTitle).spotify_url, "https://open.spotify.com/episode/abc");
});
