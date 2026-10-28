// Show finder: reads show dates from the pages comics point it at.
// Understands the event listings that ticket sites and club calendars publish for Google
// (schema.org Event data inside the page) and calendar feeds (.ics). Nothing site-specific to break.

const UA = { "User-Agent": "Mozilla/5.0 (compatible; ComicTable/1.0; +https://comictable.com)" };
const arr = (x) => (x === undefined || x === null ? [] : Array.isArray(x) ? x : [x]);
const str = (x) => (x === undefined || x === null ? "" : typeof x === "object" ? String(x.name || x["@value"] || "") : String(x)).trim();
const decode = (s) => String(s).replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));

const STATES = { alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA", colorado: "CO", connecticut: "CT", delaware: "DE", florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA", kansas: "KS", kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD", massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS", missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV", "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY", "north carolina": "NC", "north dakota": "ND", ohio: "OH", oklahoma: "OK", oregon: "OR", pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC", "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT", virginia: "VA", washington: "WA", "west virginia": "WV", wisconsin: "WI", wyoming: "WY", "district of columbia": "DC" };
const stateAbbr = (s) => { s = str(s); return STATES[s.toLowerCase()] || s; };

// "2026-11-06T19:30:00-05:00" → { date: "2026-11-06", time: "7:30 PM" }. Uses the time as written (the venue's local time).
export function whenOf(raw) {
  const m = str(raw).match(/^(\d{4})-?(\d{2})-?(\d{2})(?:[T ](\d{2}):?(\d{2}))?/);
  if (!m) return null;
  const date = `${m[1]}-${m[2]}-${m[3]}`;
  if (m[4] === undefined) return { date, time: null };
  let H = +m[4]; const M = m[5], ap = H >= 12 ? "PM" : "AM";
  H = H % 12 || 12;
  return { date, time: `${H}:${M} ${ap}` };
}

/* ---------- schema.org events inside a web page ---------- */
function collectEvents(node, out) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) { node.forEach((n) => collectEvents(n, out)); return; }
  const types = arr(node["@type"]).map(String);
  if (types.some((t) => /Event$/.test(t)) && node.startDate) out.push(node);
  for (const k of ["@graph", "itemListElement", "item", "subEvent", "events", "event"]) if (node[k]) collectEvents(node[k], out);
}
export function eventsFromHtml(html) {
  const out = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    let txt = m[1].trim().replace(/^<!--|-->$/g, "");
    try { collectEvents(JSON.parse(txt), out); } catch (e) { /* one broken block shouldn't stop the rest */ }
  }
  return out.map((e) => {
    const when = whenOf(e.startDate);
    const loc = arr(e.location)[0] || {};
    const addr = typeof loc.address === "object" ? loc.address : {};
    const city = [str(addr.addressLocality), stateAbbr(addr.addressRegion)].filter(Boolean).join(", ") || (typeof loc.address === "string" ? loc.address : "");
    const offers = arr(e.offers)[0] || {};
    const performers = arr(e.performer).map(str).filter(Boolean);
    const soldOut = /SoldOut/i.test(str(offers.availability)) || /sold\s*out/i.test(str(e.name));
    const cancelled = /Cancelled/i.test(str(e.eventStatus));
    return when && {
      date: when.date, time: when.time,
      title: decode(str(e.name)), venue: decode(str(loc.name)), city: decode(city),
      url: str(offers.url) || str(e.url) || null,
      status: cancelled ? "cancelled" : soldOut ? "sold_out" : "on_sale",
      people: performers.map(decode), text: decode([str(e.name), performers.join(" "), str(e.description)].join(" "))
    };
  }).filter(Boolean);
}

/* ---------- calendar feeds (.ics) ---------- */
export function eventsFromIcs(ics) {
  const unfolded = String(ics).replace(/\r?\n[ \t]/g, "");
  const out = [];
  for (const block of unfolded.split(/BEGIN:VEVENT/).slice(1)) {
    const body = block.split(/END:VEVENT/)[0];
    const get = (k) => { const m = body.match(new RegExp("^" + k + "(?:;[^:\\n]*)?:(.*)$", "mi")); return m ? m[1].trim().replace(/\\,/g, ",").replace(/\\n/gi, " ").replace(/\\;/g, ";") : ""; };
    const when = whenOf(get("DTSTART").replace(/Z$/, ""));
    if (!when) continue;
    const loc = get("LOCATION"), parts = loc.split(",").map((x) => x.trim()).filter(Boolean);
    const title = get("SUMMARY");
    out.push({
      date: when.date, time: when.time, title, venue: parts[0] || "", city: parts.length >= 3 ? parts.slice(-3, -1).join(", ").replace(/\s+\d{5}.*$/, "") : parts.slice(1).join(", "),
      url: get("URL") || (get("DESCRIPTION").match(/https?:\/\/\S+/) || [null])[0],
      status: /CANCELLED/i.test(get("STATUS")) ? "cancelled" : /sold\s*out/i.test(title) ? "sold_out" : "on_sale",
      people: [], text: title + " " + get("DESCRIPTION")
    });
  }
  return out;
}

export function parseListing(body, contentType = "") {
  if (/text\/calendar/i.test(contentType) || /^\s*BEGIN:VCALENDAR/i.test(body)) return eventsFromIcs(body);
  return eventsFromHtml(body);
}

// Does a listing mention this comic? Full name, or their last name when it's distinctive enough.
export function mentions(ev, name) {
  const n = String(name || "").toLowerCase().trim();
  if (!n) return true;
  const hay = (ev.text + " " + ev.people.join(" ")).toLowerCase();
  if (hay.includes(n)) return true;
  const parts = n.split(/\s+/);
  const last = parts[parts.length - 1];
  return parts.length > 1 && last.length >= 5 && new RegExp("\\b" + last.replace(/[^a-z0-9-]/g, "") + "\\b").test(hay);
}

export const showKey = (e) => [e.date, (e.time || "").toLowerCase(), (e.venue || e.city || "").toLowerCase().replace(/[^a-z0-9]/g, "")].join("|");
const norm = (s) => String(s || "").toLowerCase().replace(/^the\s+/, "").replace(/[^a-z0-9]/g, "");

/* ---------- running a show source ---------- */
export async function importShows(db, src, fetchImpl = fetch) {
  const r = await fetchImpl(src.url, { headers: UA, redirect: "follow" });
  if (!r.ok) throw new Error(`${new URL(src.url).hostname} answered ${r.status}`);
  const all = parseListing(await r.text(), r.headers && r.headers.get ? r.headers.get("content-type") || "" : "");
  if (!all.length) throw new Error("No show dates found on this page. Try the page that lists the shows, a ticket page, or a calendar (.ics) link.");

  let comic = null, host = src.host || null;
  if (src.comic_id) comic = (await db.from("comics").select("id, name").eq("id", src.comic_id).maybeSingle()).data;
  const today = new Date().toISOString().slice(0, 10);
  const mine = all.filter((e) => e.date >= today && (src.match_all || !comic || mentions(e, comic.name)));

  // skip anything already on their calendar (same day, same club or same time)
  const existing = src.comic_id
    ? (await db.from("shows").select("date, time, venue, city").eq("comic_id", src.comic_id).gte("date", today)).data || []
    : (await db.from("shows").select("date, time, venue, city").eq("site_id", src.site_id).is("comic_id", null).gte("date", today)).data || [];
  // Same night counts as the same show when the times match, or when one has no time and the club matches.
  // (Two times at the same club the same night are two shows.)
  const have = (e) => existing.some((x) => x.date === e.date && (e.time && x.time ? x.time.toLowerCase() === e.time.toLowerCase() : !!e.venue && norm(x.venue) === norm(e.venue)));
  const seen = new Set(((await db.from("found_shows").select("key").eq(src.comic_id ? "comic_id" : "site_id", src.comic_id || src.site_id)).data || []).map((x) => x.key));

  const venues = (await db.from("venues").select("id, name, city, state")).data || [];
  const clubFor = (e) => venues.find((v) => norm(v.name) === norm(e.venue) || (norm(e.venue).includes(norm(v.name)) && norm(v.name).length > 5 && (!e.city || norm(e.city).includes(norm(v.city)))));

  let added = 0, found = 0;
  for (const e of mine) {
    const key = showKey(e);
    if (seen.has(key) || have(e)) continue;
    const club = e.venue ? clubFor(e) : null;
    const place = { date: e.date, time: e.time, venue: club ? club.name : e.venue || null, city: club ? (club.state ? club.city + ", " + club.state : club.city) : e.city || null, venue_id: club ? club.id : null, url: e.url, status: e.status };
    if (src.auto_add) {
      const row = { ...place, site_id: src.site_id, host, comic_id: src.comic_id || null, ...(src.comic_id ? {} : { lineup: null }) };
      const ins = await db.from("shows").insert(row);
      if (ins.error) throw ins.error;
      added++;
    } else found++;
    // remember it either way, so an ignored or deleted listing doesn't come back
    const f = await db.from("found_shows").insert({ ...place, key, title: e.title || null, source_id: src.id, site_id: src.site_id, comic_id: src.comic_id || null, state: src.auto_add ? "added" : "new" });
    if (f.error && !/duplicate/i.test(f.error.message || "")) throw f.error;
    seen.add(key); existing.push(place);
  }
  const skipped = all.length - mine.length;
  return src.auto_add ? `${added} new added (${mine.length} upcoming${skipped ? ", " + skipped + " not theirs or past" : ""})`
    : `${found} new to check (${mine.length} upcoming${skipped ? ", " + skipped + " not theirs or past" : ""})`;
}
