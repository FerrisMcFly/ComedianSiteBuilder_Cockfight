import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { eventsFromHtml, eventsFromIcs, whenOf, mentions, importShows } from "../netlify/lib/shows.mjs";

const club = readFileSync(new URL("./fixtures/club.html", import.meta.url), "utf8");
const ics = readFileSync(new URL("./fixtures/tour.ics", import.meta.url), "utf8");

test("times are read as the venue's local time", () => {
  assert.deepEqual(whenOf("2099-11-06T19:30:00-05:00"), { date: "2099-11-06", time: "7:30 PM" });
  assert.deepEqual(whenOf("20991113T000500"), { date: "2099-11-13", time: "12:05 AM" });
  assert.deepEqual(whenOf("2099-11-20"), { date: "2099-11-20", time: null });
  assert.equal(whenOf("soon"), null);
});

test("club and ticket pages: events come out with venue, city, link and sold-out status", () => {
  const ev = eventsFromHtml(club);
  assert.equal(ev.length, 5);
  assert.deepEqual(ev[0], { date: "2099-11-06", time: "7:30 PM", title: "Tristan Bowling", venue: "Laugh Boston", city: "Boston, MA", url: "https://tix.example/tb-1", status: "on_sale", people: [], text: ev[0].text });
  assert.equal(ev[1].status, "sold_out");
  assert.ok(mentions(ev[3], "Tristan Bowling"), "a performer listed on the event counts");
  assert.ok(!mentions(ev[2], "Tristan Bowling"));
});

test("calendar feeds work too", () => {
  const ev = eventsFromIcs(ics);
  assert.equal(ev.length, 2);
  assert.deepEqual([ev[0].date, ev[0].time, ev[0].venue, ev[0].city, ev[0].url], ["2099-11-13", "8:00 PM", "Zanies Comedy Club", "Chicago, IL", "https://tix.example/zanies"]);
  assert.deepEqual([ev[1].time, ev[1].status, ev[1].url], [null, "sold_out", "https://tix.example/fest"]);
});

function fakeDb(t) {
  return { from(name) {
    const f = []; let op = "select", payload, one = false;
    const b = {
      select() { return b; }, eq(k, v) { f.push((r) => r[k] === v); return b; }, gte(k, v) { f.push((r) => r[k] >= v); return b; }, is(k, v) { f.push((r) => (r[k] ?? null) === v); return b; },
      maybeSingle() { one = true; return b; }, insert(r) { op = "insert"; payload = r; return b; },
      then(res, rej) {
        const rows = t[name] || (t[name] = []);
        if (op === "insert") { rows.push({ id: "n" + rows.length, ...payload }); return Promise.resolve({ error: null }).then(res, rej); }
        const data = rows.filter((r) => f.every((fn) => fn(r)));
        return Promise.resolve({ data: one ? data[0] || null : data, error: null }).then(res, rej);
      } };
    return b;
  } };
}
const page = (body, type = "text/html") => async () => ({ ok: true, status: 200, text: async () => body, headers: { get: () => type } });

test("ask-first: only this comic's upcoming dates land in Found shows, matched to the club list", async () => {
  const t = { comics: [{ id: "tristan-bowling", name: "Tristan Bowling" }], shows: [], found_shows: [],
    venues: [{ id: "v1", name: "Laugh Boston", city: "Boston", state: "MA" }] };
  const src = { id: "s1", site_id: "cockfight", comic_id: "tristan-bowling", host: "tristan", url: "https://laughboston.example/calendar", auto_add: false };
  const status = await importShows(fakeDb(t), src, page(club));
  assert.match(status, /^3 new to check/);
  assert.equal(t.shows.length, 0);
  assert.deepEqual(t.found_shows.map((x) => [x.date, x.time, x.venue_id, x.state]), [["2099-11-06", "7:30 PM", "v1", "new"], ["2099-11-06", "9:45 PM", "v1", "new"], ["2099-11-08", "10:00 PM", "v1", "new"]]);
  // running again finds nothing new
  assert.match(await importShows(fakeDb(t), src, page(club)), /^0 new/);
});

test("auto-add: new dates go straight onto the comic's calendar, skipping ones already there", async () => {
  const t = { comics: [{ id: "tristan-bowling", name: "Tristan Bowling" }], found_shows: [], venues: [],
    shows: [{ id: "x", comic_id: "tristan-bowling", date: "2099-11-06", time: "7:30 PM", venue: "Laugh Boston" }] };
  const src = { id: "s2", site_id: "cockfight", comic_id: "tristan-bowling", host: "tristan", url: "https://x.example/cal.ics", auto_add: true, match_all: true };
  const status = await importShows(fakeDb(t), src, page(ics, "text/calendar"));
  assert.match(status, /^2 new added/);
  assert.deepEqual(t.shows.slice(1).map((s) => [s.date, s.host, s.comic_id, s.status]), [["2099-11-13", "tristan", "tristan-bowling", "on_sale"], ["2099-11-20", "tristan", "tristan-bowling", "sold_out"]]);
});

test("a page with no dates says what to try instead", async () => {
  await assert.rejects(importShows(fakeDb({}), { id: "s", site_id: "x", url: "https://x.example/" }, page("<html>nothing</html>")), /No show dates found/);
});
