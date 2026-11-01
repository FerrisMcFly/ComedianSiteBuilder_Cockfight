/* ComicTable embed: put a comic's live ComicTable content on any website (Squarespace, Wix, WordPress, hand-made).
 *
 * 1. Ready-made widgets. Drop a box where it should go:
 *   <div data-comictable="shows"></div>              upcoming shows with ticket buttons (data-limit="5")
 *   <div data-comictable="next"></div>               just the next show, as a banner
 *   <div data-comictable="profile"></div>            photo, name, title and bio from their Coaster
 *   <div data-comictable="socials"></div>            their social links
 *   <div data-comictable="links"></div>              their links, in their order
 *   <div data-comictable="videos" data-limit="6"></div>   latest videos
 *   <div data-comictable="shorts" data-limit="6"></div>   featured Shorts, upright
 *   <div data-comictable="podcast"></div>            the whole-show player and Listen buttons
 *   <div data-comictable="episodes" data-limit="5"></div>
 *   <div data-comictable="news"></div>               their announcements and pinned news
 *   <div data-comictable="live"></div>               a "Live now" banner while they're streaming (empty otherwise)
 *   <div data-comictable="merch"></div>              merch cards
 *   <div data-comictable="press"></div>              press kit: photos, bios, credits, booking contact
 *   <div data-comictable="coaster"></div>           their round Coaster, linking to comictable.com/their-name
 *   <div data-comictable="posts" data-limit="3"></div>  latest blog posts (links go to data-post-url + slug, if given)
 *   <div data-comictable="fans"></div>               fan list sign-up (when the fan list is on)
 *   <script src="https://comictable.com/embed.js" data-site="lev-fer" data-accent="#e8402b"></script>
 *   Widgets inherit the page's font and colors. Every part has a ct- class name, so a designer can restyle any of it.
 *
 * 2. Designer templates: your own HTML, filled in by ComicTable. Put a <template> inside the box; it's repeated for
 *   each item (or used once for next, profile, podcast, live, coaster and press), with {blanks} filled in:
 *   <div data-comictable="shows" data-limit="4">
 *     <template><div class="gig"><b>{venue}</b> {weekday} {month} {day} · {city} <a href="{tickets}" data-ct-if="tickets">Tickets</a>
 *       <em data-ct-if="status">{status}</em></div></template>
 *     <p data-ct-empty>No shows right now.</p>
 *   </div>
 *   data-ct-if="blank" keeps an element only when that blank has something in it; data-ct-unless="blank" the opposite.
 *   data-ct-empty shows only when there's nothing to list. Blanks are always filled as plain text, and links only
 *   take web addresses, so nothing from the data can run code on your page. The blanks for each kind are in BLANKS.
 *
 * 3. For developers: the page also gets window.CSB, the full data kit (CSB.load(), CSB.press(), CSB.fans.join()).
 */
(function () {
  "use strict";
  var me = document.currentScript || [].slice.call(document.querySelectorAll("script[data-site]")).pop();
  var site = me && me.getAttribute("data-site");
  if (!site) { if (window.console) console.warn("ComicTable embed: add data-site=\"your-site-id\" to the script tag."); return; }
  CSB.init({ SITE_ID: site, SUPABASE_URL: EMBED_CFG.SUPABASE_URL, SUPABASE_ANON_KEY: EMBED_CFG.SUPABASE_ANON_KEY });
  var accent = (me.getAttribute("data-accent") || "").match(/^#[0-9a-f]{3,8}$/i) ? me.getAttribute("data-accent") : "currentColor";

  var css = ".ct-w{font:inherit;color:inherit;--ct-accent:" + accent + "}.ct-w *{box-sizing:border-box}" +
    ".ct-row{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid rgba(127,127,127,.25)}" +
    ".ct-when{min-width:100px}.ct-when b{display:block;font-size:1.15em}.ct-dim{opacity:.65;font-size:.9em}" +
    ".ct-where{flex:1;min-width:0}.ct-where b{display:block}" +
    ".ct-btn{display:inline-block;border-radius:999px;padding:.45em 1em;font-weight:700;text-decoration:none;white-space:nowrap;border:2px solid var(--ct-accent);color:inherit}" +
    ".ct-btn.solid{background:var(--ct-accent);border-color:var(--ct-accent);color:#fff}" +
    ".ct-btns{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}" +
    ".ct-tag{display:inline-block;font-size:.75em;font-weight:700;border:1px solid currentColor;border-radius:999px;padding:.1em .6em;margin-left:.4em;opacity:.8}" +
    ".ct-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px}.ct-grid a{text-decoration:none;color:inherit}.ct-grid img{width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:8px;display:block}.ct-grid b{display:block;margin-top:6px;line-height:1.3}" +
    ".ct-grid.ct-tall{grid-template-columns:repeat(auto-fill,minmax(140px,1fr))}.ct-grid.ct-tall img{aspect-ratio:9/16}.ct-grid.ct-sq img{aspect-ratio:1/1}" +
    ".ct-next{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:12px;padding:14px 16px;border:2px solid var(--ct-accent);border-radius:12px}" +
    ".ct-live{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px 16px;border-radius:12px;background:var(--ct-accent);color:#fff}.ct-live a{color:inherit;font-weight:700}" +
    ".ct-live i{display:inline-block;width:10px;height:10px;border-radius:50%;background:#fff;margin-right:8px;animation:ct-pulse 1.4s infinite}@keyframes ct-pulse{50%{opacity:.3}}" +
    ".ct-profile{display:flex;gap:18px;align-items:flex-start;flex-wrap:wrap}.ct-profile img{width:140px;height:140px;object-fit:cover;border-radius:12px}.ct-profile div{flex:1 1 240px;min-width:0}.ct-profile h3{margin:0 0 4px;font-size:1.6em}.ct-profile p{margin:.5em 0 0;white-space:pre-line}" +
    ".ct-list{display:grid;gap:8px}.ct-list a{display:block;padding:12px 14px;border:2px solid var(--ct-accent);border-radius:999px;text-align:center;font-weight:700;text-decoration:none;color:inherit}" +
    ".ct-socials{display:flex;flex-wrap:wrap;gap:10px}.ct-socials a{display:inline-flex;align-items:center;gap:6px;color:inherit;text-decoration:none;font-weight:600}.ct-socials svg{width:20px;height:20px}" +
    ".ct-player{width:100%;height:232px;border:0;border-radius:12px}" +
    ".ct-card{padding:14px 0;border-bottom:1px solid rgba(127,127,127,.25)}.ct-card b{display:block;font-size:1.1em}.ct-card img{width:100%;max-height:320px;object-fit:cover;border-radius:8px;margin-bottom:8px}" +
    ".ct-coaster{display:inline-flex;flex-direction:column;align-items:center;gap:8px;color:inherit;text-decoration:none;font-weight:700}.ct-coaster span{width:160px;height:160px;border-radius:50%;padding:12px;background:#EFE6D2;box-shadow:inset 0 0 0 3px rgba(120,95,60,.25),0 10px 22px rgba(0,0,0,.25)}" +
    ".ct-coaster img{width:100%;height:100%;object-fit:cover;border-radius:50%;display:block}" +
    ".ct-press h4{margin:1.2em 0 .4em}.ct-press ul{margin:0;padding-left:1.2em}" +
    ".ct-fans form{display:grid;gap:8px;grid-template-columns:1fr 1fr}.ct-fans input,.ct-fans select{font:inherit;padding:.6em .7em;border:1px solid rgba(127,127,127,.4);border-radius:8px;width:100%;background:transparent;color:inherit}" +
    ".ct-fans .ct-full{grid-column:1/-1}.ct-picks{display:grid;border:1px solid rgba(127,127,127,.4);border-radius:8px;overflow:hidden}.ct-picks:empty{display:none}.ct-picks button{font:inherit;text-align:left;padding:.5em .7em;border:0;border-bottom:1px solid rgba(127,127,127,.25);background:transparent;color:inherit;cursor:pointer}" +
    ".ct-msg{min-height:1.3em;font-weight:600}.ct-by{font-size:.75em;opacity:.5;margin-top:8px}.ct-by a{color:inherit}" +
    "@media(max-width:560px){.ct-row{flex-wrap:wrap}.ct-fans form{grid-template-columns:1fr}}";
  var st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);

  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    for (var k in (attrs || {})) { var v = attrs[k]; if (v == null || v === false) continue; if (k === "text") e.textContent = v; else if (k.slice(0, 2) === "on") e.addEventListener(k.slice(2), v); else e.setAttribute(k, v); }
    [].concat(kids || []).forEach(function (c) { if (c != null && c !== false && c !== "") e.append(c.nodeType ? c : String(c)); });
    return e;
  }
  var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  var day = function (iso) { return new Date(String(iso).slice(0, 10) + "T12:00:00"); };
  var nice = function (iso) { if (!iso) return ""; var d = day(iso); return MON[d.getMonth()] + " " + d.getDate() + ", " + d.getFullYear(); };
  var limitOf = function (box, n) { var l = parseInt(box.getAttribute("data-limit"), 10); return l > 0 ? l : n; };
  var safeUrl = function (u) { u = String(u || "").trim(); return /^(https?:\/\/|mailto:)/i.test(u) ? u : ""; };
  var a = function (cls, href, text) { href = safeUrl(href); return href ? el("a", { class: cls, href: href, target: href.indexOf("mailto:") ? "_blank" : null, rel: "noopener", text: text }) : null; };
  var PLAIN = { instagram: "Instagram", youtube: "YouTube", tiktok: "TikTok", twitter: "X", website: "Website" };

  /* ---------- the data each kind offers: plain text blanks, the same for widgets and designer templates ---------- */
  var BLANKS = {
    shows: function (d) {
      var people = {}; d.people.forEach(function (p) { people[p.id] = p.name; });
      return d.shows.filter(function (s) { return s.status !== "cancelled"; }).map(function (s) {
        var t = day(s.date);
        return { date: nice(s.date), day: String(t.getDate()), month: MON[t.getMonth()], weekday: DOW[t.getDay()], time: s.time || "", venue: s.venue || s.city || "", city: s.city || "",
          tickets: s.status === "sold_out" ? "" : safeUrl(s.tickets), status: s.status === "sold_out" ? "Sold out" : s.status === "few_left" ? "A few left" : s.status === "free" ? "Free" : "",
          note: s.note || "", who: d.people.length > 1 && s.person ? people[s.person] || "" : "" };
      });
    },
    next: function (d) { return BLANKS.shows(d).filter(function (s) { return s.status !== "Sold out"; }).slice(0, 1); },
    profile: function (d) {
      var p = d.people[0] || {}, prof = d.profile || {};
      return p.name ? [{ name: p.name, title: p.title || "", bio: (d.people.length > 1 ? prof.about : "") || p.bio || prof.about || "", tagline: prof.tagline || "", photo: safeUrl(p.photo),
        coaster: p.handle ? "https://comictable.com/" + encodeURIComponent(p.handle) : "", press: p.comic ? "https://comictable.com/press/" + encodeURIComponent(p.comic) : "" }] : [];
    },
    socials: function (d) { var p = d.people[0]; return p ? CSB.socialLinks(p, d.options || {}).map(function (x) { return { label: x.label, url: safeUrl(x.url), svg: x.svg }; }).filter(function (x) { return x.url; }) : []; },
    links: function (d) { return (d.links || []).map(function (l) { return { label: l.label || "", url: safeUrl(l.url) }; }).filter(function (l) { return l.url; }); },
    videos: function (d) { return d.videos.filter(function (v) { return !v.short; }).map(function (v) { return { title: v.title || "", url: safeUrl(v.link), thumbnail: safeUrl(v.thumbnail), date: nice(v.published) }; }); },
    shorts: function (d) { return d.videos.filter(function (v) { return v.short; }).sort(function (x, y) { return (y.featured ? 1 : 0) - (x.featured ? 1 : 0); }).map(function (v) { return { title: v.title || "", url: safeUrl(v.link), thumbnail: safeUrl(v.thumbnail) }; }); },
    episodes: function (d) { return d.episodes.map(function (e) { return { number: e.number ? String(e.number) : "", title: e.title || "", date: nice(e.posted), length: e.length || "", url: safeUrl(e.link), show: e.show || "", image: safeUrl(e.image) }; }); },
    podcast: function (d) {
      var p = d.profile || {}, ep = d.episodes[0], links = CSB.listenLinks(null, d);
      var name = (ep && ep.show) || p.podcast_name || "";
      var player = CSB.podcastEmbed(p.spotify_url) || CSB.podcastEmbed(p.apple_url) || "";
      if (!name && !links.length && !player) return [];
      var by = function (k) { var x = links.filter(function (l) { return l.key === k; })[0]; return x ? safeUrl(x.url) : ""; };
      return [{ name: name, player: safeUrl(player), apple: by("apple_podcasts"), spotify: by("spotify"), latest: ep ? ep.title : "", latest_url: ep ? safeUrl(ep.link) : "" }];
    },
    news: function (d) { return (d.news || []).map(function (n) { return { headline: n.headline || "", text: n.text || "", url: safeUrl(n.link), button: n.button || (n.link ? "More" : ""), image: safeUrl(n.image) }; }); },
    live: function (d) { return d.live ? [{ url: safeUrl(d.live.url), title: d.live.title || "" }] : []; },
    merch: function (d) { return (d.merch || []).map(function (m) { return { name: m.name || "", price: m.price || "", image: safeUrl(m.image), url: safeUrl(m.link) }; }); },
    coaster: function (d) { var p = d.people[0]; return p && p.handle ? [{ name: p.name, photo: safeUrl(p.photo), url: "https://comictable.com/" + encodeURIComponent(p.handle) }] : []; },
    posts: function (d, box) { var base = box.getAttribute("data-post-url"); return d.posts.map(function (p) { return { title: p.title || "", date: nice(p.date), image: safeUrl(p.cover), url: base ? safeUrl(base + p.slug) : "" }; }); },
    press: function (d) {
      var p = d.people[0];
      if (!p || !p.comic) return Promise.resolve([]);
      return CSB.press(p.comic).then(function (k) {
        if (!k) return [];
        return [{ name: k.name, title: k.title, short: k.short, long: k.long, credits: k.credits.join("\n"), booking: k.booking, photo: safeUrl((k.photos[0] || {}).web), page: safeUrl(k.link),
          photos: k.photos.map(function (ph) { return { web: safeUrl(ph.web), url: safeUrl(ph.url), credit: ph.credit }; }), creditList: k.credits }];
      });
    }
  };
  var SINGLE = { next: 1, profile: 1, podcast: 1, live: 1, coaster: 1, press: 1 };

  /* ---------- ready-made widgets ---------- */
  var R = {
    shows: function (list, box) {
      if (!list.length) return [el("p", { class: "ct-dim", text: box.getAttribute("data-empty") || "No upcoming shows right now." })];
      return list.map(function (s) {
        var act = s.status === "Sold out" ? el("span", { class: "ct-tag", text: "Sold out" }) : s.tickets ? a("ct-btn solid", s.tickets, s.status === "Free" ? "RSVP" : "Tickets") : el("span", { class: "ct-dim", text: "Tickets soon" });
        return el("div", { class: "ct-row" }, [
          el("div", { class: "ct-when" }, [el("b", { text: s.month + " " + s.day }), el("span", { class: "ct-dim", text: s.weekday + (s.time ? " \u00b7 " + s.time : "") })]),
          el("div", { class: "ct-where" }, [el("b", null, [s.venue, s.status === "A few left" ? el("span", { class: "ct-tag", text: "Few left" }) : null]),
            el("span", { class: "ct-dim", text: [s.city, s.who, s.note].filter(Boolean).join(" \u00b7 ") })]), act]);
      });
    },
    next: function (s, box) {
      if (!s) return [el("p", { class: "ct-dim", text: box.getAttribute("data-empty") || "No upcoming shows right now." })];
      return [el("div", { class: "ct-next" }, [el("div", null, [el("span", { class: "ct-dim", text: box.getAttribute("data-label") || "Next show" }), el("b", { style: "display:block;font-size:1.2em", text: s.weekday + " " + s.month + " " + s.day + " \u00b7 " + s.venue }), el("span", { class: "ct-dim", text: [s.city, s.time, s.status].filter(Boolean).join(" \u00b7 ") })]),
        s.tickets ? a("ct-btn solid", s.tickets, "Tickets") : null])];
    },
    profile: function (p) {
      if (!p) return [];
      return [el("div", { class: "ct-profile" }, [p.photo ? el("img", { src: p.photo, alt: p.name }) : null, el("div", null, [el("h3", { text: p.name }), p.title ? el("span", { class: "ct-dim", text: p.title }) : null, p.bio ? el("p", { text: p.bio }) : null])])];
    },
    socials: function (list) {
      return [el("div", { class: "ct-socials" }, list.map(function (x) { var l = a("", x.url, ""); l.setAttribute("aria-label", x.label); l.insertAdjacentHTML("beforeend", x.svg || ""); l.append(x.label); return l; }))];
    },
    links: function (list) { return [el("div", { class: "ct-list" }, list.map(function (l) { return a("", l.url, l.label); }))]; },
    videos: function (list) { return [el("div", { class: "ct-grid" }, list.map(function (v) { return el("a", { href: v.url, target: "_blank", rel: "noopener" }, [v.thumbnail ? el("img", { src: v.thumbnail, alt: "", loading: "lazy" }) : null, el("b", { text: v.title })]); }))]; },
    shorts: function (list) { return [el("div", { class: "ct-grid ct-tall" }, list.map(function (v) { return el("a", { href: v.url, target: "_blank", rel: "noopener", "aria-label": v.title }, [v.thumbnail ? el("img", { src: v.thumbnail, alt: "", loading: "lazy" }) : null]); }))]; },
    episodes: function (list) {
      return list.map(function (e) { return el("div", { class: "ct-row" }, [el("div", { class: "ct-where" }, [el("b", { text: (e.number ? e.number + ". " : "") + e.title }), el("span", { class: "ct-dim", text: [e.date, e.length].filter(Boolean).join(" \u00b7 ") })]), a("ct-btn", e.url, "Listen")]); });
    },
    podcast: function (p) {
      if (!p) return [];
      return [p.name ? el("b", { style: "display:block;font-size:1.2em;margin-bottom:8px", text: p.name }) : null,
        p.player ? el("iframe", { class: "ct-player", src: p.player, title: (p.name || "Podcast") + " player", loading: "lazy", allow: "autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" }) : null,
        el("div", { class: "ct-btns" }, [a("ct-btn", p.spotify, "Spotify"), a("ct-btn", p.apple, "Apple Podcasts")])];
    },
    news: function (list) { return list.map(function (n) { return el("div", { class: "ct-card" }, [n.image ? el("img", { src: n.image, alt: "", loading: "lazy" }) : null, el("b", { text: n.headline }), n.text ? el("span", { text: n.text }) : null, n.url ? el("div", { class: "ct-btns" }, [a("ct-btn", n.url, n.button)]) : null]); }); },
    live: function (l) { return l ? [el("div", { class: "ct-live" }, [el("span", null, [el("i", { "aria-hidden": "true" }), "Live now" + (l.title ? ": " + l.title : "")]), a("", l.url, "Watch")])] : []; },
    merch: function (list) { return [el("div", { class: "ct-grid ct-sq" }, list.map(function (m) { return el(m.url ? "a" : "div", { href: m.url || null, target: m.url ? "_blank" : null, rel: "noopener" }, [m.image ? el("img", { src: m.image, alt: "", loading: "lazy" }) : null, el("b", { text: m.name }), m.price ? el("span", { class: "ct-dim", text: m.price }) : null]); }))]; },
    coaster: function (c, box) { return c ? [el("a", { class: "ct-coaster", href: c.url, target: "_blank", rel: "noopener" }, [el("span", null, [c.photo ? el("img", { src: c.photo, alt: c.name }) : null]), box.getAttribute("data-label") || "My Coaster"])] : []; },
    posts: function (list) { return [el("div", { class: "ct-grid" }, list.map(function (p) { return el(p.url ? "a" : "div", { href: p.url || null }, [p.image ? el("img", { src: p.image, alt: "", loading: "lazy" }) : null, el("b", { text: p.title }), el("span", { class: "ct-dim", text: p.date })]); }))]; },
    press: function (k) {
      if (!k) return [];
      return [el("div", { class: "ct-press" }, [el("h3", { style: "margin:0", text: k.name }), k.title ? el("span", { class: "ct-dim", text: k.title }) : null,
        k.photos.length ? el("div", { class: "ct-grid ct-sq", style: "margin-top:12px" }, k.photos.map(function (ph) { return el("a", { href: ph.url, target: "_blank", rel: "noopener", download: "" }, [el("img", { src: ph.web, alt: k.name, loading: "lazy" }), ph.credit ? el("span", { class: "ct-dim", text: "Photo: " + ph.credit }) : null]); })) : null,
        k.short ? el("h4", { text: "Short bio" }) : null, k.short ? el("p", { text: k.short }) : null,
        k.long ? el("h4", { text: "Bio" }) : null, k.long ? el("p", { style: "white-space:pre-line", text: k.long }) : null,
        k.creditList.length ? el("h4", { text: "Credits" }) : null, k.creditList.length ? el("ul", null, k.creditList.map(function (c) { return el("li", { text: c }); })) : null,
        k.booking ? el("h4", { text: "Booking" }) : null, k.booking ? el("p", { style: "white-space:pre-line", text: k.booking }) : null,
        el("div", { class: "ct-btns" }, [a("ct-btn", k.page, "Full press kit")])])];
    },
    fans: function (x, box, d) {
      if (!d.features.fans) return [];
      var name = el("input", { placeholder: "Name", "aria-label": "Name", autocomplete: "name", maxlength: "80" });
      var email = el("input", { type: "email", placeholder: "Email", "aria-label": "Email", autocomplete: "email" });
      var zip = el("input", { class: "ct-full", placeholder: "ZIP code", "aria-label": "ZIP code", inputmode: "numeric", autocomplete: "postal-code", maxlength: "5" });
      var msg = el("div", { class: "ct-msg ct-full", role: "status", "aria-live": "polite" });
      var send = el("button", { class: "ct-btn solid", type: "submit", text: box.getAttribute("data-button") || "Sign me up" });
      var fine = el("small", { class: "ct-full", style: "opacity:.7" }, [document.createTextNode("Only emails about shows near you. Unsubscribe anytime. "), el("a", { href: "https://comictable.com/privacy", text: "Privacy", style: "color:inherit" })]);
      var form = el("form", { novalidate: "novalidate", onsubmit: function (e) {
        e.preventDefault();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.value.trim())) { msg.textContent = "Add your email."; email.focus(); return; }
        var z = zip.value.replace(/\D/g, "");
        if (z.length !== 5) { msg.textContent = "Add your 5-digit ZIP code."; zip.focus(); return; }
        send.disabled = true; msg.textContent = "";
        CSB.fans.join({ email: email.value.trim(), name: name.value.trim(), zip: z, source: "embed" }).then(function (r) { send.disabled = false; msg.textContent = r === "updated" ? "You're already on the list. Thanks!" : "You're on the list. You'll hear about shows near you."; },
          function (er) { send.disabled = false; msg.textContent = er.message; });
      } }, [name, email, zip, send, msg, fine]);
      return [el("div", { class: "ct-fans" }, [form])];
    }
  };

  /* ---------- designer templates: <template> inside the box, {blanks} filled as plain text ---------- */
  var URL_ATTRS = { href: 1, src: 1, srcset: 1, action: 1, poster: 1, "data-src": 1 };
  function fill(node, item) {
    var blank = function (s) { return String(s).replace(/\{([a-z_]+)\}/g, function (m, k) { return k in item && typeof item[k] !== "object" ? String(item[k]) : m; }); };
    // keep or drop elements by whether a blank has something in it
    [].slice.call(node.querySelectorAll ? node.querySelectorAll("[data-ct-if],[data-ct-unless]") : []).forEach(function (e) {
      var k = e.getAttribute("data-ct-if"), u = e.getAttribute("data-ct-unless");
      if ((k && !item[k]) || (u && item[u])) e.remove(); else { e.removeAttribute("data-ct-if"); e.removeAttribute("data-ct-unless"); }
    });
    var walk = document.createTreeWalker(node, 5 /* elements and text */);
    for (var n = walk.currentNode; n; n = walk.nextNode()) {
      if (n.nodeType === 3) { if (n.nodeValue.indexOf("{") >= 0) n.nodeValue = blank(n.nodeValue); continue; }
      if (!n.attributes) continue;
      for (var i = n.attributes.length - 1; i >= 0; i--) {
        var at = n.attributes[i];
        if (/^on/i.test(at.name)) { n.removeAttribute(at.name); continue; }       // no handlers, ever
        if (at.value.indexOf("{") < 0) continue;
        var v = blank(at.value);
        if (URL_ATTRS[at.name.toLowerCase()]) { v = safeUrl(v); if (!v) { n.removeAttribute(at.name); continue; } }
        n.setAttribute(at.name, v);
      }
    }
    return node;
  }
  function fromTemplate(box, tpl, list) {
    var empties = [].slice.call(box.querySelectorAll("[data-ct-empty]"));
    [].slice.call(box.querySelectorAll("[data-ct-made]")).forEach(function (e) { e.remove(); });
    empties.forEach(function (e) { e.hidden = list.length > 0; });
    var frag = document.createDocumentFragment();
    list.forEach(function (item) {
      var copy = fill(tpl.content.cloneNode(true), item);
      [].slice.call(copy.childNodes).forEach(function (c) { if (c.nodeType === 1) c.setAttribute("data-ct-made", ""); else if (c.nodeType === 3 && !c.nodeValue.trim()) c.remove(); });
      frag.appendChild(copy);
    });
    tpl.parentNode.insertBefore(frag, tpl);
  }

  var boxes = [].slice.call(document.querySelectorAll("[data-comictable]"));
  if (!boxes.length) return;
  CSB.load().then(function (d) {
    var made = [];
    Promise.all(boxes.map(function (box) {
      var kind = box.getAttribute("data-comictable");
      if (!R[kind]) { if (window.console) console.warn("ComicTable embed: there's no \"" + kind + "\" box. Try one of: " + Object.keys(R).join(", ")); return null; }
      return Promise.resolve(BLANKS[kind] ? BLANKS[kind](d, box) : []).then(function (all) {
        var list = all.slice(0, SINGLE[kind] ? 1 : limitOf(box, kind === "shows" ? 50 : kind === "episodes" ? 5 : kind === "posts" ? 3 : kind === "links" || kind === "socials" || kind === "news" ? 50 : 6));
        var tpl = box.querySelector("template");
        if (tpl && kind !== "fans") { fromTemplate(box, tpl, list); return; }
        box.classList.add("ct-w");
        box.replaceChildren.apply(box, R[kind](SINGLE[kind] ? list[0] : list, box, d).filter(Boolean));
        if (box.childNodes.length && !box.hasAttribute("data-no-credit")) made.push(box);
      }, function (e) { if (window.console) console.warn("ComicTable embed couldn't load " + kind, e); });
    })).then(function () {
      // one small credit per page, under the last ready-made box (designer templates never get one)
      made.sort(function (x, y) { return x.compareDocumentPosition(y) & 4 ? -1 : 1; });
      var last = made[made.length - 1];
      if (last) last.append(el("div", { class: "ct-by" }, ["Powered by ", el("a", { href: "https://comictable.com", target: "_blank", rel: "noopener", text: "ComicTable" })]));
    });
  }, function (e) { if (window.console) console.warn("ComicTable embed couldn't load", e); });
})();
