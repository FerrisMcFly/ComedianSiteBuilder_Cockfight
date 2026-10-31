  /* ============ DOM helper ============ */
  function h(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === "class") e.className = v;
      else if (k === "text") e.textContent = v;
      else if (k === "value") e.value = v;
      else if (k === "checked") e.checked = !!v;
      else if (k === "selected") e.selected = !!v;
      else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? "" : v);
    }
    for (const c of kids.flat(Infinity)) if (c !== null && c !== undefined && c !== false) e.append(c.nodeType ? c : String(c));
    return e;
  }
  const field = (label, input, cls) => h("label", { class: "field " + (cls || "") }, h("span", { text: label }), input);
  const store = { get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} } };

  /* ============ feedback ============ */
  let toastTimer;
  function toast(msg, opts = {}) {
    const t = $("toast"); t.textContent = ""; t.className = "toast" + (opts.bad ? " bad" : "");
    t.append(h("span", { text: msg }));
    if (opts.action) t.append(h("button", { type: "button", text: opts.action.label, onclick: () => { t.hidden = true; opts.action.run(); } }));
    t.hidden = false; clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, opts.action ? 7000 : 3200);
  }
  function errText(e) {
    const m = (e && (e.message || e.error_description)) || String(e);
    if (/row-level security|permission denied|42501/i.test(m)) return "Not allowed. Your login isn't an admin of this site, or a database setup step was skipped.";
    if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return "Couldn't reach the database. Check your connection and try again.";
    if (/duplicate key|23505/i.test(m)) return "That already exists.";
    return m;
  }
  function confetti() {
    if (matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const c = $("confetti"), ctx = c.getContext && c.getContext("2d"); if (!ctx) return;
    c.hidden = false; c.width = innerWidth; c.height = innerHeight;
    const colors = ["#d6302a", "#ffb627", "#2a7d2e", "#00a6a6", "#ff4fd8"];
    const bits = Array.from({ length: 90 }, () => ({ x: innerWidth / 2 + (Math.random() - .5) * 160, y: innerHeight * .65, vx: (Math.random() - .5) * 11, vy: -Math.random() * 13 - 6, r: Math.random() * 6 + 3, c: colors[Math.floor(Math.random() * colors.length)], a: Math.random() * 6 }));
    let f = 0;
    (function tick() {
      ctx.clearRect(0, 0, c.width, c.height);
      for (const b of bits) { b.x += b.vx; b.y += b.vy; b.vy += .45; b.a += .2; ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.a); ctx.fillStyle = b.c; ctx.fillRect(-b.r / 2, -b.r / 2, b.r, b.r * .6); ctx.restore(); }
      if (++f < 90) requestAnimationFrame(tick); else { ctx.clearRect(0, 0, c.width, c.height); c.hidden = true; }
    })();
  }

  /* ============ dates & times ============ */
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const MONTH_FULL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const pad = (n) => String(n).padStart(2, "0");
  const iso = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  const today = () => iso(new Date());
  const parseISO = (s) => { const [y, m, d] = String(s).split("-").map(Number); return new Date(y, m - 1, d); };
  const niceDate = (s) => { if (!s) return ""; const d = parseISO(s); return DOW[d.getDay()] + " " + MON[d.getMonth()] + " " + d.getDate() + ", " + d.getFullYear(); };
  const shortDate = (s) => { const d = parseISO(s); return DOW[d.getDay()] + " " + MON[d.getMonth()] + " " + d.getDate(); };
  const monthLabel = (s) => { const d = parseISO(s); return MONTH_FULL[d.getMonth()] + " " + d.getFullYear(); };
  function to12(t) { if (!t) return null; const [H, M] = t.split(":").map(Number); if (isNaN(H)) return t; return ((H % 12) || 12) + ":" + pad(M || 0) + " " + (H >= 12 ? "PM" : "AM"); }
  function to24(t) {
    if (!t) return ""; const m = String(t).match(/(\d{1,2})(?::(\d{2}))?\s*([ap])?/i); if (!m) return "";
    let H = +m[1]; const M = +(m[2] || 0), ap = (m[3] || "").toLowerCase();
    if (ap === "p" && H < 12) H += 12; if (ap === "a" && H === 12) H = 0;
    if (!ap && H >= 1 && H <= 11) H += 12; // comedy shows are evenings unless it says AM
    return pad(H) + ":" + pad(M);
  }
  const DEFAULT_TIMES = { 0: ["19:00"], 1: ["20:00"], 2: ["20:00"], 3: ["20:00"], 4: ["19:30"], 5: ["19:00", "21:30"], 6: ["19:00", "21:30"] };

  // Pull dates + times out of pasted text like "Fri Nov 6  7:00 PM, 9:30 PM" or "11/6 7pm & 9:30pm".
  function parseShowtimes(textIn) {
    const now = new Date(); now.setHours(0, 0, 0, 0);
    const monIdx = (s) => MONTH_FULL.findIndex((m) => m.toLowerCase().startsWith(s.toLowerCase().slice(0, 3)));
    const dateRe = /\b(?:(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?,?\s+)?(?:(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?|(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?)/gi;
    const timeRe = /\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?|am|pm|a|p)\b|\b(\d{1,2}):(\d{2})\b/gi;
    const out = new Map(); let cur = null;
    const lines = String(textIn).split(/\n+/);
    for (const line of lines) {
      let rest = line, m; dateRe.lastIndex = 0;
      const found = [];
      while ((m = dateRe.exec(line))) found.push(m);
      if (found.length) {
        // each date takes the times written after it, up to the next date
        found.forEach((fm, i) => {
          let mo, da, yr;
          if (fm[1]) { mo = monIdx(fm[1]); da = +fm[2]; yr = fm[3] ? +fm[3] : null; } else { mo = +fm[4] - 1; da = +fm[5]; yr = fm[6] ? (+fm[6] < 100 ? 2000 + +fm[6] : +fm[6]) : null; }
          if (mo < 0 || mo > 11 || da < 1 || da > 31) return;
          let d = new Date(yr || now.getFullYear(), mo, da);
          if (!yr && d < new Date(now.getFullYear(), now.getMonth() - 1, now.getDate())) d = new Date(now.getFullYear() + 1, mo, da);
          cur = iso(d); if (!out.has(cur)) out.set(cur, []);
          const seg = line.slice(fm.index + fm[0].length, found[i + 1] ? found[i + 1].index : undefined);
          addTimes(seg, cur);
        });
      } else if (cur) addTimes(rest, cur);
    }
    function addTimes(seg, day) {
      let t; timeRe.lastIndex = 0;
      while ((t = timeRe.exec(seg))) {
        const hh = +(t[1] || t[4]), mm = +(t[2] || t[5] || 0), ap = (t[3] || "").replace(/\./g, "").toLowerCase();
        if (hh > 12 && !ap) { out.get(day).push(pad(hh) + ":" + pad(mm)); continue; }
        if (hh < 1 || hh > 12) continue;
        const v = to24(hh + ":" + pad(mm) + (ap ? " " + ap[0] : ""));
        if (v && !out.get(day).includes(v)) out.get(day).push(v);
      }
    }
    return [...out.entries()].map(([date, times]) => ({ date, times: times.sort() })).sort((a, b) => a.date.localeCompare(b.date));
  }
  window.__parseShowtimes = parseShowtimes; // handy for checking in the console

  /* ============ connection ============ */
  if (!CFG.SUPABASE_URL || !CFG.SUPABASE_ANON_KEY || !window.supabase) {
    root.replaceChildren(h("div", { class: "login-wrap" }, h("div", { class: "card login" }, h("h1", { text: "Not connected" }), h("p", { class: "sub", text: "This page is missing its database connection details." }))));
    return;
  }
  const sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
  const S = { site: null, sites: [], hosts: [], shows: [], episodes: [], videos: [], merch: [], venues: [], sources: [], settings: {}, slotCache: {}, isPlatform: false, user: "", token: "" };
  const F = (k) => !!(S.site && S.site.features && S.site.features[k]);
  // A show with no single comic is a show event by the whole site (a live podcast, say).
  const EVENT = "*whole-show*";
  const hostName = (id) => !id || id === EVENT ? "The whole show" : (S.hosts.find((x) => x.id === id) || {}).name || id;
  const first = (id) => !id || id === EVENT ? "Whole show" : hostName(id).split(" ")[0];
  const siteName = (id) => (S.sites.find((x) => x.id === id) || {}).name || "another site";
  const venueById = (id) => S.venues.find((v) => v.id === id);
  const venueCity = (v) => (v.state ? v.city + ", " + v.state : v.city);
  async function q(p) { const r = await p; if (r.error) throw r.error; return r.data; }
  const sid = () => (S.site ? S.site.id : null);
  // Usernames become user@<site's domain>; anyone can also log in with a full email.
  // A plain username logs in as username@comictable.com; anything with an @ is used as typed.
  const LOGIN_DOMAINS = [CFG.LOGIN_DOMAIN || "comictable.com"];
  const loginDom = () => LOGIN_DOMAINS[0];

  // Every date and video of every comic on this site, wherever it was added. Falls back to this site's own rows
  // until the database has 11_comics.sql.
  async function loadShows(site) {
    const r = await sb.rpc("site_shows", { p_site: site, p_all: true });
    if (!r.error && Array.isArray(r.data)) return r.data;
    return q(sb.from("shows").select("*").eq("site_id", site).order("date", { ascending: true }));
  }
  async function loadVideos(site) {
    const r = await sb.rpc("site_videos", { p_site: site, p_all: true });
    if (!r.error && Array.isArray(r.data)) return r.data.map((v) => ({ ...v, hidden: !!v.hidden_here }));
    return q(sb.from("videos").select("*").eq("site_id", site).order("published", { ascending: false }));
  }
  // This site's feeds and channels, plus the channels its comics connected on their other sites.
  async function loadSources(site) {
    const own = await q(sb.from("sources").select("*").eq("site_id", site));
    const comics = [...new Set((await q(sb.from("hosts").select("comic_id").eq("site_id", site))).map((x) => x.comic_id).filter(Boolean))];
    if (!comics.length) return own;
    const r = await sb.from("sources").select("*").in("comic_id", comics).neq("site_id", site);
    return own.concat(r.error ? [] : r.data || []);
  }
  const hostComic = (id) => (S.hosts.find((x) => x.id === id) || {}).comic_id || null;
  const crew = () => S.hosts.filter((x) => !x.hidden && x.comic_id).map((x) => x.comic_id);

  // Which people on this site have their own login (comics.user_id)
  async function loadLogins() {
    S.logins = {}; S.coasters = {};
    const ids = S.hosts.map((x) => x.comic_id).filter(Boolean);
    if (!ids.length) return;
    S.coasters = {};  // each person's Coaster (comics row), for their card on Lineup
    try { (await q(sb.from("comics").select("*").in("id", ids))).forEach((c) => { S.logins[c.id] = c.user_id || null; S.coasters[c.id] = c; }); } catch (e) {}
  }

  async function loadAll() {
    const site = sid();
    const [hosts, shows, episodes, videos, merch, venues, sources] = await Promise.all([
      q(sb.from("hosts").select("*").eq("site_id", site).order("sort", { ascending: true })),
      loadShows(site),
      q(sb.from("episodes").select("*").eq("site_id", site).order("num", { ascending: false })),
      loadVideos(site),
      q(sb.from("merch").select("*").eq("site_id", site).order("sort", { ascending: true })),
      q(sb.from("venues").select("*").order("name", { ascending: true })),
      loadSources(site)
    ]);
    Object.assign(S, { hosts, shows, episodes, videos, merch, venues, sources });
    await loadLogins();
  }
  const reload = {
    shows: async () => { S.shows = await loadShows(sid()); },
    episodes: async () => { S.episodes = await q(sb.from("episodes").select("*").eq("site_id", sid()).order("num", { ascending: false })); },
    videos: async () => { S.videos = await loadVideos(sid()); },
    merch: async () => { S.merch = await q(sb.from("merch").select("*").eq("site_id", sid()).order("sort", { ascending: true })); },
    venues: async () => { S.venues = await q(sb.from("venues").select("*").order("name", { ascending: true })); },
    sources: async () => { S.sources = await loadSources(sid()); },
    hosts: async () => { S.hosts = await q(sb.from("hosts").select("*").eq("site_id", sid()).order("sort", { ascending: true })); await loadLogins(); }
  };

  /* ============ addresses ============ */
  // On comictable.com the login lives at /login and the app at /dashboard (both are this same page).
  function setPath(which) {
    if (!CFG.PLATFORM || !history.replaceState) return;
    const p = which === "login" ? "/login" : "/dashboard";
    if (location.pathname !== p) history.replaceState(null, "", p + (which === "login" ? "" : location.hash));
  }

