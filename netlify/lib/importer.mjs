// Pulls podcast episodes and YouTube videos into the database.
// Used by the hourly scheduled function and by the admin's "Import now" button.
import { XMLParser } from "fast-xml-parser";
import { importShows } from "./shows.mjs";

const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@", textNodeName: "#text", parseTagValue: false, trimValues: true });
const UA = { "User-Agent": "Mozilla/5.0 (compatible; ComicTable/1.0; +https://cockfightpodcast.com)" };

const arr = (x) => (x === undefined || x === null ? [] : Array.isArray(x) ? x : [x]);
const text = (x) => (x === undefined || x === null ? "" : typeof x === "object" ? String(x["#text"] ?? "") : String(x));

/* ---------------- helpers (exported for tests) ---------------- */

export function prettyDuration(raw) {
  const s = text(raw).trim();
  if (!s) return null;
  let secs;
  if (/^\d+$/.test(s)) secs = +s;
  else {
    const p = s.split(":").map(Number);
    if (p.some(isNaN)) return null;
    secs = p.reduce((a, b) => a * 60 + b, 0);
  }
  const h = Math.floor(secs / 3600), m = Math.round((secs % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}

export function isoDate(raw) {
  const d = new Date(text(raw));
  if (isNaN(d)) return null;
  return d.toISOString().slice(0, 10);
}

// "Marathon Chainsaw | E91" -> { num: 91, title: "Marathon Chainsaw" }
// "Lev vs. Cumtown | E84 Part 2" -> { num: 84, title: "Lev vs. Cumtown (Part 2)" }
export function splitTitle(raw, episodeTag) {
  let title = text(raw).trim();
  let num = episodeTag ? parseInt(text(episodeTag), 10) : NaN;
  const m = title.match(/\s*[|\-–—:]\s*(?:E|Ep\.?|Episode)\s*#?\s*(\d+)\s*(.*)$/i) || title.match(/^(?:E|Ep\.?|Episode)\s*#?\s*(\d+)\s*[|\-–—:]\s*(.*)$/i);
  if (m && /^(?:E|Ep|Episode)/i.test(title)) { if (isNaN(num)) num = +m[1]; title = m[2].trim(); }
  else if (m) {
    if (isNaN(num)) num = +m[1];
    const rest = m[2].trim();
    title = title.slice(0, m.index).trim() + (rest ? ` (${rest.replace(/^\((.*)\)$/, "$1")})` : "");
  }
  return { num: isNaN(num) ? null : num, title };
}

const stripHtml = (s) => text(s).replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ")
  .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"');

// Keep the real description; drop promo lines (Patreon, links, socials, ad notices).
export function cleanDescription(raw) {
  const lines = stripHtml(raw).split(/\n+/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  const junk = /(patreon|https?:\/\/|www\.|instagram|youtube|tiktok|twitter|linktr|adchoices|megaphone\.fm|privacy policy|learn more about your ad)/i;
  const keep = lines.filter((l) => !junk.test(l));
  const out = keep.join("\n").trim();
  return out.length >= 20 ? out : null;
}

export function patreonPart(title, description) {
  const t = text(title) + " " + stripHtml(description);
  if (!/patreon/i.test(t) && !/part\s*[12]/i.test(text(title))) return null;
  const m = stripHtml(description).match(/patreon[^.\n]*part\s*(\d)/i) || stripHtml(description).match(/part\s*(\d)[^.\n]*patreon/i);
  if (m) return m[1] === "1" ? "p1" : "p2";
  return null;
}

export function parsePodcastFeed(body) {
  const doc = xml.parse(body);
  const channel = doc?.rss?.channel;
  if (!channel) throw new Error("That link isn't a podcast feed.");
  return arr(channel.item).map((it) => {
    const { num, title } = splitTitle(it.title, it["itunes:episode"]);
    const guid = text(it.guid) || text(it.enclosure?.["@url"]) || text(it.title);
    return {
      guid,
      num,
      title,
      posted: isoDate(it.pubDate),
      length: prettyDuration(it["itunes:duration"]),
      audio_url: it.enclosure?.["@url"] || null,
      link: text(it.link) || null,
      image_url: it["itunes:image"]?.["@href"] || null,
      blurb: cleanDescription(it["content:encoded"] || it.description || it["itunes:summary"]),
      patreon: patreonPart(it.title, it.description || it["content:encoded"])
    };
  }).filter((e) => e.title && e.posted);
}

export function feedTitle(body) {
  const doc = xml.parse(body);
  return text(doc?.rss?.channel?.title) || text(doc?.feed?.author?.name) || text(doc?.feed?.title) || "";
}

export function parseYouTubeFeed(body) {
  const doc = xml.parse(body);
  return arr(doc?.feed?.entry).map((e) => {
    const id = text(e["yt:videoId"]);
    const group = e["media:group"] || {};
    return {
      youtube_id: id,
      title: text(e.title),
      published: isoDate(e.published),
      thumbnail_url: group["media:thumbnail"]?.["@url"] || (id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null),
      url: `https://www.youtube.com/watch?v=${id}`
    };
  }).filter((v) => v.youtube_id && v.title);
}

export function appleId(url) {
  const m = String(url).match(/podcasts\.apple\.com\/.*\/id(\d+)/) || String(url).match(/^id?(\d{6,})$/);
  return m ? m[1] : null;
}

/* ---------------- network ---------------- */

async function get(url, as = "text") {
  const r = await fetch(url, { headers: UA, redirect: "follow" });
  if (!r.ok) throw new Error(`${new URL(url).hostname} answered ${r.status}`);
  return as === "json" ? r.json() : r.text();
}

// Apple link -> its RSS feed plus each episode's Apple page (matched by guid)
async function resolvePodcast(url) {
  const id = appleId(url);
  if (!id) return { feedUrl: url, appleLinks: {} };
  const look = await get(`https://itunes.apple.com/lookup?id=${id}&entity=podcastEpisode&limit=300`, "json");
  const show = (look.results || []).find((r) => r.wrapperType === "track" && r.kind === "podcast") || (look.results || [])[0];
  if (!show?.feedUrl) throw new Error("Couldn't find this podcast's feed on Apple Podcasts.");
  const appleLinks = {};
  for (const r of look.results || []) if (r.episodeGuid && r.trackViewUrl) appleLinks[r.episodeGuid] = r.trackViewUrl.replace(/\?uo=\d+$/, "");
  return { feedUrl: show.feedUrl, appleLinks };
}

export async function youtubeChannelId(url) {
  const s = String(url).trim();
  let m = s.match(/(UC[\w-]{22})/);
  if (m) return m[1];
  const handle = (s.match(/youtube\.com\/(@[\w.\-]+)/) || s.match(/^(@[\w.\-]+)$/) || [])[1];
  const page = handle ? `https://www.youtube.com/${handle}` : s;
  const html = await get(page);
  m = html.match(/"channelId":"(UC[\w-]{22})"/) || html.match(/"externalId":"(UC[\w-]{22})"/) || html.match(/channel_id=(UC[\w-]{22})/);
  if (!m) throw new Error("Couldn't find that YouTube channel. Paste the channel's link, like youtube.com/@name.");
  return m[1];
}

/* ---------------- database writes ---------------- */

async function nameSource(db, src, name) {
  if (name && !src.label) { await db.from("sources").update({ label: name }).eq("id", src.id); src.label = name; }
}

async function importPodcast(db, src) {
  const { feedUrl, appleLinks } = await resolvePodcast(src.url);
  const body = await get(feedUrl);
  const items = parsePodcastFeed(body);
  const showName = feedTitle(body);
  await nameSource(db, src, showName);
  const { data: all, error } = await db.from("episodes").select("*").eq("site_id", src.site_id);
  if (error) throw error;
  // Episode numbers only line up within the same podcast; older rows from before multi-podcast support have no source.
  const mine = all.filter((e) => !e.source_id || e.source_id === src.id);
  const byGuid = new Map(all.filter((e) => e.guid).map((e) => [e.guid, e]));
  const byNum = new Map(mine.filter((e) => e.num !== null).map((e) => [e.num, e]));
  let maxNum = Math.max(0, ...mine.map((e) => e.num || 0));
  const now = new Date().toISOString();
  let added = 0, updated = 0;
  // oldest first, so new episodes without a number get the next number in order
  for (const it of [...items].reverse()) {
    const link = appleLinks[it.guid] || it.link || null;
    const match = byGuid.get(it.guid) || (it.num !== null ? byNum.get(it.num) : null);
    if (match) {
      // Only fill what's empty; anything typed in the admin wins.
      const patch = {};
      if (!match.guid) patch.guid = it.guid;
      if (!match.source_id) patch.source_id = src.id;
      if (!match.show_name && showName) patch.show_name = showName;
      if (!match.url && link) patch.url = link;
      if (!match.length && it.length) patch.length = it.length;
      if (!match.blurb && it.blurb) patch.blurb = it.blurb;
      if (!match.patreon && it.patreon) patch.patreon = it.patreon;
      if (!match.audio_url && it.audio_url) patch.audio_url = it.audio_url;
      if (!match.image_url && it.image_url) patch.image_url = it.image_url;
      if (Object.keys(patch).length) {
        const r = await db.from("episodes").update(patch).eq("id", match.id);
        if (r.error) throw r.error;
        Object.assign(match, patch);
        // only count it when something a fan would see got filled in
        if (Object.keys(patch).some((k) => !["guid", "source_id", "show_name"].includes(k))) updated++;
      }
      continue;
    }
    const num = it.num ?? ++maxNum;
    if (num > maxNum) maxNum = num;
    const row = { site_id: src.site_id, source_id: src.id, show_name: showName || null, num, title: it.title, posted: it.posted, length: it.length, url: link, patreon: it.patreon,
      blurb: it.blurb, guid: it.guid, audio_url: it.audio_url, image_url: it.image_url, imported_at: now };
    const r = await db.from("episodes").insert(row);
    if (r.error) throw r.error;
    byNum.set(num, row); byGuid.set(it.guid, row);
    added++;
  }
  return `${added} new, ${updated} filled in (${items.length} in feed)`;
}

async function importYouTube(db, src) {
  const channelId = await youtubeChannelId(src.url);
  const body = await get(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`);
  const vids = parseYouTubeFeed(body);
  const channel = feedTitle(body);
  await nameSource(db, src, channel);
  // A comic's own channel shows on every site they're on, so skip videos they already have anywhere.
  const mine = src.comic_id ? db.from("videos").select("youtube_id").or(`site_id.eq.${src.site_id},comic_id.eq.${src.comic_id}`) : db.from("videos").select("youtube_id").eq("site_id", src.site_id);
  const { data: existing, error } = await mine;
  if (error) throw error;
  const have = new Set(existing.map((v) => v.youtube_id));
  const fresh = vids.filter((v) => !have.has(v.youtube_id))
    .map((v) => ({ ...v, site_id: src.site_id, source_id: src.id, channel: channel || src.label || null, host: src.host || null, comic_id: src.comic_id || null, imported_at: new Date().toISOString() }));
  if (fresh.length) { const r = await db.from("videos").insert(fresh); if (r.error) throw r.error; }
  return `${fresh.length} new (${vids.length} latest checked)`;
}

export async function runSources(db, sources) {
  const results = [];
  for (const src of sources) {
    let status, ok = true;
    try { status = src.kind === "podcast" ? await importPodcast(db, src) : src.kind === "shows" ? await importShows(db, src) : await importYouTube(db, src); }
    catch (e) { ok = false; status = "Error: " + (e.message || String(e)); }
    await db.from("sources").update({ last_run_at: new Date().toISOString(), last_status: status }).eq("id", src.id);
    results.push({ id: src.id, kind: src.kind, label: src.label || src.url, ok, status });
  }
  return results;
}
