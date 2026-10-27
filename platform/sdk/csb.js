/*
 * ComicTable: public data kit.
 *
 * Any front end (theme) can load a comedian's content and run their forum and chat with this one file.
 * No build step and no dependencies. Live chat uses supabase-js if the page loads it, otherwise it polls.
 *
 *   <script src="config.js"></script>          // window.COCKFIGHT_CONFIG = { SITE_ID, SUPABASE_URL, SUPABASE_ANON_KEY }
 *   <script src="sdk/csb.js"></script>
 *   const site = await CSB.load();              // { site, profile, theme, features, community, people, shows, episodes, videos, merch, announcements, links, boards }
 *   CSB.forum.threads("general"), CSB.forum.newTopic({...}), CSB.chat.subscribe(fn), CSB.chat.send({...})
 *   CSB.fans.places("bos"), CSB.fans.join({ email, placeId, radius })   // fan list, when site.features.fans is on
 *
 * Every list comes back already filtered for the public: hidden items removed, past shows dropped,
 * announcements outside their start/end dates left out, and everything sorted the way the admin set it.
 */
(function (root) {
  "use strict";
  var cfg = {};
  function init(o) {
    o = o || root.CSB_CONFIG || root.COMICTABLE_CONFIG || root.COCKFIGHT_CONFIG || {};
    cfg = { url: String(o.SUPABASE_URL || o.url || "").replace(/\/$/, ""), key: o.SUPABASE_ANON_KEY || o.key || "", site: o.SITE_ID || o.site || "" };
    return CSB;
  }
  function ready() { if (!cfg.url) init(); if (!cfg.url || !cfg.key || !cfg.site) throw new Error("CSB isn't configured: SITE_ID, SUPABASE_URL and SUPABASE_ANON_KEY are needed."); }

  function friendly(msg, status) {
    if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return "Couldn't connect. Check your internet and try again.";
    if (/row-level security/i.test(msg)) return "That isn't allowed here.";
    if (/check constraint|violates check/i.test(msg)) return "That's too long or missing something.";
    return msg || ("Something went wrong (" + status + ").");
  }
  function api(path, opts) {
    ready();
    opts = opts || {};
    var headers = { apikey: cfg.key, Authorization: "Bearer " + cfg.key };
    if (opts.body) headers["Content-Type"] = "application/json";
    if (opts.prefer) headers.Prefer = opts.prefer;
    return fetch(cfg.url + "/rest/v1/" + path, { method: opts.method || "GET", headers: headers, body: opts.body ? JSON.stringify(opts.body) : undefined })
      .then(function (r) {
        return r.text().then(function (t) {
          var b = null; try { b = t ? JSON.parse(t) : null; } catch (e) {}
          if (!r.ok) { var err = new Error(friendly(b && (b.message || b.hint), r.status)); err.status = r.status; err.raw = b; throw err; }
          return b;
        });
      }, function (e) { throw new Error(friendly(e && e.message)); });
  }
  var site = function () { return "site_id=eq." + encodeURIComponent(cfg.site); };
  var optional = function (p) { return p.catch(function () { return []; }); };
  var visible = function (x) { return !x.hidden; };
  function todayISO() { var d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function timeKey(t) { var m = String(t || "").match(/(\d{1,2})(?::(\d{2}))?\s*([ap])?/i); if (!m) return "99:99"; var H = +m[1]; if ((m[3] || "").toLowerCase() === "p" && H < 12) H += 12; if ((m[3] || "").toLowerCase() === "a" && H === 12) H = 0; return String(H).padStart(2, "0") + ":" + (m[2] || "00"); }

  /* ---------------- content ---------------- */
  function load() {
    ready();
    return Promise.all([
      api("sites?select=id,name,domain,features,profile,theme,community&id=eq." + encodeURIComponent(cfg.site)),
      api("hosts?select=*&order=sort.asc&" + site()),
      api("shows?select=*&order=date.asc&date=gte." + todayISO() + "&" + site()),
      api("episodes?select=*&order=num.desc&hidden=is.false&" + site()),
      optional(api("videos?select=*&order=published.desc&hidden=is.false&limit=100&" + site())),
      optional(api("merch?select=*&order=sort.asc&hidden=is.false&" + site())),
      optional(api("announcements?select=*&order=sort.asc&" + site())),
      optional(api("links?select=*&order=sort.asc&hidden=is.false&" + site())),
      optional(api("boards?select=*&order=sort.asc&hidden=is.false&" + site()))
    ]).then(function (r) {
      var s = r[0][0] || { id: cfg.site, features: {}, profile: {}, theme: {}, community: {} };
      var today = todayISO();
      var people = r[1].filter(visible).map(function (h) {
        return { id: h.id, name: h.name, title: h.title || "", bio: h.bio || "", status: h.status || "", photo: h.photo_url || "",
          socials: { instagram: h.instagram || "", youtube: h.youtube || "", tiktok: h.tiktok || "", twitter: h.twitter || "", website: h.website || "" } };
      });
      var shows = r[2].filter(function (x) { return x.date >= today; }).map(function (x) {
        return { id: x.id, person: x.host, date: x.date, time: x.time || "", venue: x.venue || "", city: x.city || "", venueId: x.venue_id || null,
          tickets: x.url || "", status: x.status || "on_sale", note: x.note || "" };
      }).sort(function (a, b) { return (a.date + timeKey(a.time)).localeCompare(b.date + timeKey(b.time)); });
      var announcements = r[6].filter(function (a) { return (!a.starts_on || a.starts_on <= today) && (!a.ends_on || a.ends_on >= today); })
        .sort(function (a, b) { return (b.pinned - a.pinned) || (a.sort - b.sort); })
        .map(function (a) { return { id: a.id, text: a.text, link: a.link || "", linkLabel: a.link_label || "", pinned: !!a.pinned }; });
      return {
        site: { id: s.id, name: s.name, domain: s.domain },
        features: s.features || {}, profile: s.profile || {}, theme: s.theme || {}, community: s.community || {},
        people: people, shows: shows,
        episodes: r[3].filter(visible).map(function (e) { return { id: e.id, number: e.num, title: e.title, posted: e.posted, length: e.length || "", link: e.url || e.audio_url || "", audio: e.audio_url || "", image: e.image_url || "", patreon: e.patreon || "", description: e.blurb || "", show: e.show_name || "" }; }),
        videos: r[4].filter(visible).sort(function (a, b) { return (b.featured - a.featured) || String(b.published || "").localeCompare(String(a.published || "")); })
          .map(function (v) { return { id: v.youtube_id, title: v.title, published: v.published, thumbnail: v.thumbnail_url || ("https://i.ytimg.com/vi/" + v.youtube_id + "/hqdefault.jpg"), link: v.url || ("https://www.youtube.com/watch?v=" + v.youtube_id), featured: !!v.featured, channel: v.channel || "", person: v.host || "" }; }),
        merch: r[5].filter(visible).map(function (m) { return { id: m.id, name: m.name, price: m.price || "", image: m.image_url || "", link: m.url || "" }; }),
        announcements: announcements,
        links: r[7].filter(visible).map(function (l) { return { id: l.id, label: l.label, url: l.url, icon: l.icon || "" }; }),
        boards: r[8].filter(visible).map(function (b) { return { id: b.id, name: b.name, description: b.description || "", locked: !!b.locked }; })
      };
    });
  }

  /* ---------------- visitor identity (anonymous) ---------------- */
  function device() {
    var k = "csb_device";
    try { var v = localStorage.getItem(k); if (!v) { v = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now()); localStorage.setItem(k, v); } return v; }
    catch (e) { return (root.__csbDevice = root.__csbDevice || String(Math.random()).slice(2) + Date.now()); }
  }
  var name = {
    get: function () { try { return localStorage.getItem("csb_name") || localStorage.getItem("cf_handle") || ""; } catch (e) { return ""; } },
    set: function (v) { try { localStorage.setItem("csb_name", v); } catch (e) {} }
  };

  /* ---------------- forum ---------------- */
  var forum = {
    boards: function () { return api("boards?select=*&order=sort.asc&hidden=is.false&" + site()); },
    threads: function (board) {
      return api("threads?select=*&order=pinned.desc,last_at.desc&limit=300&" + site() + (board ? "&board=eq." + encodeURIComponent(board) : ""))
        .then(function (rows) { return rows.map(function (t) { return { id: t.id, board: t.board, title: t.title, author: t.author, createdAt: Number(t.created_at), lastAt: Number(t.last_at), lastBy: t.last_by || t.author, replies: t.replies || 0, pinned: !!t.pinned, locked: !!t.locked, isMod: !!t.is_mod }; }); });
    },
    posts: function (threadId) {
      return api("posts?select=*&order=created_at.asc&limit=500&thread_id=eq." + encodeURIComponent(threadId))
        .then(function (rows) { return rows.map(function (p) { return { id: p.id, author: p.author, body: p.body, createdAt: Number(p.created_at), isMod: !!p.is_mod, edited: !!p.edited_at }; }); });
    },
    newTopic: function (o) {
      var now = Date.now(), dev = device();
      return api("threads", { method: "POST", prefer: "return=representation", body: { site_id: cfg.site, board: o.board, title: o.title, author: o.author, created_at: now, last_at: now, last_by: o.author, replies: 0, device: dev } })
        .then(function (rows) { var id = rows[0].id; return api("posts", { method: "POST", body: { site_id: cfg.site, thread_id: id, author: o.author, body: o.body, created_at: now, device: dev } }).then(function () { return id; }); });
    },
    reply: function (o) { return api("posts", { method: "POST", body: { site_id: cfg.site, thread_id: o.threadId, author: o.author, body: o.body, created_at: Date.now(), device: device() } }); }
  };

  /* ---------------- chat ---------------- */
  function msg(m) { return { id: m.id, author: m.author, body: m.body, at: m.created_at, isMod: !!m.is_mod, deleted: !!m.deleted }; }
  var chat = {
    recent: function (limit) {
      return api("chat_messages?select=*&deleted=is.false&order=created_at.desc&limit=" + (limit || 80) + "&" + site()).then(function (rows) { return rows.reverse().map(msg); });
    },
    send: function (o) { return api("chat_messages", { method: "POST", body: { site_id: cfg.site, author: o.author, body: o.body, device: device() } }); },
    // onMessages(list) gets the full current list each time something changes. Returns a stop() function.
    subscribe: function (onMessages, onError) {
      var list = [], stopped = false, timer = null, channel = null, since = null;
      function emit() { if (!stopped) onMessages(list.filter(function (m) { return !m.deleted; })); }
      function refresh() {
        return chat.recent(80).then(function (rows) { list = rows; since = rows.length ? rows[rows.length - 1].at : since; emit(); }, function (e) { onError && onError(e); });
      }
      refresh();
      var sbLib = root.supabase && root.supabase.createClient;
      if (sbLib) {
        try {
          var client = root.__csbClient || (root.__csbClient = root.supabase.createClient(cfg.url, cfg.key, { auth: { persistSession: false } }));
          channel = client.channel("chat-" + cfg.site)
            .on("postgres_changes", { event: "*", schema: "public", table: "chat_messages", filter: "site_id=eq." + cfg.site }, function (p) {
              var m = p.new && p.new.id ? msg(p.new) : null;
              if (p.eventType === "INSERT" && m && !list.some(function (x) { return x.id === m.id; })) { list.push(m); if (list.length > 200) list.shift(); }
              else if (p.eventType === "UPDATE" && m) list = list.map(function (x) { return x.id === m.id ? m : x; });
              else if (p.eventType === "DELETE" && p.old) list = list.filter(function (x) { return x.id !== p.old.id; });
              emit();
            })
            .subscribe(function (status) { if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") startPolling(); });
        } catch (e) { startPolling(); }
        // a slow safety net in case the live connection drops quietly
        timer = setInterval(refresh, 30000);
      } else startPolling();
      function startPolling() { if (timer) clearInterval(timer); timer = setInterval(refresh, 4000); }
      return { refresh: refresh, stop: function () { stopped = true; if (timer) clearInterval(timer); if (channel) try { channel.unsubscribe(); } catch (e) {} } };
    }
  };

  /* ---------------- fan list ---------------- */
  // A sign-up box needs two calls: fans.places("bos") while they type their city, then fans.join(...).
  var fans = {
    // Towns and cities matching what they've typed, biggest first: [{ id, label }]
    places: function (q, limit) {
      q = String(q || "").trim().replace(/[%*,()]/g, "");
      if (q.length < 2) return Promise.resolve([]);
      return api("places?select=id,name,state,country,population&name=ilike." + encodeURIComponent(q + "*") + "&order=population.desc&limit=" + (limit || 8))
        .then(function (rows) { return rows.map(function (p) { return { id: p.id, name: p.name, label: p.name + (p.state ? ", " + p.state : "") + (p.country !== "US" ? " (" + p.country + ")" : "") }; }); });
    },
    // { email, placeId, radius: 25 | 50 | 100 | 250 } → "joined" or "updated"
    join: function (o) {
      return api("rpc/join_fans", { method: "POST", body: { p_site: cfg.site, p_email: o.email, p_place: o.placeId, p_radius: o.radius || 50 } });
    },
    // For a "stop emailing me" link: ?leave=<token>
    leave: function (token) { return api("rpc/leave_fans", { method: "POST", body: { p_token: token } }); }
  };

  var CSB = { init: init, load: load, forum: forum, chat: chat, fans: fans, device: device, name: name, api: api, version: "1.1" };
  root.CSB = CSB;
})(typeof window !== "undefined" ? window : globalThis);
