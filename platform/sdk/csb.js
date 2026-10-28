/*
 * ComicTable: public data kit.
 *
 * Any front end (theme) can load a comedian's content and run their forum and chat with this one file.
 * No build step and no dependencies. Live chat uses supabase-js if the page loads it, otherwise it polls.
 *
 *   <script src="config.js"></script>          // window.COCKFIGHT_CONFIG = { SITE_ID, SUPABASE_URL, SUPABASE_ANON_KEY }
 *   <script src="sdk/csb.js"></script>
 *   const site = await CSB.load();              // { site, profile, theme, features, community, people, shows, episodes, videos, merch, announcements, links, boards, posts, picks }
 *   Podcasts the comic switched off in Settings → "Podcasts on your site" (profile.podcasts_off, by name) are left out
 *   of episodes and of CSB.elsewhere, so every design follows the same choice.
 *   CSB.elsewhere(people) → the other live ComicTable sites these people are on (a podcast they co-host, say),
 *   each with its latest episode when it's a podcast: [{ id, name, domain, url, podcast, people, episode }]
 *   picks: the comic's Home screen picks, in order (the first is the featured one). A pick made from a show carries
 *   that show's status and drops off once the show has passed. image is its picture; video is a player address
 *   (YouTube or Vimeo) when the pick links to one, so a site can play it right on the home screen.
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
      var people = r[1].filter(visible).map(function (h) {
        return { id: h.id, comic: h.comic_id || "", name: h.name, title: h.title || "", bio: h.bio || "", status: h.status || "", photo: h.photo_url || "",
          socials: { instagram: h.instagram || "", youtube: h.youtube || "", tiktok: h.tiktok || "", twitter: h.twitter || "", website: h.website || "" } };
      });
      var shows = r[2].filter(function (x) { return x.date >= today; }).map(function (x) {
        // person: whose solo date it is. event: a show by the whole site (a live podcast), with lineup = people ids.
        return { id: x.id, person: x.host || "", event: !!x.event, lineup: x.lineup_hosts || [], date: x.date, time: x.time || "", venue: x.venue || "", city: x.city || "", venueId: x.venue_id || null,
          tickets: x.url || "", status: x.status || "on_sale", note: x.note || "" };
      }).sort(function (a, b) { return (a.date + timeKey(a.time)).localeCompare(b.date + timeKey(b.time)); });
      var announcements = r[6].filter(function (a) { return (!a.starts_on || a.starts_on <= today) && (!a.ends_on || a.ends_on >= today); })
        .sort(function (a, b) { return (b.pinned - a.pinned) || (a.sort - b.sort); })
        .map(function (a) { return { id: a.id, text: a.text, link: a.link || "", linkLabel: a.link_label || "", pinned: !!a.pinned }; });
      return {
        site: { id: s.id, name: s.name, domain: s.domain },
        features: s.features || {}, profile: s.profile || {}, theme: s.theme || {}, community: s.community || {},
        people: people, shows: shows,
        episodes: r[3].filter(visible).filter(function (e) { return !podOff(e.show_name); }).map(function (e) { return { id: e.id, number: e.num, title: e.title, posted: e.posted, length: e.length || "", link: e.url || e.audio_url || "", audio: e.audio_url || "", image: e.image_url || "", patreon: e.patreon || "", description: e.blurb || "", show: e.show_name || "" }; }),
        videos: r[4].filter(visible).sort(function (a, b) { return (b.featured - a.featured) || String(b.published || "").localeCompare(String(a.published || "")); })
          .map(function (v) { return { id: v.youtube_id, title: v.title, published: v.published, thumbnail: v.thumbnail_url || ("https://i.ytimg.com/vi/" + v.youtube_id + "/hqdefault.jpg"), link: v.url || ("https://www.youtube.com/watch?v=" + v.youtube_id), featured: !!v.featured, channel: v.channel || "", person: v.host || "" }; }),
        merch: r[5].filter(visible).map(function (m) { return { id: m.id, name: m.name, price: m.price || "", image: m.image_url || "", link: m.url || "" }; }),
        announcements: announcements,
        links: r[7].filter(visible).map(function (l) { return { id: l.id, label: l.label, url: l.url, icon: l.icon || "" }; }),
        boards: r[8].filter(visible).map(function (b) { return { id: b.id, name: b.name, description: b.description || "", locked: !!b.locked }; }),
        posts: r[9].map(post),
        picks: homePicks(r[10], shows, today)
      };
    });
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
    return rows.filter(function (p) { return !p.hidden && (!p.ends_on || p.ends_on >= today) && (!p.show_id || byId[p.show_id]); })
      .map(function (p) {
        var s = p.show_id ? byId[p.show_id] : null;
        return { id: p.id, kind: p.kind || "announcement", headline: p.headline, text: p.body || "", button: p.button_label || "", link: p.link || (s && s.tickets) || "",
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
    // { email, placeId, radius: 25 | 50 | 100 | 250, met?: "where we met", source?: "site" | "qr" | "embed" } → "joined" or "updated"
    // met and source need supabase/16_fan_signup.sql; they're only sent when given, so older databases keep working.
    join: function (o) {
      var body = { p_site: cfg.site, p_email: o.email, p_place: o.placeId, p_radius: o.radius || 50 };
      if (o.met) body.p_met = String(o.met).slice(0, 200);
      if (o.source) body.p_source = o.source;
      return api("rpc/join_fans", { method: "POST", body: body });
    },
    // For a "stop emailing me" link: ?leave=<token>
    leave: function (token) { return api("rpc/leave_fans", { method: "POST", body: { p_token: token } }); }
  };

  /* ---------------- home screen items ----------------
   * Every comic arranges their Home screen item by item: each link, each social, Patreon, each podcast,
   * and the bigger blocks (shows, picks, featured video…). Saved on the site as theme.home_items = [{ key, on }].
   * homeCatalog(data) lists what this site could show right now; homeArrange(catalog, saved) puts it in the
   * comic's order. Anything new lands next to its kind (a new link with the other links), switched on.
   * The dashboard and every design use these same two functions, so they always agree.
   */
  var HOME_GROUPS = ["me", "links", "socials", "support", "picks", "shows", "podcast", "special", "list", "blog", "clips"];
  var HOME_OFF = { clips: true };
  var SOCIALS = [["instagram", "Instagram"], ["youtube", "YouTube"], ["tiktok", "TikTok"], ["twitter", "X"], ["website", "Website"]];
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
    if (f.videos !== false && (d.videos || []).length) add("clips", "clips", "Latest clips", "Your three newest videos");
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

  var CSB = { init: init, load: load, elsewhere: elsewhere, homeCatalog: homeCatalog, homeArrange: homeArrange, homeFromSections: homeFromSections, forum: forum, chat: chat, fans: fans, blog: blog, markdown: markdown, videoEmbed: videoEmbed, press: press, device: device, name: name, api: api, version: "1.4" };
  root.CSB = CSB;
})(typeof window !== "undefined" ? window : globalThis);
