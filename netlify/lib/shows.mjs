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

/* ---------- events marked up in the page itself (schema.org microdata) ---------- */
export function eventsFromMicrodata(html) {
  const out = [];
  const parts = (" " + String(html)).split(/(?=<[^>]+itemtype=["'][^"']*schema\.org\/\w*Event["'])/i).slice(1);
  for (const chunk0 of parts) {
    const chunk = chunk0.slice(0, 6000);
    const prop = (k) => {
      const m = chunk.match(new RegExp("<[^>]*itemprop=[\"']" + k + "[\"'][^>]*>", "i"));
      if (!m) return "";
      const tag = m[0], attr = tag.match(/(?:content|datetime|href)=["']([^"']*)["']/i);
      if (attr) return attr[1];
      const after = chunk.slice(chunk.indexOf(tag) + tag.length);
      return after.split("<")[0].trim();
    };
    const when = whenOf(prop("startDate"));
    if (!when) continue;
    const title = decode(prop("name"));
    out.push({ date: when.date, time: when.time, title, venue: "", city: decode(prop("addressLocality")), url: prop("url") || null,
      status: /sold\s*out/i.test(chunk) ? "sold_out" : "on_sale", people: [], text: title + " " + decode(chunk.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")).slice(0, 600) });
  }
  return out;
}

/* ---------- show data the page ships as JSON for its own scripts (Next.js and similar) ---------- */
const DATE_KEYS = ["startDate", "start_date", "start", "startTime", "start_time", "dateTime", "date_time", "datetime", "showtime", "showTime", "eventDate", "event_date", "performance_date", "date"];
const NAME_KEYS = ["name", "title", "headliner", "headliner_name", "eventName", "event_name", "showName", "show_name"];
export function eventsFromJson(html) {
  const out = [];
  const re = /<script[^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  const walk = (node, depth) => {
    if (!node || typeof node !== "object" || depth > 12 || out.length > 500) return;
    if (Array.isArray(node)) { node.forEach((n) => walk(n, depth + 1)); return; }
    const dk = DATE_KEYS.find((k) => typeof node[k] === "string" && /^\d{4}-\d{2}-\d{2}/.test(node[k]));
    const nk = NAME_KEYS.find((k) => typeof node[k] === "string" && node[k].trim());
    if (dk && nk) {
      const when = whenOf(node[dk]);
      // a date with no clock time: look for a separate time field
      const t = !when.time && typeof (node.time || node.showtime_display || node.start_time_display) === "string" ? node.time || node.showtime_display || node.start_time_display : null;
      const v = node.venue || node.location || {};
      const venue = typeof v === "string" ? v : str(v.name);
      const city = typeof v === "object" ? [str(v.city || (v.address && v.address.addressLocality)), str(v.state || (v.address && v.address.addressRegion))].filter(Boolean).join(", ") : "";
      const people = arr(node.performers || node.comedians || node.lineup || node.artists).map((x) => str(typeof x === "object" ? x.name || x.title : x)).filter(Boolean);
      const url = [node.ticket_url, node.ticketUrl, node.tickets_url, node.purchase_url, node.url, node.link].find((x) => typeof x === "string" && /^https?:/.test(x)) || null;
      const title = decode(String(node[nk]).trim());
      out.push({ date: when.date, time: when.time || (t && /\d/.test(t) ? t.toUpperCase().replace(/\s*(AM|PM)/, " $1") : null), title, venue: decode(venue), city: decode(city), url,
        status: node.sold_out || node.soldOut || /sold\s*out/i.test(title) ? "sold_out" : node.cancelled || node.canceled ? "cancelled" : "on_sale",
        people, text: decode([title, people.join(" "), str(node.description || node.subtitle || "")].join(" ")) });
      return;
    }
    for (const k in node) walk(node[k], depth + 1);
  };
  while ((m = re.exec(html))) { try { walk(JSON.parse(m[1]), 0); } catch (e) { /* not JSON we can use */ } }
  return out;
}

// A calendar feed the page links to (Subscribe / Add to calendar)
export function icsLinkIn(html, base) {
  const m = String(html).match(/<link[^>]+type=["']text\/calendar["'][^>]*href=["']([^"']+)["']/i) || String(html).match(/href=["']((?:webcal|https?):\/\/[^"']+\.ics(?:\?[^"']*)?|[^"']+\.ics(?:\?[^"']*)?)["']/i);
  if (!m) return null;
  try { return new URL(decode(m[1]).replace(/^webcal:/i, "https:"), base).href; } catch (e) { return null; }
}

export function parseListing(body, contentType = "") {
  if (/text\/calendar/i.test(contentType) || /^\s*BEGIN:VCALENDAR/i.test(body)) return eventsFromIcs(body);
  const ld = eventsFromHtml(body);
  if (ld.length) return ld;
  const md = eventsFromMicrodata(body);
  if (md.length) return md;
  return eventsFromJson(body);
}

// What a failed page check means, in plain words
export function fetchProblem(host, status) {
  if (status === 401 || status === 403 || status === 429) return `${host} blocks automatic checks, so ComicTable can't read it. Try the comic's own tour page, a ticket page, or a calendar (.ics) link instead.`;
  if (status === 404 || status === 410) return `That page isn't there anymore on ${host}. Check the link.`;
  if (status >= 500) return `${host} is having trouble right now. ComicTable will try again next hour.`;
  return `${host} didn't send the page (error ${status}).`;
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
  const host0 = new URL(src.url).hostname;
  let r;
  try { r = await fetchImpl(src.url, { headers: UA, redirect: "follow" }); } catch (e) { throw new Error(`Couldn't reach ${host0}. ComicTable will try again next hour.`); }
  if (!r.ok) throw new Error(fetchProblem(host0, r.status));
  const ctype = r.headers && r.headers.get ? r.headers.get("content-type") || "" : "";
  const body = await r.text();
  let all = parseListing(body, ctype);
  // Nothing in the page itself, but it links a calendar feed: read that instead.
  if (!all.length && !/text\/calendar/i.test(ctype)) {
    const ics = icsLinkIn(body, src.url);
    if (ics) { try { const r2 = await fetchImpl(ics, { headers: UA, redirect: "follow" }); if (r2.ok) all = eventsFromIcs(await r2.text()); } catch (e) { /* fall through to the message below */ } }
  }
  if (!all.length) throw new Error("ComicTable couldn't see any shows on this page. Some clubs load their calendar in a way it can't read yet. Try the comic's tour page, a ticket page, or a calendar (.ics) link.");

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
