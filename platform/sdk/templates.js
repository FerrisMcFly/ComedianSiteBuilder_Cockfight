/* ComicTable template kit (sdk/templates.js). Every site template (sites/<template>/index.html) loads config.js,
   sdk/csb.js and this, then draws its own look from the same pieces, so every template has the same sections and a
   comic can switch templates without losing anything:
     CTT.start(function (k) { ... })   k.el, k.D, k.me, k.t(key, default), k.shows(), k.video(), k.podcast(),
                                       k.socials(), k.join({ ... }), k.has(feature)
   Flavor text (a tabloid's headline, a VHS label's joke) is never baked in: every line comes from k.t(key, default),
   which reads the site's Design settings (the template's theme.json lists them), so the comic can retype it.
   Lines can use {name}, {next_venue}, {next_city}, {next_date} and {next_day}; a line that uses a {next_…} word
   is left off while there's no upcoming show.
   Photo shape (founder, Oct 31): every template offers the comic's photo in the template's own shape or as a round
   Coaster. k.coaster says which; k.coasterPhoto() is the round one, the same everywhere. */
(function (root) {
  "use strict";
  var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    for (var k in (attrs || {})) {
      var v = attrs[k]; if (v === null || v === undefined || v === false) continue;
      if (k === "text") e.textContent = v; else if (k.slice(0, 2) === "on") e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? "" : v);
    }
    [].concat(kids || []).forEach(function (c) { if (c !== null && c !== undefined && c !== false && c !== "") e.append(c.nodeType ? c : String(c)); });
    return e;
  }
  function icon(svg) { var s = el("span", { class: "ctt-ico", "aria-hidden": "true" }); s.innerHTML = svg; return s; }

  function kit(D) {
    var me = D.people[0] || { name: D.site.name, bio: "", photo: "", socials: {} };
    var opt = D.options || {};
    var theme = D.theme || {};
    var showsList = (D.shows || []).filter(function (s) { return s.status !== "cancelled"; }).map(function (s) {
      var d = new Date(s.date + "T12:00:00");
      return { date: s.date, mon: MON[d.getMonth()], day: d.getDate(), dd: ("0" + d.getDate()).slice(-2), mm: ("0" + (d.getMonth() + 1)).slice(-2), dow: DOW[d.getDay()],
        label: DOW[d.getDay()] + " " + MON[d.getMonth()] + " " + d.getDate(), time: s.time, venue: s.venue || s.city, city: s.city, note: s.note,
        tickets: s.status === "sold_out" ? "" : s.tickets, sold: s.status === "sold_out", few: s.status === "few_left", free: s.status === "free" };
    });
    var next = showsList[0];
    var fill = function (txt) {
      // a line about the next show makes no sense without one: it's left off
      if (!next && /\{next_\w+\}/.test(String(txt))) return "";
      return String(txt).replace(/\{(\w+)\}/g, function (m, k) {
        var v = { name: D.site.name, next_venue: next ? next.venue : "", next_city: next ? next.city : "", next_date: next ? next.mon + " " + next.day : "", next_day: next ? next.dow : "" }[k];
        return v === undefined ? m : v;
      });
    };
    var k = {
      el: el, icon: icon, D: D, me: me, MON: MON, DOW: DOW,
      has: function (f) { return f === "fans" || f === "blog" || f === "merch" ? !!D.features[f] : D.features[f] !== false; },
      // a flavor line: what the comic typed in Design, else the template's default. "" switches it off.
      t: function (key, def) { var v = theme[key]; return fill(v === undefined || v === null ? def : v); },
      name: D.site.name,
      bio: (D.profile && D.profile.about) || me.bio || "",
      tagline: (D.profile && D.profile.tagline) || me.title || "",
      photo: me.photo || "",
      // upcoming shows, as many as Design → Options says for the home screen
      shows: function (all) { var n = opt.home_shows === "all" || all ? 999 : Number(opt.home_shows || 3); return showsList.slice(0, n); },
      allShows: showsList.length,
      next: next,
      ticket: function (s, cls, label) {
        if (s.sold) return null;
        if (!s.tickets) return el("span", { class: (cls || "") + " soon", text: "Soon" });
        return el("a", { class: cls || "", href: s.tickets, target: "_blank", rel: "noopener", text: label || (s.free ? "RSVP" : "Tickets") });
      },
      coaster: theme.photo_shape === "coaster" && !!me.photo,
      coasterPhoto: function (cls) {
        return el("div", { class: "ct-coaster " + (cls || "") }, [el("div", { class: "ct-coaster-rim" }, [el("img", { src: me.photo, alt: D.site.name })])]);
      },
      video: function () { var v = (D.videos || []).filter(function (x) { return !x.short; })[0] || (D.videos || [])[0]; return D.features.videos === false ? null : v || null; },
      podcast: function () {
        if (D.features.podcast === false) return null;
        var ep = (D.episodes || [])[0], p = D.profile || {};
        if (!ep && !p.spotify_url && !p.apple_url) return null;
        return { name: (ep && ep.show) || p.podcast_name || "The podcast", art: (ep && ep.image) || "", links: root.CSB.listenLinks(null, D) };
      },
      socials: function () { return root.CSB.socialLinks(me, opt); },
      // the fan list sign-up (name optional, email, ZIP). Labels come from the template; it handles the rest.
      join: function (o) {
        o = o || {};
        if (!D.features.fans || opt.signup_style === "off") return null;
        var email = el("input", { type: "email", placeholder: o.emailPh || "you@email.com", autocomplete: "email", class: o.inputClass || "" });
        var zip = el("input", { placeholder: o.zipPh || "ZIP", inputmode: "numeric", autocomplete: "postal-code", maxlength: "5", class: o.inputClass || "" });
        var msg = el("div", { class: "ctt-msg", role: "status", "aria-live": "polite" });
        var send = el("button", { type: "submit", class: o.buttonClass || "", text: o.button || "Sign me up" });
        var form = el("form", { class: "ctt-join " + (o.formClass || ""), novalidate: true, onsubmit: function (e) {
          e.preventDefault();
          if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.value.trim())) { msg.textContent = "Add your email."; email.focus(); return; }
          var z = zip.value.replace(/\D/g, "");
          if (z.length !== 5) { msg.textContent = "Add your 5-digit ZIP code."; zip.focus(); return; }
          send.disabled = true; msg.textContent = "";
          root.CSB.fans.join({ email: email.value.trim(), zip: z }).then(function (r) {
            send.disabled = false; msg.textContent = r === "updated" ? "You're already on the list. Thanks!" : (o.done || "You're on the list.");
          }, function (er) { send.disabled = false; msg.textContent = er.message; });
        } }, [el("label", { class: o.labelClass || "" }, [o.emailLabel || "Email", email]), el("label", { class: o.labelClass || "" }, [o.zipLabel || "ZIP", zip]), send, msg,
          el("small", { class: "ctt-fine" }, ["Only emails about shows near you. Unsubscribe anytime. ", el("a", { href: "https://comictable.com/privacy", text: "Privacy" })])]);
        return form;
      }
    };
    return k;
  }

  // the round Coaster: a pulp-board coaster with the photo printed on it. Same look in every template.
  var COASTER_CSS = ".ct-coaster{width:min(100%,420px);margin:0 auto;aspect-ratio:1/1;filter:drop-shadow(0 16px 28px rgba(0,0,0,.35))}" +
    ".ct-coaster-rim{width:100%;height:100%;border-radius:50%;padding:7%;box-sizing:border-box;background:#EFE6D2;" +
    "background-image:radial-gradient(rgba(120,95,60,.18) 1px,transparent 1.6px),radial-gradient(rgba(255,255,255,.5) 1px,transparent 1.6px);background-size:7px 7px,11px 11px;" +
    "box-shadow:inset 0 0 0 3px rgba(120,95,60,.18),inset 0 0 0 calc(7% - 6px) #EFE6D2,inset 0 0 0 calc(7% - 4px) rgba(120,95,60,.35)}" +
    ".ct-coaster img{display:block;width:100%;height:100%;object-fit:cover;border-radius:50%}";
  root.CTT = {
    kit: kit,
    start: function (draw) {
      var app = document.getElementById("app");
      root.CSB.load().then(function (D) {
        var k = kit(D), t = D.theme || {};
        document.title = D.site.name + (k.tagline ? " · " + k.tagline : "");
        if (/^#[0-9a-f]{6}$/i.test(t.accent || "")) document.documentElement.style.setProperty("--accent", t.accent);
        if (!document.getElementById("ct-coaster-css")) document.head.append(el("style", { id: "ct-coaster-css", text: COASTER_CSS }));
        app.replaceChildren();
        draw(k, app);
      }, function (e) {
        app.replaceChildren(el("p", { class: "ctt-down", text: "Couldn't load right now. Refresh to try again." }));
        if (root.console) console.warn(e);
      });
    }
  };
})(typeof window !== "undefined" ? window : globalThis);
