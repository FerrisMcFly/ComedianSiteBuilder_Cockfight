// POST /.netlify/functions/ticket-info { url } (logged in) → { venue, city, date, time, status, title, source }
// Paste a ticket link and the date fills itself in (Step 5, item 48). Ticket sites publish their events for search
// engines in a standard format (schema.org Event, as JSON-LD); this reads that. Eventbrite, Seetickets, Ticketmaster,
// Dice, AXS, Tixr and most club sites have it. Pages without it give back what they can (the title), and the comic
// fills in the rest.
// Safety: only https pages on public addresses, a few redirects at most, a time limit and a size limit.
import { createClient } from "@supabase/supabase-js";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
const MAX = 2 * 1024 * 1024;

// private, loopback, link-local and other addresses a server must never be asked to fetch
export function privateAddress(ip) {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v = ip.toLowerCase();
  return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80") || v.startsWith("::ffff:") && privateAddress(v.slice(7));
}
async function safeHost(host) {
  if (!host || /^(localhost|.*\.local|.*\.internal|.*\.localhost)$/i.test(host) || isIP(host)) return false;
  try { const all = await lookup(host, { all: true }); return all.length > 0 && all.every((x) => !privateAddress(x.address)); } catch (e) { return false; }
}

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const decode = (s) => String(s || "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#(\d+);/g, (m, n) => String.fromCharCode(+n)).trim();
const EVENT_TYPES = /^(Event|ComedyEvent|TheaterEvent|MusicEvent|SocialEvent|PerformingArtsEvent|DanceEvent|Festival|BusinessEvent|LiteraryEvent|ScreeningEvent)$/;
function events(node, out = []) {
  if (!node || typeof node !== "object") return out;
  if (Array.isArray(node)) { node.forEach((n) => events(n, out)); return out; }
  const t = [].concat(node["@type"] || []);
  if (t.some((x) => EVENT_TYPES.test(String(x)))) out.push(node);
  if (node["@graph"]) events(node["@graph"], out);
  if (node.subEvent) events(node.subEvent, out);
  return out;
}
// the date and time as written for the event's own place (no converting time zones: 8 PM at the club is 8 PM)
function when(start) {
  const m = String(start || "").match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
  if (!m) return { date: "", time: "" };
  const date = m[1] + "-" + m[2] + "-" + m[3];
  if (m[4] === undefined) return { date, time: "" };
  const hh = +m[4], mm = m[5];
  return { date, time: (hh === 0 && mm === "00") ? "" : ((hh % 12) || 12) + ":" + mm + (hh >= 12 ? " PM" : " AM") };
}
const text = (v) => typeof v === "string" ? decode(v) : v && typeof v === "object" ? text(v.name || v["@value"] || "") : "";

// Read a ticket page's HTML. Exported for the tests.
export function parseTicketPage(html, pageUrl) {
  const found = [];
  for (const m of String(html).matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { events(JSON.parse(m[1].trim()), found); } catch (e) {}
  }
  const ev = found.find((e) => e.startDate) || found[0];
  const og = (p) => { const m = String(html).match(new RegExp('<meta[^>]+(?:property|name)=["\']' + p + '["\'][^>]+content=["\']([^"\']*)["\']', "i")) || String(html).match(new RegExp('<meta[^>]+content=["\']([^"\']*)["\'][^>]+(?:property|name)=["\']' + p + '["\']', "i")); return m ? decode(m[1]) : ""; };
  const title = (ev && text(ev.name)) || og("og:title") || decode((String(html).match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1]);
  let host = ""; try { host = new URL(pageUrl).hostname.replace(/^www\./, ""); } catch (e) {}
  if (!ev) return { title, venue: "", city: "", date: "", time: "", status: "", source: host, found: false };
  const loc = [].concat(ev.location || [])[0] || {};
  const addr = typeof loc.address === "object" ? loc.address : {};
  const city = [text(addr.addressLocality), text(addr.addressRegion)].filter(Boolean).join(", ");
  const offers = [].concat(ev.offers || []);
  const avail = offers.map((o) => String(o && o.availability || "")).join(" ");
  const status = /SoldOut/i.test(avail) && !/InStock|LimitedAvailability/i.test(avail) ? "sold_out" : /LimitedAvailability|OnlineOnly.*Limited/i.test(avail) ? "few_left" : offers.some((o) => o && (o.price === 0 || o.price === "0" || o.price === "0.00")) ? "free" : "on_sale";
  const t = when(ev.startDate);
  return { title, venue: text(loc.name) || "", city, date: t.date, time: t.time, status: /EventCancelled/i.test(String(ev.eventStatus || "")) ? "cancelled" : status, source: host, found: true,
    nice: t.date ? MON[+t.date.slice(5, 7) - 1] + " " + +t.date.slice(8, 10) : "" };
}

export default async (req) => {
  if (req.method !== "POST") return json(405, { error: "Use POST." });
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return json(500, { error: "This isn't set up yet." });
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const db = createClient(url, key, { auth: { persistSession: false } });
  const { data: who } = token ? await db.auth.getUser(token) : { data: null };
  if (!who || !who.user) return json(401, { error: "Log in first." });
  let body = {}; try { body = await req.json(); } catch (e) {}
  let target;
  try { target = new URL(String(body.url || "").trim()); } catch (e) { return json(400, { error: "That doesn't look like a link." }); }
  if (target.protocol !== "https:") return json(400, { error: "Paste the https:// link to the ticket page." });
  let res, html = "";
  try {
    for (let hop = 0; hop < 4; hop++) {
      if (!(await safeHost(target.hostname))) return json(400, { error: "That link can't be read. Fill it in by hand." });
      res = await fetch(target, { redirect: "manual", signal: AbortSignal.timeout(7000), headers: { "User-Agent": "Mozilla/5.0 (compatible; ComicTable/1.0; +https://comictable.com)", Accept: "text/html" } });
      if (res.status >= 300 && res.status < 400 && res.headers.get("location")) { target = new URL(res.headers.get("location"), target); if (target.protocol !== "https:") return json(400, { error: "That link can't be read. Fill it in by hand." }); continue; }
      break;
    }
    if (!res || !res.ok) return json(400, { error: "That page didn't open (" + (res ? res.status : "no answer") + "). Fill it in by hand." });
    const reader = res.body.getReader(); let size = 0; const dec = new TextDecoder();
    for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length; html += dec.decode(value, { stream: true }); if (size > MAX) { reader.cancel(); break; } }
  } catch (e) { return json(400, { error: "That page took too long to open. Fill it in by hand." }); }
  return json(200, parseTicketPage(html, target.href));
};
