/*
 * ComicTable: public data kit.
 *
 * Any front end (theme) can load a comedian's content and run their forum and chat with this one file.
 * No build step and no dependencies. Live chat uses supabase-js if the page loads it, otherwise it polls.
 *
 *   <script src="config.js"></script>          // window.COMICTABLE_CONFIG = { SITE_ID, SUPABASE_URL, SUPABASE_ANON_KEY }
 *   <script src="sdk/csb.js"></script>
 *   const site = await CSB.load();              // { site, profile, theme, features, community, options, live, people, shows, episodes, videos, shorts, merch, news, links, boards, posts }
 *   people: the lineup, read from each comic's Coaster (name, title, bio, photo, socials, handle), with the site's own
 *   title, bio or photo only where the site changed it. solo: one comic on the site; then profile.about is their Coaster bio.
 *   options: the options every site has (Design → Options); live: { url, title, embed } while the site is live, else null
 *   CSB.listenLinks(episode, site) → [{ label, url }] the way the site chose; CSB.socialLinks(person, site.options) → logos
 *   Podcasts the comic switched off in Settings → "Podcasts on your site" (profile.podcasts_off, by name) are left out
 *   of episodes and of CSB.elsewhere, so every design follows the same choice.
 *   CSB.elsewhere(people) → the other live ComicTable sites these people are on (a podcast they co-host, say),
 *   each with its latest episode when it's a podcast: [{ id, name, domain, url, podcast, people, episode }]
 *   news: the comic's News for the home screen, in order (the first is the featured one). Each has a style: "card"
 *   (a big card), "banner" (a scrolling banner) or "strip" (a small strip); a design that doesn't do a style shows it
 *   as a card. Items show between their start and end dates. One made from a show carries that show's status and
 *   drops off once the show has passed. image is its picture; video is a player address (YouTube or Vimeo) when it
 *   links to one, so a site can play it right on the home screen.
 *   picks and announcements are older names, kept so older designs keep working: picks is the same as news;
 *   announcements is the banners in news.
 *   shows: each has person (a solo date) or event: true with lineup (a show by the whole site, like a live podcast).
 *   CSB.forum.threads("general"), CSB.forum.newTopic({...}), CSB.chat.subscribe(fn), CSB.chat.send({...})
 *   CSB.press(person.comic) → { name, short, long, credits[], booking, photos[{ url (full size), web, credit, primary }], link }
 *   CSB.fans.places("bos"), CSB.fans.join({ email, placeId, radius })   // fan list, when site.features.fans is on
 *   CSB.blog.list(), CSB.blog.get(slug) → { title, date, cover, excerpt, html }   // blog, when site.features.blog is on
 *
 * Every list comes back already filtered for the public: hidden items removed, past shows dropped,
 * announcements outside their start/end dates left out, and everything sorted the way the admin set it.
 */
(function (root) {
  "use strict";
  var cfg = {};
  function init(o) {
    o = o || root.CSB_CONFIG || root.COMICTABLE_CONFIG || {};
    cfg = { url: String(o.SUPABASE_URL || o.url || "").replace(/\/$/, ""), key: o.SUPABASE_ANON_KEY || o.key || "", site: o.SITE_ID || o.site || "" };
    return CSB;
  }
  // SUPABASE_URL and SUPABASE_ANON_KEY are always needed; SITE_ID for anything about one site (not a Coaster's own list).
  function ready() { if (!cfg.url) init(); if (!cfg.url || !cfg.key) throw new Error("CSB isn't configured: SITE_ID, SUPABASE_URL and SUPABASE_ANON_KEY are needed."); }

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
  var site = function () { if (!cfg.site) throw new Error("CSB isn't configured: SITE_ID, SUPABASE_URL and SUPABASE_ANON_KEY are needed."); return "site_id=eq." + encodeURIComponent(cfg.site); };
  var optional = function (p) { return p.catch(function () { return []; }); };
  var visible = function (x) { return !x.hidden; };
  function todayISO() { var d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function timeKey(t) { var m = String(t || "").match(/(\d{1,2})(?::(\d{2}))?\s*([ap])?/i); if (!m) return "99:99"; var H = +m[1]; if ((m[3] || "").toLowerCase() === "p" && H < 12) H += 12; if ((m[3] || "").toLowerCase() === "a" && H === 12) H = 0; return String(H).padStart(2, "0") + ":" + (m[2] || "00"); }

  /* ---------------- content ---------------- */
  function load() {
    ready(); site();
    return Promise.all([
      api("sites?select=id,name,domain,features,profile,theme,community&id=eq." + encodeURIComponent(cfg.site)),
      // The lineup, with each comic's Coaster: a site shows what's on the Coaster, except anything the site
      // chose to change just for itself (own title, bio or photo). Older databases: the site's own copy.
      api("hosts?select=*,coaster:comics(*)&order=sort.asc&" + site()).catch(function () { return api("hosts?select=*&order=sort.asc&" + site()); }),
      // site_shows / site_videos include the dates and channels of every comic on this site, even ones added on their other sites.
      // Before that database upgrade, fall back to this site's own rows.
      api("rpc/site_shows", { method: "POST", body: { p_site: cfg.site } }).catch(function () { return api("shows?select=*&order=date.asc&date=gte." + todayISO() + "&" + site()); }),
      api("episodes?select=*&order=num.desc&hidden=is.false&" + site()),
      optional(api("rpc/site_videos", { method: "POST", body: { p_site: cfg.site } }).catch(function () { return api("videos?select=*&order=published.desc&hidden=is.false&limit=100&" + site()); })),
      optional(api("merch?select=*&order=sort.asc&hidden=is.false&" + site())),
      optional(api("announcements?select=*&order=sort.asc&" + site())),
      optional(api("links?select=*&order=sort.asc&hidden=is.false&" + site())),
      optional(api("boards?select=*&order=sort.asc&hidden=is.false&" + site())),
      optional(api("blog_posts?select=id,slug,title,excerpt,cover_url,published_at&published=is.true&order=published_at.desc&limit=50&" + site())),
      optional(api("home_picks?select=*&order=sort.asc&hidden=is.false&" + site()))
    ]).then(function (r) {
      var s = r[0][0] || { id: cfg.site, features: {}, profile: {}, theme: {}, community: {} };
      podcastsOff = offList(s.profile);
      var today = todayISO();
      var people = r[1].filter(visible).map(personOf);
      var shows = r[2].filter(function (x) { return x.date >= today; }).map(function (x) {
        // person: whose solo date it is. event: a show by the whole site (a live podcast), with lineup = people ids.
        return { id: x.id, person: x.host || "", event: !!x.event, lineup: x.lineup_hosts || [], date: x.date, time: x.time || "", venue: x.venue || "", city: x.city || "", venueId: x.venue_id || null,
          tickets: x.url || "", status: x.status || "on_sale", note: x.note || "" };
      }).sort(function (a, b) { return (a.date + timeKey(a.time)).localeCompare(b.date + timeKey(b.time)); });
      shows = dedupeShows(shows);
      // News (home_picks) took over from announcements: banners in News are what designs used to read as
      // announcements. Old announcements that haven't moved into News yet (database not upgraded) still show.
      var news = homePicks(r[10], shows, today);
      var moved = {}; r[10].forEach(function (p) { if (p.from_announcement) moved[p.from_announcement] = true; });
      var announcements = news.filter(function (p) { return p.style === "banner"; })
        .map(function (p, i) { return { id: p.id, text: p.headline + (p.text ? " " + p.text : ""), link: p.link, linkLabel: p.button, pinned: i === 0 }; })
        .concat(r[6].filter(function (a) { return !moved[a.id] && (!a.starts_on || a.starts_on <= today) && (!a.ends_on || a.ends_on >= today); })
          .sort(function (a, b) { return (b.pinned - a.pinned) || (a.sort - b.sort); })
          .map(function (a) { return { id: a.id, text: a.text, link: a.link || "", linkLabel: a.link_label || "", pinned: !!a.pinned }; }));
      // Each site decides what it shows (founder, Oct 29): a one-comic site shows that comic's channel; a group site
      // shows only its own unless it switches the comics' channels on (Design → Options → Videos).
      var lv = siteOptions(s.theme).lineup_videos, lineupVideos = lv === "on" || (lv !== "off" && people.length === 1);
      var data = {
        site: { id: s.id, name: s.name, domain: s.domain },
        features: s.features || {}, profile: s.profile || {}, theme: s.theme || {}, community: s.community || {},
        people: people, shows: shows,
        episodes: r[3].filter(visible).filter(function (e) { return !podOff(e.show_name); }).map(function (e) { return { id: e.id, number: e.num, title: e.title, posted: e.posted, length: e.length || "", link: e.url || e.audio_url || "", audio: e.audio_url || "", image: e.image_url || "", patreon: e.patreon || "", description: e.blurb || "", show: e.show_name || "", apple: /podcasts\.apple\.com/.test(e.url || "") ? e.url : "", spotify: e.spotify_url || "" }; }),
        videos: r[4].filter(visible).filter(function (v) { return !v.comic_id || v.site_id === cfg.site || lineupVideos; }).sort(function (a, b) { return (b.featured - a.featured) || String(b.published || "").localeCompare(String(a.published || "")); })
          .map(function (v) { return { id: v.youtube_id, title: v.title, published: v.published, thumbnail: v.thumbnail_url || ("https://i.ytimg.com/vi/" + v.youtube_id + "/hqdefault.jpg"), link: v.url || ("https://www.youtube.com/watch?v=" + v.youtube_id), featured: !!v.featured, short: !!v.is_short, channel: v.channel || "", person: v.host || "" }; }),
        merch: r[5].filter(visible).map(function (m) { return { id: m.id, name: m.name, price: m.price || "", image: m.image_url || "", link: m.url || "" }; }),
        announcements: announcements,
        links: r[7].filter(visible).map(function (l) { return { id: l.id, label: l.label, url: l.url, icon: l.icon || "" }; }),
        boards: r[8].filter(visible).map(function (b) { return { id: b.id, name: b.name, description: b.description || "", locked: !!b.locked }; }),
        posts: r[9].map(post),
        options: siteOptions(s.theme),
        live: liveNow(s.live),
        news: news,
        picks: news
      };
      // One bio (founder, Oct 29): a solo comic's site uses their Coaster bio as its About; a group site keeps its own.
      data.solo = people.length === 1;
      if (data.solo && people[0].bio) data.profile = Object.assign({}, data.profile, { about: people[0].bio });
      // YouTube Shorts on their own, newest first (they stay in videos too, marked short: true)
      data.shorts = data.videos.filter(function (v) { return v.short; }).sort(function (a, b) { return String(b.published || "").localeCompare(String(a.published || "")); });
      return data;
    });
  }

  // One person on a site's lineup: their Coaster (the comic), with this site's own title, bio or photo where it set one.
  function personOf(h) {
    var c = h.coaster && typeof h.coaster === "object" ? h.coaster : null;
    if (!c) return { id: h.id, comic: h.comic_id || "", name: h.name, title: h.title || "", bio: h.bio || "", status: h.status || "", photo: h.photo_url || "", socials: socialsOf(h), handle: "" };
    return { id: h.id, comic: c.id, handle: c.handle || c.id, name: c.name || h.name,
      title: (h.own_title ? h.title : c.title) || "", bio: (h.own_bio ? h.bio : c.bio) || "", status: c.status || "",
      photo: (h.own_photo && h.photo_url ? h.photo_url : c.photo_url) || "", socials: socialsOf(c) };
  }
  // A comic's press kit: approved photos (primary first) and bios, for clubs. Pass a person's comic id (person.comic).
  function press(comicId) {
    ready();
    var id = encodeURIComponent(String(comicId || ""));
    return Promise.all([
      api("comics?select=id,name,title,bio,photo_url,short_bio,long_bio,credits,booking_contact,instagram,youtube,tiktok,twitter,website&id=eq." + id),
      optional(api("press_photos?select=*&order=is_primary.desc,sort.asc,created_at.asc&comic_id=eq." + id))
    ]).then(function (r) {
      var c = r[0][0];
      if (!c) return null;
      return { id: c.id, name: c.name, title: c.title || "",
        short: c.short_bio || "", long: c.long_bio || c.bio || "",
        credits: String(c.credits || "").split(/\n+/).map(function (x) { return x.trim(); }).filter(Boolean),
        booking: c.booking_contact || "",
        socials: { instagram: c.instagram || "", youtube: c.youtube || "", tiktok: c.tiktok || "", twitter: c.twitter || "", website: c.website || "" },
        photos: r[1].map(function (p) { return { url: p.url, web: p.web_url || p.url, credit: p.credit || "", orientation: p.orientation || "", primary: !!p.is_primary, width: p.width || null, height: p.height || null }; })
          .concat(!r[1].length && c.photo_url ? [{ url: c.photo_url, web: c.photo_url, credit: "", orientation: "", primary: true }] : []),
        link: "https://comictable.com/press/" + encodeURIComponent(c.id) };
    });
  }

  // A YouTube or Vimeo link → the address of a player that can sit right in the page ("" for anything else).
  function videoEmbed(link) {
    var u = String(link || ""), m = u.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{11})/);
    if (m) return "https://www.youtube-nocookie.com/embed/" + m[1] + "?autoplay=1&rel=0";
    m = u.match(/vimeo\.com\/(?:video\/)?(\d{6,12})/);
    return m ? "https://player.vimeo.com/video/" + m[1] + "?autoplay=1" : "";
  }

  // Home screen picks: drop ended ones and ones whose show has passed; a show pick shows that show's status.
  function homePicks(rows, shows, today) {
    var byId = {}; shows.forEach(function (s) { byId[s.id] = s; });
    return rows.filter(function (p) { return !p.hidden && (!p.starts_on || p.starts_on <= today) && (!p.ends_on || p.ends_on >= today) && (!p.show_id || byId[p.show_id]); })
      .map(function (p) {
        var s = p.show_id ? byId[p.show_id] : null;
        return { id: p.id, kind: p.kind || "announcement", style: p.style || "card", headline: p.headline, text: p.body || "", button: p.button_label || "", link: p.link || (s && s.tickets) || "",
          image: p.image_url || "", video: videoEmbed(p.link), show: s ? { date: s.date, time: s.time, venue: s.venue, city: s.city, status: s.status } : null };
      });
  }

  var podcastsOff = [];
  function offList(profile) { return ((profile || {}).podcasts_off || []).map(function (x) { return String(x).trim().toLowerCase(); }); }
  function podOff(name) { return !!name && podcastsOff.indexOf(String(name).trim().toLowerCase()) >= 0; }
  // Other live ComicTable sites the same comics are on. Optional: any failure just means "none".
  function elsewhere(people) {
    var ids = (people || []).map(function (p) { return p.comic; }).filter(Boolean);
    if (!ids.length) return Promise.resolve([]);
    var inList = "(" + ids.map(function (x) { return '"' + String(x).replace(/"/g, "") + '"'; }).join(",") + ")";
    return api("hosts?select=site_id,comic_id,name&hidden=is.false&comic_id=in." + encodeURIComponent(inList) + "&site_id=neq." + encodeURIComponent(cfg.site)).then(function (hs) {
      var sites = {}; hs.forEach(function (h) { (sites[h.site_id] = sites[h.site_id] || []).push(h.name); });
      var sids = Object.keys(sites); if (!sids.length) return [];
      return api("sites?select=id,name,domain,features&id=in.(" + sids.map(encodeURIComponent).join(",") + ")").then(function (rows) {
        rows = rows.filter(function (x) { return x.domain && !((x.features || {}).podcast && podOff(x.name)); }); // live sites only, minus podcasts switched off here
        return Promise.all(rows.map(function (x) {
          var pod = !!(x.features || {}).podcast;
          var ep = pod ? api("episodes?select=num,title,posted,url,audio_url,image_url,show_name&hidden=is.false&order=num.desc&limit=1&site_id=eq." + encodeURIComponent(x.id)).catch(function () { return []; }) : Promise.resolve([]);
          return ep.then(function (e) {
            e = e[0];
            return { id: x.id, name: x.name, domain: x.domain, url: "https://" + x.domain, podcast: pod, people: sites[x.id],
              episode: e ? { number: e.num, title: e.title, posted: e.posted, link: e.url || e.audio_url || "", image: e.image_url || "", show: e.show_name || "" } : null };
          });
        }));
      });
    }).catch(function () { return []; });
  }

  /* ---------------- visitor identity (anonymous) ---------------- */
  function device() {
    var k = "csb_device";
    try { var v = localStorage.getItem(k); if (!v) { v = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now()); localStorage.setItem(k, v); } return v; }
    catch (e) { return (root.__csbDevice = root.__csbDevice || String(Math.random()).slice(2) + Date.now()); }
  }
  var name = {
    get: function () { try { return localStorage.getItem("csb_name") || ""; } catch (e) { return ""; } },
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
    // Resolves to the new topic's id. If the site holds first posts, it may be waiting for a moderator:
    // CSB.forum.isHeld("thread", id) says so (the fan's own browser can't see a held post).
    newTopic: function (o) {
      var now = Date.now(), dev = device(), id = uuid();
      return api("threads", { method: "POST", body: { id: id, site_id: cfg.site, board: o.board, title: o.title, author: o.author, created_at: now, last_at: now, last_by: o.author, replies: 0, device: dev } })
        .then(function () { return api("posts", { method: "POST", body: { id: uuid(), site_id: cfg.site, thread_id: id, author: o.author, body: o.body, created_at: now, device: dev } }); })
        .then(function () { return id; });
    },
    // Resolves to { id, held }: held is true when the reply is waiting for a moderator.
    reply: function (o) {
      var id = uuid();
      return api("posts", { method: "POST", body: { id: id, site_id: cfg.site, thread_id: o.threadId, author: o.author, body: o.body, created_at: Date.now(), device: device() } })
        .then(function () { return forum.isHeld("post", id).then(function (held) { return { id: id, held: held }; }); });
    },
    isHeld: function (kind, id) {
      var t = kind === "thread" ? "threads" : kind === "chat" ? "chat_messages" : "posts";
      return api(t + "?select=id&id=eq." + encodeURIComponent(id)).then(function (rows) { return !rows.length; }, function () { return false; });
    },
    // Anyone can report a topic or reply. It's hidden until a moderator keeps or removes it.
    report: function (kind, id, reason) { return api("reports", { method: "POST", body: { site_id: cfg.site, kind: kind === "thread" ? "thread" : "post", item_id: String(id), reason: reason ? String(reason).slice(0, 200) : null, device: device() } }); }
  };
  // A Report button any design can drop next to a post or chat message: tap once to ask, again to send.
  // kind: "thread", "post" or "chat". The item is hidden until a moderator keeps or removes it.
  function reportButton(kind, id, opts) {
    var b = document.createElement("button"), armed = false, t;
    b.type = "button"; b.className = (opts && opts.className) || "csb-report"; b.textContent = "Report";
    b.setAttribute("aria-label", "Report this " + (kind === "chat" ? "message" : "post"));
    b.addEventListener("click", function () {
      if (b.disabled) return;
      if (!armed) { armed = true; b.textContent = "Report this?"; clearTimeout(t); t = setTimeout(function () { armed = false; b.textContent = "Report"; }, 4000); return; }
      clearTimeout(t); b.disabled = true; b.textContent = "Sending…";
      (kind === "chat" ? chat.report(id) : forum.report(kind, id)).then(function () { b.textContent = "Reported. Thanks"; if (opts && opts.onDone) opts.onDone(); },
        function (e) { b.disabled = false; armed = false; b.textContent = "Report"; if (opts && opts.onError) opts.onError(e); });
    });
    return b;
  }
  function uuid() {
    if (root.crypto && root.crypto.randomUUID) return root.crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) { var r = Math.random() * 16 | 0; return (c === "x" ? r : (r & 3 | 8)).toString(16); });
  }

  /* ---------------- chat ---------------- */
  function msg(m) { return { id: m.id, author: m.author, body: m.body, at: m.created_at, isMod: !!m.is_mod, deleted: !!m.deleted }; }
  var chat = {
    recent: function (limit) {
      return api("chat_messages?select=*&deleted=is.false&order=created_at.desc&limit=" + (limit || 80) + "&" + site()).then(function (rows) { return rows.reverse().map(msg); });
    },
    // Resolves to { id, held }: held is true when the message is waiting for a moderator.
    send: function (o) {
      var id = uuid();
      return api("chat_messages", { method: "POST", body: { id: id, site_id: cfg.site, author: o.author, body: o.body, device: device() } })
        .then(function () { return forum.isHeld("chat", id).then(function (held) { return { id: id, held: held }; }); });
    },
    report: function (id, reason) { return api("reports", { method: "POST", body: { site_id: cfg.site, kind: "chat", item_id: String(id), reason: reason ? String(reason).slice(0, 200) : null, device: device() } }); },
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

  /* ---------------- blog ---------------- */
  // Posts are written in a light format: blank line = new paragraph, ## heading, **bold**, *italic*,
  // [text](https://link), ![caption](https://image), - list items, > quotes, and a YouTube link on its own line becomes a video.
  function esc(t) { return String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function inline(t) {
    return esc(t)
      .replace(/!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g, '<img src="$2" alt="$1" loading="lazy">')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, "$1<em>$2</em>")
      .replace(/(^|\W)_([^_\n]+)_(?!\w)/g, "$1<em>$2</em>");
  }
  function markdown(text) {
    var out = [];
    String(text || "").replace(/\r/g, "").split(/\n{2,}/).forEach(function (block) {
      var b = block.trim(); if (!b) return;
      var yt = b.match(/^https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{11})\S*$/);
      if (yt) { out.push('<div class="csb-video"><iframe src="https://www.youtube-nocookie.com/embed/' + yt[1] + '" title="YouTube video" allowfullscreen loading="lazy"></iframe></div>'); return; }
      var h = b.match(/^(#{2,3})\s+(.*)$/);
      if (h && b.indexOf("\n") < 0) { out.push("<h" + h[1].length + ">" + inline(h[2]) + "</h" + h[1].length + ">"); return; }
      var lines = b.split("\n");
      if (lines.every(function (l) { return /^\s*[-*]\s+/.test(l); })) { out.push("<ul>" + lines.map(function (l) { return "<li>" + inline(l.replace(/^\s*[-*]\s+/, "")) + "</li>"; }).join("") + "</ul>"); return; }
      if (lines.every(function (l) { return /^>\s?/.test(l); })) { out.push("<blockquote>" + lines.map(function (l) { return inline(l.replace(/^>\s?/, "")); }).join("<br>") + "</blockquote>"); return; }
      out.push("<p>" + lines.map(inline).join("<br>") + "</p>");
    });
    return out.join("\n");
  }
  function post(p) {
    var plain = String(p.body || "").replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/[#*_>`-]/g, "").replace(/\s+/g, " ").trim();
    return { id: p.id, slug: p.slug, title: p.title, date: p.published_at ? String(p.published_at).slice(0, 10) : "", cover: p.cover_url || "",
      excerpt: p.excerpt || (plain.length > 180 ? plain.slice(0, 177).replace(/\s+\S*$/, "") + "…" : plain),
      html: p.body !== undefined ? markdown(p.body) : undefined };
  }
  var blog = {
    // Newest first: [{ slug, title, date, cover, excerpt }]
    list: function (limit) { return api("blog_posts?select=id,slug,title,excerpt,cover_url,published_at,body&published=is.true&order=published_at.desc&limit=" + (limit || 50) + "&" + site()).then(function (r) { return r.map(post); }); },
    // One post with its html, or null
    get: function (slug) { return api("blog_posts?select=*&published=is.true&slug=eq." + encodeURIComponent(slug) + "&" + site()).then(function (r) { return r[0] ? post(r[0]) : null; }); }
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
    // { email, name, zip, met?: "where we met", source?: "site" | "qr" | "embed" } → "joined" or "updated".
    // Name, email and ZIP everywhere (founder, Oct 29); "near a show" is 50 miles from the ZIP. The fan also lands on
    // the Coaster of every comic on the site's lineup. (The older { email, placeId } form still works.)
    join: function (o) {
      if (o.zip !== undefined) return api("rpc/join_list", { method: "POST", body: { p_site: cfg.site, p_email: o.email, p_name: o.name || "", p_zip: String(o.zip || ""),
        p_met: o.met ? String(o.met).slice(0, 200) : null, p_source: o.source || "site" } });
      var body = { p_site: cfg.site, p_email: o.email, p_place: o.placeId, p_radius: o.radius || 50 };
      if (o.met) body.p_met = String(o.met).slice(0, 200);
      if (o.source) body.p_source = o.source;
      return api("rpc/join_fans", { method: "POST", body: body });
    },
    // A comic's own list, from their Coaster (no site needed): joinCoaster("lev-fer", { email, name, zip })
    joinCoaster: function (comic, o) {
      if (!cfg.url) init();
      return api("rpc/join_coaster", { method: "POST", body: { p_comic: comic, p_email: o.email, p_name: o.name || "", p_zip: String(o.zip || ""), p_met: o.met ? String(o.met).slice(0, 200) : null } });
    },
    // For a "stop emailing me" link: ?leave=<token>. Takes them off everywhere that sign-up reached.
    leave: function (token) {
      return api("rpc/leave_list", { method: "POST", body: { p_token: token } }).catch(function () { return api("rpc/leave_fans", { method: "POST", body: { p_token: token } }); });
    }
  };

  /* ---------------- shared pieces every design uses ---------------- */
  // Minimal default looks for the shared pieces, added once. Designs restyle them with their own CSS
  // (.csb-shows, .csb-show, .csb-signup …) or pass their own class names.
  var styled = false;
  function baseStyles() {
    if (styled || typeof document === "undefined") return; styled = true;
    var st = document.createElement("style"); st.id = "csb-base";
    st.textContent = ".csb-shows{list-style:none;margin:0;padding:0;display:grid;gap:8px}.csb-show{display:flex;align-items:center;gap:14px}" +
      ".csb-when{display:grid;justify-items:center;min-width:3.2em;line-height:1.05}.csb-when small{font-size:.72em;font-weight:700;text-transform:uppercase;letter-spacing:.06em;opacity:.75}" +
      ".csb-when b{font-size:1.5em}.csb-where{flex:1;min-width:0}.csb-where b,.csb-where span{display:block;overflow:hidden;text-overflow:ellipsis}.csb-where span{opacity:.7;font-size:.9em}" +
      ".csb-act{white-space:nowrap}.csb-tag{font-size:.78em;font-weight:700}.csb-show.cancelled .csb-where{text-decoration:line-through;opacity:.6}" +
      ".csb-signup{display:grid;gap:8px}.csb-signup .csb-row{display:grid;grid-template-columns:1fr 7.5em;gap:8px}.csb-signup input{font:inherit;min-width:0}" +
      ".csb-signup .csb-msg:empty{display:none}.csb-signup .csb-fine{font-size:.8em;opacity:.7;margin:0}.csb-signup .csb-fine a{color:inherit}";
    document.head.appendChild(st);
  }
  var MON3 = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], DOW3 = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  function niceTime(t) {
    if (/[ap]\.?m/i.test(String(t || ""))) return String(t).replace(/\s*([ap])\.?m\.?/i, function (_, x) { return x.toLowerCase() + "m"; }).replace(":00", "");
    var m = String(t || "").match(/^(\d{1,2}):(\d{2})/); if (!m) return t || "";
    var h = +m[1], ap = h >= 12 ? "pm" : "am"; h = h % 12 || 12; return h + (m[2] === "00" ? "" : ":" + m[2]) + ap;
  }
  // One show, ready to show anywhere: the same labels on every site, Coaster and embed.
  // → { …show, weekday: "Fri", month: "Oct", day: 24, dateLabel: "Fri, Oct 24", timeLabel: "9:30pm",
  //     action: { label: "Tickets" | "Few left" | "RSVP", url } or null, tag: "Sold out" | "Cancelled" | "Free" | "" }
  function showView(s) {
    var d = new Date(String(s.date).slice(0, 10) + "T12:00:00"), url = s.tickets || s.url || "", st = s.status || "on_sale";
    var gone = st === "sold_out" || st === "cancelled";
    return Object.assign({}, s, { weekday: DOW3[d.getDay()], month: MON3[d.getMonth()], day: d.getDate(), year: d.getFullYear(),
      dateLabel: DOW3[d.getDay()] + ", " + MON3[d.getMonth()] + " " + d.getDate(), timeLabel: niceTime(s.time),
      action: !gone && /^https?:\/\//i.test(url) ? { label: st === "free" ? "RSVP" : st === "few_left" ? "Few left" : "Tickets", url: url } : null,
      tag: st === "sold_out" ? "Sold out" : st === "cancelled" ? "Cancelled" : st === "free" ? "Free" : "" });
  }
  // The same night added twice (by the comic and by a site): one row. Keeps the one with a ticket link.
  function dedupeShows(list) {
    var norm = function (x) { return String(x || "").toLowerCase().replace(/[^a-z0-9]/g, ""); }, seen = {}, out = [];
    (list || []).forEach(function (s) {
      var k = [s.person || s.comic_id || s.host || (s.event ? "event" : ""), String(s.date).slice(0, 10), s.venueId || s.venue_id || norm(s.venue), norm(niceTime(s.time))].join("|");
      if (seen[k] === undefined) { seen[k] = out.length; out.push(s); }
      else if (!(out[seen[k]].tickets || out[seen[k]].url) && (s.tickets || s.url)) out[seen[k]] = s;
    });
    return out;
  }
  // A ready-made show list: CSB.showList(shows, { limit, empty: "No dates right now.", who: fn(show) → name }).
  function showList(shows, o) {
    o = o || {}; baseStyles();
    var list = dedupeShows(shows).slice(0, o.limit || 999).map(showView);
    var ul = document.createElement("ul"); ul.className = "csb-shows" + (o.className ? " " + o.className : "");
    if (!list.length) { var li0 = document.createElement("li"); li0.className = "csb-empty"; li0.textContent = o.empty || "No dates right now. Check back soon."; ul.appendChild(li0); return ul; }
    list.forEach(function (s) {
      var li = document.createElement("li"); li.className = "csb-show" + (s.status === "cancelled" ? " cancelled" : "") + (s.status === "sold_out" ? " sold-out" : "");
      var who = o.who ? o.who(s) : "";
      li.innerHTML = '<span class="csb-when"><small></small><b></b></span><span class="csb-where"><b></b><span></span></span><span class="csb-act"></span>';
      li.querySelector(".csb-when small").textContent = s.weekday + " · " + s.month;
      li.querySelector(".csb-when b").textContent = s.day;
      li.querySelector(".csb-where b").textContent = s.venue || s.city || "Show";
      li.querySelector(".csb-where span").textContent = [s.city, s.timeLabel, who, s.note].filter(Boolean).join(" · ");
      var act = li.querySelector(".csb-act");
      if (s.action) { var a = document.createElement("a"); a.className = (o.buttonClass || "csb-btn") + (s.status === "few_left" ? " few" : ""); a.href = s.action.url; a.target = "_blank"; a.rel = "noopener"; a.textContent = s.action.label; act.appendChild(a); }
      else if (s.tag) { var t = document.createElement("span"); t.className = o.tagClass || "csb-tag"; t.textContent = s.tag; act.appendChild(t); }
      ul.appendChild(li);
    });
    return ul;
  }
  // The one sign-up form (name, email, ZIP), for a site's list or a comic's own list (o.comic).
  // CSB.signup({ comic?, source?, met?: true, button: "Join", inputClass, buttonClass, done: fn })
  function signup(o) {
    o = o || {}; baseStyles();
    var f = document.createElement("form"); f.className = "csb-signup" + (o.className ? " " + o.className : ""); f.noValidate = true;
    var field = function (name, ph, type, extra) { var i = document.createElement("input"); i.name = name; i.type = type || "text"; i.placeholder = ph; i.setAttribute("aria-label", ph); if (o.inputClass) i.className = o.inputClass; for (var k in (extra || {})) i.setAttribute(k, extra[k]); return i; };
    var name = field("name", "First name", "text", { autocomplete: "given-name", maxlength: "80" });
    var email = field("email", "Email", "email", { autocomplete: "email", maxlength: "200" });
    var zip = field("zip", "ZIP", "text", { autocomplete: "postal-code", inputmode: "numeric", maxlength: "5", pattern: "[0-9]{5}" });
    var met = o.met ? field("met", "Where did we meet? (optional)", "text", { maxlength: "200" }) : null;
    var btn = document.createElement("button"); btn.type = "submit"; btn.textContent = o.button || "Join"; if (o.buttonClass) btn.className = o.buttonClass;
    var msg = document.createElement("p"); msg.className = "csb-msg"; msg.setAttribute("role", "status");
    var fine = document.createElement("p"); fine.className = "csb-fine";
    fine.innerHTML = 'Only emails about shows near you. Unsubscribe anytime. <a href="https://comictable.com/privacy" target="_blank" rel="noopener">Privacy</a>';
    var row = document.createElement("div"); row.className = "csb-row"; row.appendChild(email); row.appendChild(zip);
    [name, row, met, btn, msg, fine].forEach(function (x) { if (x) f.appendChild(x); });
    f.addEventListener("submit", function (e) {
      e.preventDefault(); msg.textContent = "";
      var em = email.value.trim(), z = zip.value.replace(/\D/g, "");
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) { msg.textContent = "Add your email."; email.focus(); return; }
      if (z.length !== 5) { msg.textContent = "Add your 5-digit ZIP code."; zip.focus(); return; }
      btn.disabled = true;
      var data = { email: em, name: name.value.trim(), zip: z, met: met ? met.value.trim() : "", source: o.source || "site" };
      (o.comic ? fans.joinCoaster(o.comic, data) : fans.join(data)).then(function (r) {
        btn.disabled = false; f.classList.add("csb-done");
        msg.textContent = o.thanks || (r === "updated" ? "Updated. Thanks!" : "You're on the list. We'll tell you when there's a show near you.");
        if (o.done) o.done(r);
      }, function (er) { btn.disabled = false; msg.textContent = er.message || "That didn't go through. Try again."; });
    });
    return f;
  }

  /* ---------------- home screen items ----------------
   * Every comic arranges their Home screen item by item: each link, each social, Patreon, each podcast,
   * and the bigger blocks (shows, picks, featured video…). Saved on the site as theme.home_items = [{ key, on }].
   * homeCatalog(data) lists what this site could show right now; homeArrange(catalog, saved) puts it in the
   * comic's order. Anything new lands next to its kind (a new link with the other links), switched on.
   * The dashboard and every design use these same two functions, so they always agree.
   */
  var HOME_GROUPS = ["me", "links", "socials", "support", "picks", "shows", "podcast", "special", "list", "blog", "clips"];
  var HOME_OFF = { clips: true };
// Every social a comic can add, in the order they're listed: [key, name, short label for small buttons, example].
  // The first five have their own database columns; the rest live in the socials JSON (19_more_socials.sql).
  var SOCIALS = [
    ["instagram", "Instagram", "IG", "https://www.instagram.com/…"], ["youtube", "YouTube", "YT", "https://www.youtube.com/@…"],
    ["tiktok", "TikTok", "TT", "https://www.tiktok.com/@…"], ["twitter", "X", "X", "https://x.com/…"],
    ["threads", "Threads", "TH", "https://www.threads.net/@…"], ["bluesky", "Bluesky", "BS", "https://bsky.app/profile/…"],
    ["facebook", "Facebook", "FB", "https://www.facebook.com/…"], ["twitch", "Twitch", "TW", "https://www.twitch.tv/…"],
    ["kick", "Kick", "K", "https://kick.com/…"], ["snapchat", "Snapchat", "SC", "https://www.snapchat.com/add/…"],
    ["spotify", "Spotify", "SP", "https://open.spotify.com/…"], ["apple_podcasts", "Apple Podcasts", "AP", "https://podcasts.apple.com/…"],
    ["soundcloud", "SoundCloud", "SC", "https://soundcloud.com/…"], ["substack", "Substack", "SS", "https://….substack.com"],
    ["cameo", "Cameo", "CM", "https://www.cameo.com/…"], ["website", "Website", "WWW", "https://linktr.ee/… or your own site"]];
  // Each network's logo (24×24 path) and brand color. Logos: Simple Icons (simpleicons.org, CC0); Cameo and Website are our own shapes.
  var SOCIAL_ICONS = {
    instagram: ["#FF0069", "M7.0301.084c-1.2768.0602-2.1487.264-2.911.5634-.7888.3075-1.4575.72-2.1228 1.3877-.6652.6677-1.075 1.3368-1.3802 2.127-.2954.7638-.4956 1.6365-.552 2.914-.0564 1.2775-.0689 1.6882-.0626 4.947.0062 3.2586.0206 3.6671.0825 4.9473.061 1.2765.264 2.1482.5635 2.9107.308.7889.72 1.4573 1.388 2.1228.6679.6655 1.3365 1.0743 2.1285 1.38.7632.295 1.6361.4961 2.9134.552 1.2773.056 1.6884.069 4.9462.0627 3.2578-.0062 3.668-.0207 4.9478-.0814 1.28-.0607 2.147-.2652 2.9098-.5633.7889-.3086 1.4578-.72 2.1228-1.3881.665-.6682 1.0745-1.3378 1.3795-2.1284.2957-.7632.4966-1.636.552-2.9124.056-1.2809.0692-1.6898.063-4.948-.0063-3.2583-.021-3.6668-.0817-4.9465-.0607-1.2797-.264-2.1487-.5633-2.9117-.3084-.7889-.72-1.4568-1.3876-2.1228C21.2982 1.33 20.628.9208 19.8378.6165 19.074.321 18.2017.1197 16.9244.0645 15.6471.0093 15.236-.005 11.977.0014 8.718.0076 8.31.0215 7.0301.0839m.1402 21.6932c-1.17-.0509-1.8053-.2453-2.2287-.408-.5606-.216-.96-.4771-1.3819-.895-.422-.4178-.6811-.8186-.9-1.378-.1644-.4234-.3624-1.058-.4171-2.228-.0595-1.2645-.072-1.6442-.079-4.848-.007-3.2037.0053-3.583.0607-4.848.05-1.169.2456-1.805.408-2.2282.216-.5613.4762-.96.895-1.3816.4188-.4217.8184-.6814 1.3783-.9003.423-.1651 1.0575-.3614 2.227-.4171 1.2655-.06 1.6447-.072 4.848-.079 3.2033-.007 3.5835.005 4.8495.0608 1.169.0508 1.8053.2445 2.228.408.5608.216.96.4754 1.3816.895.4217.4194.6816.8176.9005 1.3787.1653.4217.3617 1.056.4169 2.2263.0602 1.2655.0739 1.645.0796 4.848.0058 3.203-.0055 3.5834-.061 4.848-.051 1.17-.245 1.8055-.408 2.2294-.216.5604-.4763.96-.8954 1.3814-.419.4215-.8181.6811-1.3783.9-.4224.1649-1.0577.3617-2.2262.4174-1.2656.0595-1.6448.072-4.8493.079-3.2045.007-3.5825-.006-4.848-.0608M16.953 5.5864A1.44 1.44 0 1 0 18.39 4.144a1.44 1.44 0 0 0-1.437 1.4424M5.8385 12.012c.0067 3.4032 2.7706 6.1557 6.173 6.1493 3.4026-.0065 6.157-2.7701 6.1506-6.1733-.0065-3.4032-2.771-6.1565-6.174-6.1498-3.403.0067-6.156 2.771-6.1496 6.1738M8 12.0077a4 4 0 1 1 4.008 3.9921A3.9996 3.9996 0 0 1 8 12.0077"],
    youtube: ["#FF0000", "M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"],
    tiktok: ["#000000", "M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"],
    twitter: ["#000000", "M14.234 10.162 22.977 0h-2.072l-7.591 8.824L7.251 0H.258l9.168 13.343L.258 24H2.33l8.016-9.318L16.749 24h6.993zm-2.837 3.299-.929-1.329L3.076 1.56h3.182l5.965 8.532.929 1.329 7.754 11.09h-3.182z"],
    threads: ["#000000", "M18.263 11.097c-.03-3.486-1.92-5.586-5.111-5.586-2.13 0-3.922.963-4.863 2.499l2.062 1.438c.535-.843 1.272-1.543 2.628-1.543 1.528 0 2.318.85 2.544 2.431a15 15 0 0 0-2.236-.173c-4.125 0-6.068 1.867-6.068 4.336s1.943 3.99 4.804 3.99c3.139 0 5.013-2.115 5.781-4.735.798.361 1.348 1.204 1.348 2.47 0 3.387-3.907 5.232-7.22 5.232-4.885 0-8.077-3.207-8.077-8.424 0-6.392 4.223-10.487 9.9-10.487 3.808 0 5.69 1.671 6.97 3.914l2.108-1.475C21.44 2.078 18.331 0 13.663 0 6.227 0 1.168 5.277 1.168 12.934c0 7 4.953 11.066 10.856 11.066 4.878 0 9.809-2.846 9.809-7.716 0-2.545-1.46-4.231-3.569-5.187m-6.33 4.855c-1.077 0-2.026-.512-2.026-1.453 0-1.483 1.822-1.934 3.606-1.934.678 0 1.34.045 1.927.173-.422 1.927-1.671 3.215-3.508 3.214Z"],
    bluesky: ["#1185FE", "M5.202 2.857C7.954 4.922 10.913 9.11 12 11.358c1.087-2.247 4.046-6.436 6.798-8.501C20.783 1.366 24 .213 24 3.883c0 .732-.42 6.156-.667 7.037-.856 3.061-3.978 3.842-6.755 3.37 4.854.826 6.089 3.562 3.422 6.299-5.065 5.196-7.28-1.304-7.847-2.97-.104-.305-.152-.448-.153-.327 0-.121-.05.022-.153.327-.568 1.666-2.782 8.166-7.847 2.97-2.667-2.737-1.432-5.473 3.422-6.3-2.777.473-5.899-.308-6.755-3.369C.42 10.04 0 4.615 0 3.883c0-3.67 3.217-2.517 5.202-1.026"],
    facebook: ["#0866FF", "M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z"],
    twitch: ["#9146FF", "M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z"],
    kick: ["#53FC19", "M1.333 0h8v5.333H12V2.667h2.667V0h8v8H20v2.667h-2.667v2.666H20V16h2.667v8h-8v-2.667H12v-2.666H9.333V24h-8Z"],
    snapchat: ["#FFFC00", "M12.206.793c.99 0 4.347.276 5.93 3.821.529 1.193.403 3.219.299 4.847l-.003.06c-.012.18-.022.345-.03.51.075.045.203.09.401.09.3-.016.659-.12 1.033-.301.165-.088.344-.104.464-.104.182 0 .359.029.509.09.45.149.734.479.734.838.015.449-.39.839-1.213 1.168-.089.029-.209.075-.344.119-.45.135-1.139.36-1.333.81-.09.224-.061.524.12.868l.015.015c.06.136 1.526 3.475 4.791 4.014.255.044.435.27.42.509 0 .075-.015.149-.045.225-.24.569-1.273.988-3.146 1.271-.059.091-.12.375-.164.57-.029.179-.074.36-.134.553-.076.271-.27.405-.555.405h-.03c-.135 0-.313-.031-.538-.074-.36-.075-.765-.135-1.273-.135-.3 0-.599.015-.913.074-.6.104-1.123.464-1.723.884-.853.599-1.826 1.288-3.294 1.288-.06 0-.119-.015-.18-.015h-.149c-1.468 0-2.427-.675-3.279-1.288-.599-.42-1.107-.779-1.707-.884-.314-.045-.629-.074-.928-.074-.54 0-.958.089-1.272.149-.211.043-.391.074-.54.074-.374 0-.523-.224-.583-.42-.061-.192-.09-.389-.135-.567-.046-.181-.105-.494-.166-.57-1.918-.222-2.95-.642-3.189-1.226-.031-.063-.052-.15-.055-.225-.015-.243.165-.465.42-.509 3.264-.54 4.73-3.879 4.791-4.02l.016-.029c.18-.345.224-.645.119-.869-.195-.434-.884-.658-1.332-.809-.121-.029-.24-.074-.346-.119-1.107-.435-1.257-.93-1.197-1.273.09-.479.674-.793 1.168-.793.146 0 .27.029.383.074.42.194.789.3 1.104.3.234 0 .384-.06.465-.105l-.046-.569c-.098-1.626-.225-3.651.307-4.837C7.392 1.077 10.739.807 11.727.807l.419-.015h.06z"],
    spotify: ["#1ED760", "M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"],
    apple_podcasts: ["#9933CC", "M5.34 0A5.328 5.328 0 000 5.34v13.32A5.328 5.328 0 005.34 24h13.32A5.328 5.328 0 0024 18.66V5.34A5.328 5.328 0 0018.66 0zm6.525 2.568c2.336 0 4.448.902 6.056 2.587 1.224 1.272 1.912 2.619 2.264 4.392.12.59.12 2.2.007 2.864a8.506 8.506 0 01-3.24 5.296c-.608.46-2.096 1.261-2.336 1.261-.088 0-.096-.091-.056-.46.072-.592.144-.715.48-.856.536-.224 1.448-.874 2.008-1.435a7.644 7.644 0 002.008-3.536c.208-.824.184-2.656-.048-3.504-.728-2.696-2.928-4.792-5.624-5.352-.784-.16-2.208-.16-3 0-2.728.56-4.984 2.76-5.672 5.528-.184.752-.184 2.584 0 3.336.456 1.832 1.64 3.512 3.192 4.512.304.2.672.408.824.472.336.144.408.264.472.856.04.36.03.464-.056.464-.056 0-.464-.176-.896-.384l-.04-.03c-2.472-1.216-4.056-3.274-4.632-6.012-.144-.706-.168-2.392-.03-3.04.36-1.74 1.048-3.1 2.192-4.304 1.648-1.737 3.768-2.656 6.128-2.656zm.134 2.81c.409.004.803.04 1.106.106 2.784.62 4.76 3.408 4.376 6.174-.152 1.114-.536 2.03-1.216 2.88-.336.43-1.152 1.15-1.296 1.15-.023 0-.048-.272-.048-.603v-.605l.416-.496c1.568-1.878 1.456-4.502-.256-6.224-.664-.67-1.432-1.064-2.424-1.246-.64-.118-.776-.118-1.448-.008-1.02.167-1.81.562-2.512 1.256-1.72 1.704-1.832 4.342-.264 6.222l.413.496v.608c0 .336-.027.608-.06.608-.03 0-.264-.16-.512-.36l-.034-.011c-.832-.664-1.568-1.842-1.872-2.997-.184-.698-.184-2.024.008-2.72.504-1.878 1.888-3.335 3.808-4.019.41-.145 1.133-.22 1.814-.211zm-.13 2.99c.31 0 .62.06.844.178.488.253.888.745 1.04 1.259.464 1.578-1.208 2.96-2.72 2.254h-.015c-.712-.331-1.096-.956-1.104-1.77 0-.733.408-1.371 1.112-1.745.224-.117.534-.176.844-.176zm-.011 4.728c.988-.004 1.706.349 1.97.97.198.464.124 1.932-.218 4.302-.232 1.656-.36 2.074-.68 2.356-.44.39-1.064.498-1.656.288h-.003c-.716-.257-.87-.605-1.164-2.644-.341-2.37-.416-3.838-.218-4.302.262-.616.974-.966 1.97-.97z"],
    soundcloud: ["#FF5500", "M23.999 14.165c-.052 1.796-1.612 3.169-3.4 3.169h-8.18a.68.68 0 0 1-.675-.683V7.862a.747.747 0 0 1 .452-.724s.75-.513 2.333-.513a5.364 5.364 0 0 1 2.763.755 5.433 5.433 0 0 1 2.57 3.54c.282-.08.574-.121.868-.12.884 0 1.73.358 2.347.992s.948 1.49.922 2.373ZM10.721 8.421c.247 2.98.427 5.697 0 8.672a.264.264 0 0 1-.53 0c-.395-2.946-.22-5.718 0-8.672a.264.264 0 0 1 .53 0ZM9.072 9.448c.285 2.659.37 4.986-.006 7.655a.277.277 0 0 1-.55 0c-.331-2.63-.256-5.02 0-7.655a.277.277 0 0 1 .556 0Zm-1.663-.257c.27 2.726.39 5.171 0 7.904a.266.266 0 0 1-.532 0c-.38-2.69-.257-5.21 0-7.904a.266.266 0 0 1 .532 0Zm-1.647.77a26.108 26.108 0 0 1-.008 7.147.272.272 0 0 1-.542 0 27.955 27.955 0 0 1 0-7.147.275.275 0 0 1 .55 0Zm-1.67 1.769c.421 1.865.228 3.5-.029 5.388a.257.257 0 0 1-.514 0c-.21-1.858-.398-3.549 0-5.389a.272.272 0 0 1 .543 0Zm-1.655-.273c.388 1.897.26 3.508-.01 5.412-.026.28-.514.283-.54 0-.244-1.878-.347-3.54-.01-5.412a.283.283 0 0 1 .56 0Zm-1.668.911c.4 1.268.257 2.292-.026 3.572a.257.257 0 0 1-.514 0c-.241-1.262-.354-2.312-.023-3.572a.283.283 0 0 1 .563 0Z"],
    substack: ["#FF6719", "M22.539 8.242H1.46V5.406h21.08v2.836zM1.46 10.812V24L12 18.11 22.54 24V10.812H1.46zM22.54 0H1.46v2.836h21.08V0z"],
    cameo: ["#FF2E63", "M12 1.5l3.1 6.6 7.2.9-5.3 5 1.4 7.1L12 17.6l-6.4 3.5L7 14l-5.3-5 7.2-.9z"],
    website: ["#5E584D", "M12 0a12 12 0 1 0 0 24 12 12 0 0 0 0-24zm7.9 7h-3.3a18 18 0 0 0-1.5-4.4A10 10 0 0 1 19.9 7zM12 2.1c.9 1.2 1.7 2.9 2.2 4.9H9.8c.5-2 1.3-3.7 2.2-4.9zM2.4 14a9.9 9.9 0 0 1 0-4h3.8a19 19 0 0 0 0 4zm1.7 3h3.3c.4 1.6.9 3 1.5 4.4A10 10 0 0 1 4.1 17zm3.3-10H4.1a10 10 0 0 1 4.8-4.4C8.3 4 7.8 5.4 7.4 7zM12 21.9c-.9-1.2-1.7-2.9-2.2-4.9h4.4c-.5 2-1.3 3.7-2.2 4.9zm2.5-6.9h-5a17 17 0 0 1 0-6h5a17 17 0 0 1 0 6zm.6 6.4c.6-1.3 1.1-2.8 1.5-4.4h3.3a10 10 0 0 1-4.8 4.4zm2.7-6.4a19 19 0 0 0 0-4h3.8a9.9 9.9 0 0 1 0 4z"]
  };
  // An <svg> for one network, in its brand color or the page's color ("currentColor"). opts: { brand, size, onDark }
  function socialIcon(key, opts) {
    // onDark: a black logo (TikTok, X, Threads…) takes the text color instead, so it shows on a dark page
    var ic = SOCIAL_ICONS[key] || SOCIAL_ICONS.website, color = opts && opts.brand && !(opts.onDark && ic[0] === "#000000") ? ic[0] : "currentColor";
    return '<svg viewBox="0 0 24 24" width="' + ((opts && opts.size) || 20) + '" height="' + ((opts && opts.size) || 20) + '" aria-hidden="true" focusable="false"><path fill="' + color + '" d="' + ic[1] + '"/></svg>';
  }
  var COLUMN_SOCIALS = ["instagram", "youtube", "tiktok", "twitter", "website"];
  function socialsOf(h) {
    var out = {}, more = (h && h.socials && typeof h.socials === "object") ? h.socials : {};
    SOCIALS.forEach(function (x) { var v = COLUMN_SOCIALS.indexOf(x[0]) >= 0 ? h[x[0]] : more[x[0]]; if (v && /^https?:\/\//i.test(String(v).trim())) out[x[0]] = String(v).trim(); });
    return out;
  }
  var hostOf = function (u) { return String(u || "").replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, ""); };
  function homeCatalog(d) {
    d = d || {};
    var out = [], me = (d.people || [])[0] || {}, so = me.socials || {}, p = d.profile || {}, f = d.features || {};
    var add = function (key, group, label, sub) { out.push({ key: key, group: group, label: label, sub: sub || "" }); };
    if (me.photo || me.bio || p.about) add("me", "me", "You", "Your photo, name and the first line of your bio");
    (d.links || []).forEach(function (l) { add("link:" + l.id, "links", l.label, hostOf(l.url)); });
    SOCIALS.forEach(function (x) { if (so[x[0]]) add("social:" + x[0], "socials", x[1], hostOf(so[x[0]])); });
    if (p.support_url) add("support", "support", p.support_label || "Support button", hostOf(p.support_url));
    if ((d.picks || []).length) add("picks", "picks", "Home screen picks", d.picks.length + " pinned. The first one is big");
    if (f.shows !== false && (d.shows || []).length) add("shows", "shows", "Next shows", "Your next few dates with ticket buttons");
    var pods = [];
    if (f.podcast) (d.episodes || []).forEach(function (e) { var n = String(e.show || "").trim(); if (n && pods.indexOf(n) < 0) pods.push(n); });
    (d.elsewhere || []).forEach(function (x) { if (x.podcast && !pods.some(function (n) { return n.toLowerCase() === String(x.name).toLowerCase(); })) pods.push(x.name); });
    pods.forEach(function (n) { add("podcast:" + n.toLowerCase(), "podcast", n, "Podcast, with the latest episode"); });
    if (f.videos !== false && (d.videos || []).some(function (v) { return v.featured; })) add("special", "special", "Featured video", "The video you starred in Videos");
    if (f.fans) add("list", "list", "Mailing list", "A button to join your fan list");
    if (f.blog && (d.posts || []).length) add("blog", "blog", "From the blog", "Your two newest posts");
    if (f.videos !== false && (d.videos || []).some(function (v) { return v.short; })) add("shorts", "shorts", "Shorts", "Your newest YouTube Shorts in a row you swipe");
    if (f.videos !== false && (d.videos || []).some(function (v) { return !v.short; })) add("clips", "clips", "Latest clips", "Your three newest videos");
    return out;
  }
  // Older sites saved whole sections (theme.home = [{ key: "socials", on }]): spread each over its items.
  function homeFromSections(catalog, sections) {
    if (!Array.isArray(sections) || !sections.length) return null;
    var out = [];
    sections.forEach(function (s) { catalog.forEach(function (c) { if (c.group === s.key) out.push({ key: c.key, on: !!s.on }); }); });
    return out;
  }
  function homeArrange(catalog, saved) {
    var byKey = {}; catalog.forEach(function (c) { byKey[c.key] = c; });
    var list = [];
    (Array.isArray(saved) ? saved : []).forEach(function (x) { if (x && byKey[x.key] && !list.some(function (y) { return y.key === x.key; })) list.push(Object.assign({}, byKey[x.key], { on: !!x.on })); });
    catalog.forEach(function (c) {
      if (list.some(function (y) { return y.key === c.key; })) return;
      var at = -1, gi = HOME_GROUPS.indexOf(c.group);
      list.forEach(function (y, i) { if (y.group === c.group) at = i; });
      if (at < 0) list.forEach(function (y, i) { if (HOME_GROUPS.indexOf(y.group) < gi) at = i; });
      list.splice(at + 1, 0, Object.assign({}, c, { on: !HOME_OFF[c.group] }));
    });
    return list;
  }

  // What a Coaster can show, and where it goes unless the comic moves it: "front" (on the Coaster), "more" (under More), "off".
  // What can be on a Coaster, in the default order (founder's phone reference, Oct 30): socials, the next shows as
  // tickets, who else is on the bill, then their sites and the rest. [key, name, default place, what it is]
  var COASTER_ITEMS = [
    ["socials", "Social links", "front", "Instagram, TikTok and the rest"], ["dates", "Shows", "front", "Your next shows as tickets, then all of them"],
    ["bill", "Also on the bill", "front", "Other comics on your upcoming shows"], ["links", "Your sites", "front", "Buttons to the sites you're on, and your website"],
    ["join", "Join my list", "front", "Fans sign up to hear when you play near them"], ["tape", "The Tape", "more", "Your best set right now"],
    ["shorts", "Shorts", "more", "Your newest YouTube Shorts, in a row fans swipe"], ["bio", "Bio", "more", "Your short bio"], ["booking", "Booking", "more", "Your booking email"], ["press", "Press kit", "more", "Photos and bios for clubs"]];
  // How the page around the coaster looks. Saved as coaster.page; every choice has a default.
  var COASTER_PAGE = {
    bg: [["brick", "Brick wall"], ["velvet", "Velvet curtain"], ["neon", "Neon night"], ["wood", "Bar top"], ["checker", "Checker"], ["solid", "Solid"]],
    dates: [["tickets", "Torn tickets"], ["list", "Clean list"], ["chalk", "Chalkboard"]],
    buttons: [["status", "Colored by status"], ["one", "One color"], ["outline", "Outline"]],
    tiles: [["tiles", "Tiles"], ["plain", "Plain"]],
    shown: [["3", "Next 3"], ["1", "Next 1"], ["5", "Next 5"], ["all", "All"]]
  };
  function coasterPage(c) {
    var p = (c && c.coaster && c.coaster.page && typeof c.coaster.page === "object") ? c.coaster.page : {}, out = {};
    for (var k in COASTER_PAGE) { var ok = COASTER_PAGE[k].map(function (x) { return x[0]; }); out[k] = ok.indexOf(String(p[k])) >= 0 ? String(p[k]) : ok[0]; }
    return out;
  }
  function coasterPlan(c) {
    var set = (c && c.coaster && typeof c.coaster === "object") ? c.coaster : {}, out = {};
    COASTER_ITEMS.forEach(function (x) { var v = set[x[0]]; out[x[0]] = v === "front" || v === "more" || v === "off" ? v : x[2]; });
    if (set.dates === undefined && set.next === "off") out.dates = "more";   // saved before Shows took over Next show
    return out;
  }

  // The order the comic put their Coaster items in (saved as coaster.order); anything new goes at the end.
  function coasterOrder(c) {
    var saved = (c && c.coaster && Array.isArray(c.coaster.order)) ? c.coaster.order : [], keys = COASTER_ITEMS.map(function (x) { return x[0]; });
    var out = saved.filter(function (k, i) { return keys.indexOf(k) >= 0 && saved.indexOf(k) === i; });
    keys.forEach(function (k) { if (out.indexOf(k) < 0) out.push(k); });
    return out;
  }

  // Options every site has, defined once by ComicTable (the dashboard's Design page shows these to every site, and
  // every design reads them the same way). Saved in the site's theme under these keys. A design's own one-off
  // settings (its theme.json) are its Custom tab. Same shape as theme.json settings.
  var SITE_OPTIONS = [
    { type: "heading", label: "Shows" },
    { key: "home_shows", label: "How many shows on the home screen", type: "select", options: [["1", "1"], ["3", "3"], ["5", "5"], ["10", "10"], ["all", "All"]], "default": "3" },
    { key: "shows_style", label: "Show listings", type: "select", options: [["detailed", "Detailed: club, city, time and tickets"], ["compact", "Compact: one line each"]], "default": "detailed" },
    { type: "heading", label: "Social links" },
    { key: "socials_style", label: "Socials show as", type: "select", options: [["icons", "Logos"], ["both", "Logo + name"], ["names", "Names"]], "default": "icons" },
    { key: "socials_size", label: "Size", type: "select", options: [["small", "Small"], ["medium", "Medium"], ["big", "Big"]], "default": "medium" },
    { key: "socials_color", label: "Colors", type: "select", options: [["brand", "Each network's own colors"], ["site", "This site's colors"]], "default": "brand" },
    { key: "socials_hide", label: "Hide on this site", type: "socials_hide", help: "Tap a network to hide it here. It stays on your Coaster and your other sites.", "default": [] },
    { type: "heading", label: "Podcast" },
    { key: "listen_style", label: "Listen buttons", type: "select", options: [["both", "Apple and Spotify"], ["apple", "Apple Podcasts"], ["spotify", "Spotify"], ["menu", "One \"Listen on…\" menu"]], "default": "both",
      help: "Spotify links per episode fill in by themselves once ComicTable's Spotify keys are set; until then the button goes to your show on Spotify (About & contact → Spotify show)." },
    { type: "heading", label: "Videos" },
    { key: "lineup_videos", label: "Comics' own YouTube channels", type: "select", options: [["auto", "Automatic: on for a one-comic site, off for a group"], ["on", "On: every comic's channel shows here too"], ["off", "Off: only this site's own channel"]], "default": "auto",
      help: "A comic's channel lives on their Coaster. This decides whether it also shows on this site." },
    { type: "heading", label: "Mailing list" },
    { key: "signup_style", label: "Sign-up", type: "select", options: [["box", "A box in its spot"], ["big", "Big, first on the home screen"], ["bar", "A slim bar: \"Get told when I'm in your city\""], ["off", "Off"]], "default": "box" }];
  // This site's values for those options, with the defaults filled in. home_shows comes back as a number, or Infinity for All.
  function siteOptions(theme) {
    var t = theme || {}, out = {};
    SITE_OPTIONS.forEach(function (o) {
      if (!o.key) return;
      var v = t[o.key], ok = o.options ? o.options.some(function (x) { return String(x[0]) === String(v); }) : v !== undefined;
      out[o.key] = ok ? v : o["default"];
    });
    out.home_shows = out.home_shows === "all" ? Infinity : (parseInt(out.home_shows, 10) || 3);
    if (!Array.isArray(out.socials_hide)) out.socials_hide = [];
    return out;
  }
  // One person's social links for this site, in order, with logos, minus the ones hidden here:
  // [{ key, label, url, svg }] where svg is the logo in brand or site colors (options.socials_color).
  function socialLinks(person, options) {
    var o = options || siteOptions({}), so = (person && person.socials) || {}, brand = o.socials_color !== "site";
    return SOCIALS.filter(function (x) { return so[x[0]] && o.socials_hide.indexOf(x[0]) < 0; })
      .map(function (x) { return { key: x[0], label: x[1], url: so[x[0]], svg: socialIcon(x[0], { brand: brand, size: o.socials_size === "small" ? 16 : o.socials_size === "big" ? 28 : 20 }) }; });
  }

  // Live right now (Dashboard → Live → Go live): { url, title, since, embed } or null. Stops showing after 12 hours.
  function liveNow(live) {
    if (!live || !live.url || !/^https:\/\//i.test(live.url)) return null;
    var since = live.started_at ? Date.parse(live.started_at) : NaN;
    if (!isNaN(since) && Date.now() - since > 12 * 3600 * 1000) return null;
    return { url: live.url, title: live.title || "", since: live.started_at || "", embed: liveEmbed(live.url) };
  }
  // A player address for a stream: Twitch channels, and YouTube streams (a watch, live or youtu.be link).
  function liveEmbed(url, host) {
    var u = String(url || ""), m = u.match(/twitch\.tv\/([A-Za-z0-9_]{3,25})(?:\/?$|\?)/);
    if (m) return "https://player.twitch.tv/?channel=" + m[1] + "&parent=" + encodeURIComponent(host || (typeof location !== "undefined" ? location.hostname : "localhost"));
    m = u.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|live\/)|youtu\.be\/)([\w-]{11})/);
    return m ? "https://www.youtube-nocookie.com/embed/" + m[1] + "?autoplay=1" : "";
  }
  // Where to listen to one episode, the way the site chose (Design → Options → Listen buttons):
  // [{ label, url }]. Falls back to the podcast's Apple or Spotify page when an episode has no link of its own.
  function listenLinks(ep, d) {
    var p = (d && d.profile) || {}, how = ((d && d.options) || siteOptions({})).listen_style;
    // the whole show (no episode): the podcast's own pages, or the newest episode's when those aren't set
    var first = !ep && d && d.episodes && d.episodes[0];
    var apple = (ep && ep.apple) || p.apple_url || (first && first.apple) || (ep && ep.link) || "", spotify = (ep && ep.spotify) || p.spotify_url || (first && first.spotify) || "";
    var out = [];
    if (how !== "spotify" && apple) out.push({ key: "apple_podcasts", label: "Apple Podcasts", url: apple });
    if (how !== "apple" && spotify) out.push({ key: "spotify", label: "Spotify", url: spotify });
    if (!out.length && (apple || spotify)) out.push({ key: apple ? "apple_podcasts" : "spotify", label: apple ? "Apple Podcasts" : "Spotify", url: apple || spotify });
    return out;
  }

  var CSB = { showView: showView, showList: showList, dedupeShows: dedupeShows, signup: signup, init: init, load: load, elsewhere: elsewhere, homeCatalog: homeCatalog, homeArrange: homeArrange, homeFromSections: homeFromSections, SOCIALS: SOCIALS, COLUMN_SOCIALS: COLUMN_SOCIALS, socialsOf: socialsOf, SOCIAL_ICONS: SOCIAL_ICONS, socialIcon: socialIcon, SITE_OPTIONS: SITE_OPTIONS, liveEmbed: liveEmbed, listenLinks: listenLinks, siteOptions: siteOptions, socialLinks: socialLinks, COASTER_ITEMS: COASTER_ITEMS, COASTER_PAGE: COASTER_PAGE, coasterPageStyle: coasterPage, coasterPlan: coasterPlan, coasterOrder: coasterOrder, forum: forum, chat: chat, reportButton: reportButton, fans: fans, blog: blog, markdown: markdown, videoEmbed: videoEmbed, press: press, device: device, name: name, api: api, version: "1.5" };
  root.CSB = CSB;
})(typeof window !== "undefined" ? window : globalThis);
