  /* ======================================================
     HOME
     ====================================================== */
  // The Dashboard: everything at a glance, real numbers only (founder's mockup, Oct 29). Each card has View all.
  const svgIco = (id) => { const sp = h("span", { class: "ic", "aria-hidden": "true" }); sp.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + (ICONS[id] || "") + "</svg>"; return sp; };
  const cardHead = (title, onAll, allText) => h("div", { class: "card-head" }, h("h2", { text: title }), onAll ? h("button", { class: "view-all", type: "button", onclick: onAll, text: (allText || "View all") + " →" }) : null);
  // From a comic's dashboard, shows open their Coaster's Shows (added right there); staff go to the site's.
  const goShows = () => (S.me && !S.isPlatform ? goCT("dates") : go("shows"));
  function viewHome(main) {
    const now = new Date();
    const who = (S.me && S.me.name ? S.me.name : S.user || "").split(/\s+/)[0];
    const up = S.shows.filter((s) => s.date >= today()).sort((a, b) => (a.date + to24(a.time)).localeCompare(b.date + to24(b.time)));
    const next = up[0];
    const days = next ? Math.round((parseISO(next.date) - parseISO(today())) / 864e5) : null;
    const todo = [];
    if (!S.hosts.length) todo.push(["Add the comics on this site", "people"]);
    if (F("shows")) { const n = up.filter((s) => !s.url).length; if (n) todo.push([n + " upcoming show" + (n > 1 ? "s" : "") + " with no ticket link", "shows"]); }
    if (F("podcast") && !S.sources.some((s) => s.kind === "podcast")) todo.push(["Connect your podcast so new episodes add themselves", "podcast"]);
    if (F("videos") && !S.sources.some((s) => s.kind === "youtube")) todo.push(["Connect your YouTube channels", "videos"]);
    for (const s of S.sources.filter((s) => s.last_status && /^Error/.test(s.last_status))) todo.push([(s.label || (s.kind === "podcast" ? "Podcast" : "YouTube")) + " import hit a problem: " + s.last_status.replace(/^Error:\s*/, ""), s.kind === "podcast" ? "podcast" : "videos"]);

    // top: big hello, today's date
    main.append(h("div", { class: "page-head dash-head" },
      h("h1", { class: "hello" }, "Welcome back, ", h("em", { text: who + "." })),
      h("div", { class: "dash-date" }, h("b", { text: now.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric", year: "numeric" }) }),
        h("span", { text: next ? "Next up: " + first(next.host) + " in " + (next.city || next.venue) + " " + relDay(next.date) + "." : "Here's what's happening." }))));

    // stat cards: only numbers we really have
    const stat = (ico, label, n, sub, sec, gold) => h("button", { class: "stat", type: "button", onclick: () => go(sec) }, h("span", { class: "ic" + (gold ? " gold" : "") }, svgIco(ico).firstChild),
      h("span", { class: "st-txt" }, h("span", { class: "l", text: label }), h("span", { class: "n", text: n }), sub ? h("span", { class: "s", text: sub }) : null));
    const stats = h("div", { class: "stats" });
    if (F("shows")) stats.append(stat("shows", "Upcoming shows", up.length, next ? (days === 0 ? "Next show tonight" : days === 1 ? "Next show tomorrow" : "Next show in " + days + " days") : "Nothing booked yet", "shows"));
    if (F("podcast")) stats.append(stat("podcast", "Episodes", S.episodes.length, S.episodes[0] ? "Latest: " + shortDate(String(S.episodes.slice().sort((a, b) => String(b.posted).localeCompare(String(a.posted)))[0].posted).slice(0, 10)) : "", "podcast", true));
    if (F("videos")) stats.append(stat("videos", "Videos", S.videos.filter((v) => !v.hidden).length, "", "videos", true));
    const fanStat = F("fans") ? stat("fans", "Fan list", "…", "", "fans", true) : null; if (fanStat) stats.append(fanStat);
    if (F("merch")) stats.append(stat("merch", "Merch items", S.merch.filter((m) => !m.hidden).length, "", "merch", true));
    main.append(stats);

    const grid = h("div", { class: "dash-grid" }); main.append(grid);
    // upcoming shows
    if (F("shows")) {
      const tag = (s) => s.status === "sold_out" ? h("span", { class: "pill", text: "Sold out" }) : s.status === "cancelled" ? h("span", { class: "pill", text: "Cancelled" })
        : s.url ? h("span", { class: "pill ok", text: s.status === "few_left" ? "Few left" : "Tickets live" }) : h("span", { class: "pill warn", text: "No ticket link" });
      grid.append(h("section", { class: "card dash-shows" }, cardHead("Upcoming Shows", () => goShows()),
        up.length ? h("div", { class: "dash-list" }, up.slice(0, 5).map((s) => h("button", { class: "dash-row", type: "button", onclick: () => goShows() },
          h("span", { class: "dl-date" }, h("small", { text: MON[parseISO(s.date).getMonth()] }), h("b", { text: parseISO(s.date).getDate() })),
          h("span", { class: "dl-main" }, h("b", { text: s.venue || s.city || "Show" }), h("span", { text: [s.city, s.time, S.hosts.length > 1 ? first(s.host) : ""].filter(Boolean).join(" · ") })), tag(s))))
          : h("div", { class: "empty" }, h("b", { text: "No shows yet" }), h("button", { class: "btn primary", type: "button", text: "+ Add shows", onclick: () => goShows() }))));
    }
    // latest episode / video
    if (F("podcast") || F("videos")) {
      const ep = S.episodes.slice().sort((a, b) => String(b.posted).localeCompare(String(a.posted)))[0];
      const vid = S.videos.filter((v) => !v.hidden).sort((a, b) => String(b.published).localeCompare(String(a.published)))[0];
      const feeds = S.sources.filter((x) => x.kind === "podcast" || x.kind === "youtube");
      grid.append(h("section", { class: "card dash-media" }, cardHead(F("podcast") && F("videos") ? "Latest Podcast / YouTube" : F("podcast") ? "Latest Episode" : "Latest Video", () => go("podcast")),
        ep || vid ? h("div", { class: "dm-top" },
          vid ? h("img", { class: "dm-thumb", src: vid.thumbnail_url || ("https://i.ytimg.com/vi/" + vid.youtube_id + "/hqdefault.jpg"), alt: "" }) : h("span", { class: "dm-thumb ph" }, svgIco("podcast")),
          h("div", { class: "dm-txt" }, h("b", { text: ep ? (ep.num ? "#" + ep.num + " " : "") + ep.title : vid.title }), h("span", { text: ep ? niceDate(String(ep.posted).slice(0, 10)) : vid.published ? niceDate(String(vid.published).slice(0, 10)) : "" })))
          : h("p", { class: "hint", text: F("podcast") ? "Nothing yet. Connect your feed and new episodes add themselves." : "Nothing yet. Connect your YouTube channel and new videos add themselves." }),
        feeds.length ? h("div", { class: "dm-feeds" }, feeds.map((x) => h("div", { class: "dm-feed" }, svgIco(x.kind === "youtube" ? "videos" : "podcast"), h("b", { text: x.label || (x.kind === "youtube" ? "YouTube" : "Podcast") }),
          h("span", { class: "pill " + (/^Error/.test(x.last_status || "") ? "warn" : "ok"), text: /^Error/.test(x.last_status || "") ? "Problem" : "Connected" }))) ) : null));
    }
    // fans by city (filled in when it loads)
    const fansCard = F("fans") ? h("section", { class: "card dash-fans" }, cardHead("Fans by City", () => go("fans")), h("p", { class: "hint", text: "Loading…" })) : null;
    if (fansCard) grid.append(fansCard);
    // the comic's Coaster and their sites
    const meCard = S.me ? h("section", { class: "card dash-me" }, cardHead("Your Coaster", () => goCT("me"), "Edit"),
      h("div", { class: "dme-top" }, S.me.photo_url ? h("img", { src: S.me.photo_url, alt: "" }) : h("span", { class: "dme-ph", text: (S.me.name || "?").split(/\s+/).map((w) => w[0]).join("").slice(0, 2) }),
        h("div", null, h("b", { class: "dme-name", text: S.me.name }), h("span", { class: "hint", text: S.me.title || "Comedian" }),
          h("p", { text: String(S.me.bio || "").split(/\n/)[0].slice(0, 160) || "Add a short bio on your Coaster." }))),
      h("div", { class: "dme-sites" }, h("a", { class: "dme-site", href: coasterUrl(S.me), target: "_blank", rel: "noopener" }, h("b", { text: "Coaster" }), h("span", { text: coasterUrl(S.me).replace(/^https?:\/\//, "") })),
        S.sites.map((x) => h("button", { class: "dme-site", type: "button", onclick: () => switchSite(x.id, "home") }, h("b", { text: x.name }), h("span", { class: x.domain ? "live" : "", text: x.domain || "No address yet" })))))
      : h("section", { class: "card dash-me" }, cardHead("Lineup", () => go("people")), S.hosts.length ? h("div", { class: "dash-list" }, S.hosts.slice(0, 5).map((x) => h("button", { class: "dash-row", type: "button", onclick: () => go("people") },
          x.photo_url ? h("img", { class: "dl-av", src: x.photo_url, alt: "" }) : h("span", { class: "dl-av", text: x.name[0] }), h("span", { class: "dl-main" }, h("b", { text: x.name }), h("span", { text: x.title || "Comedian" })))))
        : empty("No one yet", "Add the comics on this site."));
    grid.append(meCard);
    const live = liveCard();
    grid.append(h("section", { class: "card dash-todo" }, cardHead(todo.length ? "Worth a look" : "All caught up"),
      todo.length ? h("div", { class: "todo" }, todo.map(([t, sec]) => h("div", { class: "todo-item" }, h("span", { text: t }), h("button", { class: "btn sm", type: "button", text: "Fix", onclick: () => go(sec) }))))
        : h("p", { class: "hint", style: "margin:0", text: "Everything on your site looks good." }), live));
    // the latest from the chat room
    const chatCard = F("chat") ? h("section", { class: "card dash-chat" }, cardHead("Community Chat", () => go("chat"), "Open"), h("p", { class: "hint", text: "Loading…" })) : null;
    if (chatCard) grid.append(chatCard);

    if (fansCard) (async () => {
      try {
        const fans = await q(sb.from("fans").select("city,state,created_at").eq("site_id", sid()).limit(5000));
        const week = fans.filter((f) => Date.now() - Date.parse(f.created_at) < 7 * 864e5).length;
        const n = fanStat.querySelector(".n"); n.textContent = fans.length; if (week) fanStat.querySelector(".st-txt").append(h("span", { class: "s", text: "+" + week + " this week" }));
        const by = new Map(); fans.forEach((f) => { const k = [f.city, f.state].filter(Boolean).join(", ") || "Somewhere"; by.set(k, (by.get(k) || 0) + 1); });
        const top = [...by].sort((a, b) => b[1] - a[1]).slice(0, 5);
        fansCard.replaceChildren(fansCard.firstChild, top.length ? h("ol", { class: "cities" }, top.map(([c, k]) => h("li", null, h("span", { class: "ct-name", text: c }), h("span", { class: "ct-pct", text: Math.round(k / fans.length * 100) + "%" }),
          h("span", { class: "bar" }, h("i", { style: "width:" + Math.max(4, Math.round(k / top[0][1] * 100)) + "%" })))))
          : h("p", { class: "hint", text: "No fans yet. Your sign-up QR code is on the Fan list page." }));
      } catch (e) { fansCard.replaceChildren(fansCard.firstChild, h("p", { class: "hint", text: "Couldn't load the fan list." })); fanStat.querySelector(".n").textContent = "–"; }
    })();
    if (chatCard) (async () => {
      try {
        const msgs = await q(sb.from("chat_messages").select("author,body,created_at,is_mod").eq("site_id", sid()).eq("deleted", false).order("created_at", { ascending: false }).limit(5));
        chatCard.replaceChildren(chatCard.firstChild, msgs.length ? h("div", { class: "dash-list" }, msgs.map((m) => h("div", { class: "dash-row chat" },
          h("span", { class: "dl-av", text: (m.author || "?")[0].toUpperCase() }), h("span", { class: "dl-main" }, h("b", { text: m.author }), h("span", { text: m.body })), h("span", { class: "hint", text: ago(m.created_at) }))))
          : h("p", { class: "hint", text: "Quiet so far." }));
      } catch (e) { chatCard.replaceChildren(chatCard.firstChild, h("p", { class: "hint", text: "Couldn't load the chat." })); }
    })();
  }
  // Go live sits on the Overview: a button when you're not live, the "You're live" card when you are.
  function liveCard() {
    if (!S.site || !("live" in S.site)) return null;
    const live = S.site.live, isLive = live && live.url && (!live.started_at || Date.now() - Date.parse(live.started_at) < 12 * 3600 * 1000);
    const box = h("div", { class: "stack live-box" }); viewLive(box);
    return isLive ? box : h("details", { class: "live-fold" }, h("summary", { class: "btn", text: "🔴 Go live" }), box);
  }
  function relDay(d) {
    const n = Math.round((parseISO(d) - parseISO(today())) / 864e5);
    return n === 0 ? "tonight" : n === 1 ? "tomorrow" : n < 7 ? "on " + DOW[parseISO(d).getDay()] : "on " + shortDate(d);
  }

