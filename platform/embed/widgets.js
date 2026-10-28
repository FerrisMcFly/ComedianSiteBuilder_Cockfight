/* ComicTable embed: put a comic's live ComicTable content on any website.
 *
 *   <div data-comictable="shows"></div>              upcoming shows with ticket buttons
 *   <div data-comictable="fans"></div>               fan list sign-up (when the fan list is on)
 *   <div data-comictable="episodes" data-limit="5"></div>
 *   <div data-comictable="videos" data-limit="6"></div>
 *   <div data-comictable="posts" data-limit="3"></div>  latest blog posts (links go to data-post-url + slug, if given)
 *   <script src="https://comictable.com/embed.js" data-site="lev-fer" data-accent="#e8402b"></script>
 *
 * Styles are light and inherit the page's font and colors, so it fits whatever site it's dropped into.
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
    ".ct-when{min-width:84px}.ct-when b{display:block;font-size:1.15em}.ct-dim{opacity:.65;font-size:.9em}" +
    ".ct-where{flex:1;min-width:0}.ct-where b{display:block}" +
    ".ct-btn{display:inline-block;border-radius:999px;padding:.45em 1em;font-weight:700;text-decoration:none;white-space:nowrap;border:2px solid var(--ct-accent);color:inherit}" +
    ".ct-btn.solid{background:var(--ct-accent);border-color:var(--ct-accent);color:#fff}" +
    ".ct-tag{display:inline-block;font-size:.75em;font-weight:700;border:1px solid currentColor;border-radius:999px;padding:.1em .6em;margin-left:.4em;opacity:.8}" +
    ".ct-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px}.ct-grid a{text-decoration:none;color:inherit}.ct-grid img{width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:8px;display:block}.ct-grid b{display:block;margin-top:6px;line-height:1.3}" +
    ".ct-fans form{display:grid;gap:8px;grid-template-columns:1fr 1fr}.ct-fans input,.ct-fans select{font:inherit;padding:.6em .7em;border:1px solid rgba(127,127,127,.4);border-radius:8px;width:100%;background:transparent;color:inherit}" +
    ".ct-fans .ct-full{grid-column:1/-1}.ct-picks{display:grid;border:1px solid rgba(127,127,127,.4);border-radius:8px;overflow:hidden}.ct-picks:empty{display:none}.ct-picks button{font:inherit;text-align:left;padding:.5em .7em;border:0;border-bottom:1px solid rgba(127,127,127,.25);background:transparent;color:inherit;cursor:pointer}" +
    ".ct-msg{min-height:1.3em;font-weight:600}.ct-by{font-size:.75em;opacity:.5;margin-top:8px}.ct-by a{color:inherit}" +
    "@media(max-width:560px){.ct-row{flex-wrap:wrap}.ct-fans form{grid-template-columns:1fr}}";
  var st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);

  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    for (var k in (attrs || {})) { var v = attrs[k]; if (v == null || v === false) continue; if (k === "text") e.textContent = v; else if (k.slice(0, 2) === "on") e.addEventListener(k.slice(2), v); else e.setAttribute(k, v); }
    [].concat(kids || []).forEach(function (c) { if (c != null && c !== false) e.append(c.nodeType ? c : String(c)); });
    return e;
  }
  var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  var day = function (iso) { return new Date(String(iso).slice(0, 10) + "T12:00:00"); };
  var nice = function (iso) { var d = day(iso); return MON[d.getMonth()] + " " + d.getDate() + ", " + d.getFullYear(); };
  var limitOf = function (box, n) { var l = parseInt(box.getAttribute("data-limit"), 10); return l > 0 ? l : n; };

  var R = {
    shows: function (box, d) {
      var list = d.shows.slice(0, limitOf(box, 50));
      if (!list.length) return [el("p", { class: "ct-dim", text: box.getAttribute("data-empty") || "No upcoming shows right now." })];
      var people = {}; d.people.forEach(function (p) { people[p.id] = p.name; });
      var many = d.people.length > 1;
      return list.map(function (s) {
        var t = day(s.date), act;
        if (s.status === "sold_out") act = el("span", { class: "ct-tag", text: "Sold out" });
        else if (s.status === "cancelled") act = el("span", { class: "ct-tag", text: "Cancelled" });
        else if (s.tickets) act = el("a", { class: "ct-btn solid", href: s.tickets, target: "_blank", rel: "noopener", text: s.status === "free" ? "RSVP" : "Tickets" });
        else act = el("span", { class: "ct-dim", text: "Tickets soon" });
        return el("div", { class: "ct-row" }, [
          el("div", { class: "ct-when" }, [el("b", { text: MON[t.getMonth()] + " " + t.getDate() }), el("span", { class: "ct-dim", text: DOW[t.getDay()] + (s.time ? " · " + s.time : "") })]),
          el("div", { class: "ct-where" }, [el("b", null, [s.venue || s.city, s.status === "few_left" ? el("span", { class: "ct-tag", text: "Few left" }) : null]),
            el("span", { class: "ct-dim", text: [s.city, many && s.person ? people[s.person] : "", s.note].filter(Boolean).join(" · ") })]),
          act]);
      });
    },
    episodes: function (box, d) {
      return d.episodes.slice(0, limitOf(box, 5)).map(function (e) {
        return el("div", { class: "ct-row" }, [el("div", { class: "ct-where" }, [el("b", { text: (e.number ? e.number + ". " : "") + e.title }), el("span", { class: "ct-dim", text: [nice(e.posted), e.length].filter(Boolean).join(" · ") })]),
          e.link ? el("a", { class: "ct-btn", href: e.link, target: "_blank", rel: "noopener", text: "Listen" }) : null]);
      });
    },
    videos: function (box, d) {
      return [el("div", { class: "ct-grid" }, d.videos.slice(0, limitOf(box, 6)).map(function (v) {
        return el("a", { href: v.link, target: "_blank", rel: "noopener" }, [el("img", { src: v.thumbnail, alt: "", loading: "lazy" }), el("b", { text: v.title })]);
      }))];
    },
    posts: function (box, d) {
      var base = box.getAttribute("data-post-url");
      return [el("div", { class: "ct-grid" }, d.posts.slice(0, limitOf(box, 3)).map(function (p) {
        return el(base ? "a" : "div", { href: base ? base + p.slug : null }, [p.cover ? el("img", { src: p.cover, alt: "", loading: "lazy" }) : null, el("b", { text: p.title }), el("span", { class: "ct-dim", text: nice(p.date) })]);
      }))];
    },
    fans: function (box, d) {
      if (!d.features.fans) return [];
      var chosen = null, seq = 0, timer;
      var email = el("input", { type: "email", placeholder: "Email", "aria-label": "Email", autocomplete: "email" });
      var city = el("input", { placeholder: "Your city", "aria-label": "Your city", autocomplete: "off" });
      var picks = el("div", { class: "ct-picks ct-full", role: "listbox", "aria-label": "Cities" });
      var radius = el("select", { "aria-label": "How far would you go?" }, [["25", "Within 25 miles"], ["50", "Within 50 miles"], ["100", "Within 100 miles"], ["250", "Within 250 miles"]].map(function (o) { return el("option", { value: o[0], text: o[1], selected: o[0] === "50" ? "selected" : null }); }));
      var msg = el("div", { class: "ct-msg ct-full", role: "status", "aria-live": "polite" });
      var send = el("button", { class: "ct-btn solid", type: "submit", text: box.getAttribute("data-button") || "Sign me up" });
      city.addEventListener("input", function () {
        chosen = null; clearTimeout(timer); var my = ++seq, q = city.value;
        timer = setTimeout(function () { CSB.fans.places(q).then(function (list) { if (my !== seq) return; picks.replaceChildren.apply(picks, list.map(function (p) { return el("button", { type: "button", role: "option", text: p.label, onclick: function () { chosen = p; city.value = p.label; picks.replaceChildren(); } }); })); }); }, 200);
      });
      var form = el("form", { novalidate: "novalidate", onsubmit: function (e) {
        e.preventDefault();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.value.trim())) { msg.textContent = "Add your email."; email.focus(); return; }
        if (!chosen) { msg.textContent = "Pick your city from the list as you type."; city.focus(); return; }
        send.disabled = true; msg.textContent = "";
        CSB.fans.join({ email: email.value.trim(), placeId: chosen.id, radius: +radius.value }).then(function () { send.disabled = false; msg.textContent = "You're on the list. You'll hear about shows near " + chosen.label + "."; },
          function (er) { send.disabled = false; msg.textContent = er.message; });
      } }, [email, city, picks, radius, send, msg]);
      return [el("div", { class: "ct-fans" }, [form])];
    }
  };

  var boxes = [].slice.call(document.querySelectorAll("[data-comictable]"));
  if (!boxes.length) return;
  CSB.load().then(function (d) {
    boxes.forEach(function (box) {
      var kind = box.getAttribute("data-comictable"), r = R[kind];
      if (!r) return;
      box.classList.add("ct-w");
      box.replaceChildren.apply(box, r(box, d).concat(box.hasAttribute("data-no-credit") ? [] : [el("div", { class: "ct-by" }, ["Powered by ", el("a", { href: "https://comictable.com", target: "_blank", rel: "noopener", text: "ComicTable" })])]));
    });
  }, function (e) { if (window.console) console.warn("ComicTable embed couldn't load", e); });
})();
