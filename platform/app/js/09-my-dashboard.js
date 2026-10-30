  /* ======================================================
     A COMIC'S DASHBOARD AND FANS (style guide, Oct 29)
     ====================================================== */
  // One shape for every dashboard card: title, optional "View all", body.
  const initials = (name) => String(name || "?").split(/[\s._@-]+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const dcard = (title, all, ...body) => h("section", { class: "card dcard" },
    h("div", { class: "card-head" }, h("h2", { text: title }), all ? h("button", { class: "view-all", type: "button", onclick: all[1], text: all[0] + " →" }) : null), ...body);
  // A status pill always has a word, never color alone. The dot glows only for what's live.
  function statusPill(s) {
    const [cls, txt] = s.status === "sold_out" ? ["muted", "Sold out"] : s.status === "cancelled" ? ["muted", "Cancelled"] : s.status === "free" ? ["live", "Free"]
      : !s.url ? ["soon", "No ticket link"] : s.status === "few_left" ? ["hot", "Few left"] : ["live", "Tickets live"];
    return h("span", { class: "spill " + cls }, h("i", { "aria-hidden": "true" }), txt);
  }
  // The date tile: red month, big day.
  const dateTile = (d) => h("span", { class: "dtile", "aria-hidden": "true" }, h("small", { text: MON[parseISO(d).getMonth()].toUpperCase() }), h("b", { text: parseISO(d).getDate() }));
  // A number card with a solid badge.
  const numCard = (ico, n, label, gold, onGo) => h("button", { class: "ncard", type: "button", onclick: onGo },
    h("span", { class: "nbadge" + (gold ? " gold" : "") }, svgIco(ico).firstChild), h("span", { class: "ntxt" }, h("b", { class: "n", text: n }), h("span", { text: label })));

  async function viewMyHome(main) {
    const me = S.me, who = (me.name || S.user || "").split(/\s+/)[0];
    const hello = h("p", { class: "dash-sub", text: " " });
    main.append(h("div", { class: "dash-top" }, h("h1", { class: "hello" }, "Welcome back, ", h("em", { text: who + "." })), hello));
    const nums = h("div", { class: "ncards" }), grid = h("div", { class: "dgrid" });
    main.append(nums, grid);
    const showsCard = dcard("Upcoming shows", ["View all", () => goCT("dates")], h("p", { class: "hint", text: "Loading…" }));
    const coaster = dcard("Your Coaster", ["Edit", () => goCT("me")],
      h("div", { class: "dme" }, me.photo_url ? h("img", { src: me.photo_url, alt: "" }) : h("span", { class: "dme-ph", text: initials(me.name) }),
        h("div", { class: "dme-txt" }, h("b", { text: me.name }), h("span", { class: "hint", text: coasterUrl(me).replace(/^https?:\/\//, "") }),
          h("span", { text: "QR code goes to " + ({ coaster: "your Coaster", site: "your website", tickets: "your next show's tickets", link: "your link" }[(me.coaster || {}).qr] || "your fan list") }))),
      h("div", { class: "btns" }, h("button", { class: "btn sm", type: "button", text: "Copy link", onclick: async () => toast((await copyText(coasterUrl(me))) ? "Link copied." : coasterUrl(me)) }),
        h("a", { class: "btn sm", href: coasterUrl(me), target: "_blank", rel: "noopener", text: "Open ↗" })));
    const needs = dcard("Needs you", null, h("p", { class: "hint", text: "Loading…" }));
    grid.append(showsCard, coaster, needs);

    let shows = [], fans = null;
    try { shows = (await q(sb.rpc("comic_shows", { p_comic: me.id }))).filter((s) => s.date >= today()); } catch (e) {}
    try { fans = await q(sb.from("comic_fans").select("created_at").eq("comic_id", me.id).limit(10000)); } catch (e) {}
    shows.sort((a, b) => (a.date + to24(a.time)).localeCompare(b.date + to24(b.time)));
    const next = shows[0];
    hello.textContent = next ? "Next up: " + (next.venue || next.city) + ", " + relDay(next.date) + (next.time ? " at " + next.time : "") + "." : "No shows on the books yet. Add one and it's everywhere at once.";
    nums.append(numCard("shows", shows.length, "Upcoming shows", true, () => goCT("dates")));
    if (fans) {
      const month = fans.filter((f) => Date.now() - Date.parse(f.created_at) < 30 * 864e5).length;
      nums.append(numCard("fans", fans.length.toLocaleString(), "Fans on your list", false, () => goCT("fans")));
      if (fans.length) nums.append(numCard("people", "+" + month, "New fans this month", true, () => goCT("fans")));
    }
    showsCard.replaceChildren(showsCard.firstChild, shows.length
      ? h("div", { class: "drows" }, shows.slice(0, 5).map((s) => h("button", { class: "drow", type: "button", onclick: () => goCT("dates") }, dateTile(s.date),
        h("span", { class: "drow-main" }, h("b", { text: s.venue || s.city || "Show" }), h("span", { text: [s.city, DOW[parseISO(s.date).getDay()] + (s.time ? " " + s.time : ""), s.event ? "with " + s.site_name : ""].filter(Boolean).join(" · ") })), statusPill(s))))
      : h("div", { class: "empty" }, h("b", { text: "No shows yet" }), "Add your next date. It's on your Coaster and every site you're on.",
        h("div", null, h("button", { class: "btn primary", type: "button", text: "Add a show", onclick: () => goCT("dates") }))));
    // what needs them: only real, fixable things
    const todo = [];
    const noLink = shows.filter((s) => !s.url && s.status !== "cancelled" && !s.event);
    if (noLink.length) todo.push(["soon", noLink.length === 1 ? (noLink[0].venue || "A show") + " on " + shortDate(noLink[0].date) + " has no ticket link" : noLink.length + " shows have no ticket link", () => goCT("dates")]);
    if (!me.photo_url) todo.push(["hot", "Add a photo to your Coaster", () => goCT("me")]);
    if (!String(me.bio || "").trim()) todo.push(["hot", "Add a short bio. Clubs and sites use it", () => goCT("me")]);
    try { const asks = await q(sb.from("coaster_requests").select("id").eq("comic_id", me.id).eq("status", "pending")); if (asks.length) todo.push(["hot", asks.length + " site" + (asks.length > 1 ? "s want" : " wants") + " to add you", () => goCT("me")]); } catch (e) {}
    needs.replaceChildren(needs.firstChild, todo.length ? h("div", { class: "drows" }, todo.map(([c, t, fn]) => h("button", { class: "drow todo", type: "button", onclick: fn }, h("i", { class: "tdot " + c, "aria-hidden": "true" }), h("span", { class: "drow-main" }, h("b", { text: t })), h("span", { class: "hint", "aria-hidden": "true", text: "→" }))))
      : h("p", { class: "hint", style: "margin:0", text: "All caught up." }));
  }

  // A comic's fans: everyone who joined their list, from their Coaster, their sites and any lineup they were on.
  async function viewMyFans(main) {
    const me = S.me;
    main.append(head("Fans", "Everyone on your list, from your Coaster, your sites and the lineups you've been on."));
    const card = h("section", { class: "card" }, h("p", { class: "hint", text: "Loading…" })); main.append(card);
    let rows;
    try { rows = await q(sb.from("comic_fans").select("name,email,zip,city,state,met_at,source,site_id,created_at").eq("comic_id", me.id).order("created_at", { ascending: false }).limit(10000)); }
    catch (e) { card.replaceChildren(h("p", { class: "err", text: /comic_fans/.test(errText(e)) ? "This needs the latest database upgrade." : errText(e) })); return; }
    if (!rows.length) { card.replaceChildren(empty("No fans yet", "Fans who join on your Coaster or any of your sites show up here.")); return; }
    const where = [...new Set(rows.map((r) => r.site_id).filter(Boolean))];
    let pick = "", t = "";
    const list = h("div", { class: "drows" });
    const search = h("input", { type: "search", placeholder: "Search name, email or city", "aria-label": "Search fans", oninput: (e) => { t = e.target.value.toLowerCase(); draw(); } });
    const chips = h("div", { class: "chips", role: "group", "aria-label": "Where they joined" });
    const names = {}; S.sites.forEach((x) => { names[x.id] = x.name; });
    try { (await q(sb.from("sites").select("id,name").in("id", where))).forEach((x) => { names[x.id] = x.name; }); } catch (e) {}
    const siteName = (id) => names[id] || id;
    const drawChips = () => chips.replaceChildren(...[["", "Everywhere"], ["coaster", "Your Coaster"]].concat(where.map((id) => [id, siteName(id)])).map(([v, l]) =>
      h("button", { type: "button", class: "chip", "aria-pressed": String(pick === v), text: l, onclick: () => { pick = v; drawChips(); draw(); } })));
    const shown = () => rows.filter((r) => (!pick || (pick === "coaster" ? !r.site_id : r.site_id === pick)) && (!t || [r.name, r.email, r.city].some((x) => String(x || "").toLowerCase().includes(t))));
    const count = h("span", { class: "hint" });
    const draw = () => { const s = shown(); count.textContent = s.length + " of " + rows.length;
      list.replaceChildren(...s.slice(0, 300).map((r) => h("div", { class: "drow" }, h("span", { class: "nav-av", "aria-hidden": "true", text: initials(r.name || r.email) }),
        h("span", { class: "drow-main" }, h("b", { text: r.name || r.email.split("@")[0] }), h("span", { text: [r.email, [r.city, r.state].filter(Boolean).join(", ") || r.zip, r.met_at ? "met at " + r.met_at : ""].filter(Boolean).join(" · ") })),
        h("span", { class: "hint", text: r.site_id ? siteName(r.site_id) : "Coaster" })))); };
    const csv = () => { const s = shown(), esc = (v) => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
      const blob = new Blob([["Name", "Email", "ZIP", "City", "State", "Where we met", "Joined on", "Date"].join(",") + "\n" + s.map((r) => [r.name, r.email, r.zip, r.city, r.state, r.met_at, r.site_id ? siteName(r.site_id) : "Coaster", String(r.created_at).slice(0, 10)].map(esc).join(",")).join("\n")], { type: "text/csv" });
      const a = h("a", { href: URL.createObjectURL(blob), download: (me.handle || me.id) + "-fans.csv" }); document.body.append(a); a.click(); a.remove(); };
    card.replaceChildren(h("div", { class: "toolbar" }, search, h("button", { class: "btn sm", type: "button", text: "Download", onclick: csv })), chips, count, list);
    drawChips(); draw();
  }

  // A comic's Podcast / YouTube (Coaster): their own channel, which Shorts show, and the whole-show podcast player.
  // Each site decides separately which of these it shows (the site's Videos & podcast page).
  async function viewMyMedia(main) {
    const me = S.me;
    main.append(head("Podcast / YouTube", "Your channel and your show, on your Coaster. Each site you're on picks what it shows."));
    const saveCoaster = async (patch, msg) => {
      const coaster = { ...(S.me.coaster || {}), ...patch };
      try { await q(sb.from("comics").update({ coaster }).eq("id", me.id)); S.me = { ...S.me, coaster }; toast(msg || "Saved."); return true; }
      catch (e) { toast(errText(e), { bad: true }); return false; }
    };
    // ---- the channel ----
    const chan = h("section", { class: "card stack" }, h("h2", { text: "Your YouTube channel" }), h("p", { class: "hint", text: "Loading…" }));
    main.append(chan);
    const drawChan = async () => {
      let rows = [];
      try { rows = await q(sb.from("sources").select("*").eq("comic_id", me.id).eq("kind", "youtube")); } catch (e) {}
      const url = h("input", { type: "url", placeholder: "https://www.youtube.com/@yourname", "aria-label": "YouTube channel link" });
      const err = h("div", { class: "err" });
      chan.replaceChildren(h("h2", { text: "Your YouTube channel" }),
        rows.length ? h("div", { class: "drows" }, rows.map((r) => h("div", { class: "drow" }, h("span", { class: "nbadge", style: "width:38px;height:38px" }, svgIco("videos").firstChild),
          h("span", { class: "drow-main" }, h("b", { text: r.label || r.url.replace(/^https?:\/\/(www\.)?/, "") }), h("span", { text: r.last_status ? "Last check: " + r.last_status : "New videos come in within the hour." })),
          sure("Remove", async () => { try { await q(sb.from("sources").delete().eq("id", r.id)); toast("Channel removed."); drawChan(); } catch (e) { toast(errText(e), { bad: true }); } }))))
          : h("p", { class: "hint", style: "margin:0", text: "Connect it once. New videos and Shorts come in by themselves." }),
        h("form", { class: "toolbar", onsubmit: async (e) => {
          e.preventDefault(); err.textContent = "";
          const u = url.value.trim();
          if (!/^https:\/\/(www\.|m\.)?youtube\.com\/|^https:\/\/youtu\.be\//i.test(u)) { err.textContent = "Paste your channel's link, like https://www.youtube.com/@yourname"; url.focus(); return; }
          try { await q(sb.from("sources").insert({ comic_id: me.id, site_id: null, kind: "youtube", url: u })); toast("Connected. Your videos come in within the hour."); drawChan(); }
          catch (er) { err.textContent = /site_id|not-null|null value/i.test(errText(er)) ? "This needs the latest database upgrade." : errText(er); }
        } }, url, h("button", { class: "btn primary", type: "submit", text: rows.length ? "Add another" : "Connect" })), err);
    };
    drawChan();

    // ---- Shorts: Featured, Shown or Hidden ----
    const shortsCard = h("section", { class: "card stack" }, h("h2", { text: "Shorts" }), h("p", { class: "hint", text: "Loading…" }));
    main.append(shortsCard);
    (async () => {
      let vids = [];
      try { vids = await q(sb.from("videos").select("youtube_id,title,published").eq("comic_id", me.id).eq("is_short", true).order("published", { ascending: false }).limit(60)); } catch (e) {}
      const pick = { featured: [], hidden: [], ...((S.me.coaster || {}).shorts || {}) };
      const state = (id) => pick.featured.includes(id) ? "featured" : pick.hidden.includes(id) ? "hidden" : "shown";
      const grid = h("div", { class: "short-grid" });
      const draw = () => grid.replaceChildren(...vids.map((v) => {
        const st = state(v.youtube_id);
        return h("div", { class: "short-pick " + st }, h("img", { src: "https://i.ytimg.com/vi/" + v.youtube_id + "/hqdefault.jpg", alt: "", loading: "lazy" }), h("small", { text: v.title }),
          h("div", { class: "seg", role: "group", "aria-label": "Show " + v.title }, [["featured", "Featured"], ["shown", "Shown"], ["hidden", "Hidden"]].map(([k, l]) =>
            h("button", { type: "button", "aria-pressed": String(st === k), text: l, onclick: async () => {
              pick.featured = pick.featured.filter((x) => x !== v.youtube_id); pick.hidden = pick.hidden.filter((x) => x !== v.youtube_id);
              if (k === "featured") pick.featured.push(v.youtube_id); if (k === "hidden") pick.hidden.push(v.youtube_id);
              draw(); await saveCoaster({ shorts: { featured: pick.featured, hidden: pick.hidden } }, l === "Featured" ? "Featured. It plays big on your Coaster." : l === "Hidden" ? "Hidden from your Coaster." : "Shown.");
            } }))));
      }));
      draw();
      shortsCard.replaceChildren(h("h2", { text: "Shorts" }), vids.length ? h("p", { class: "hint", style: "margin:0", text: "Featured ones go first and play big. Hidden ones stay off your Coaster." }) : null,
        vids.length ? grid : h("p", { class: "hint", style: "margin:0", text: "Your Shorts show up here once your channel is connected." }));
    })();

    // ---- the whole-show podcast player ----
    const pod = { player: "spotify", ...((S.me.coaster || {}).podcast || {}) };
    const name = h("input", { value: pod.name || "", maxlength: "80", placeholder: "Your show's name", "aria-label": "Show name" });
    const links = { spotify: h("input", { type: "url", value: pod.spotify || "", placeholder: "https://open.spotify.com/show/…", "aria-label": "Spotify show link" }),
      apple: h("input", { type: "url", value: pod.apple || "", placeholder: "https://podcasts.apple.com/…/id…", "aria-label": "Apple Podcasts link" }),
      youtube: h("input", { type: "url", value: pod.youtube || "", placeholder: "https://www.youtube.com/playlist?list=…", "aria-label": "YouTube playlist link" }) };
    const playerSeg = h("div", { class: "chips", role: "group", "aria-label": "Player on your Coaster" });
    const drawSeg = () => playerSeg.replaceChildren(...[["spotify", "Spotify"], ["apple", "Apple"], ["youtube", "YouTube"]].map(([k, l]) => h("button", { type: "button", class: "chip", "aria-pressed": String(pod.player === k), text: l, onclick: () => { pod.player = k; drawSeg(); show(); } })));
    const prev = h("div");
    const show = () => { const src = CSB.podcastEmbed ? CSB.podcastEmbed(links[pod.player].value || links.spotify.value || links.apple.value || links.youtube.value) : "";
      prev.replaceChildren(src ? h("iframe", { src, title: "Podcast player preview", loading: "lazy", style: "width:100%;height:" + (/youtube/.test(src) ? "260px" : "232px") + ";border:0;border-radius:14px" }) : h("p", { class: "hint", style: "margin:0", text: "Paste a link and the player shows here." })); };
    Object.values(links).forEach((i) => i.addEventListener("change", show));
    drawSeg(); show();
    const perr = h("div", { class: "err" });
    main.append(h("form", { class: "card stack", onsubmit: async (e) => {
      e.preventDefault(); perr.textContent = "";
      const vals = Object.fromEntries(Object.entries(links).map(([k, i]) => [k, i.value.trim()]));
      for (const [k, v] of Object.entries(vals)) if (v && !(CSB.podcastEmbed && CSB.podcastEmbed(v))) { perr.textContent = "That " + ({ spotify: "Spotify", apple: "Apple", youtube: "YouTube" })[k] + " link isn't a show we can play. Copy the show's page link."; links[k].focus(); return; }
      await saveCoaster({ podcast: { name: name.value.trim(), player: pod.player, ...vals } }, "Podcast player saved. It's on your Coaster.");
    } }, h("h2", { text: "Podcast player" }), h("p", { class: "hint", style: "margin:0", text: "Your whole show in one player on your Coaster. Fans listen right there." }),
      field("Show name", name), h("div", { class: "grid" }, field("Spotify", links.spotify, "c4"), field("Apple Podcasts", links.apple, "c4"), field("YouTube playlist", links.youtube, "c4")),
      h("div", { class: "pick-row" }, h("span", { class: "pick-l", text: "Which player on your Coaster" }), playerSeg), prev, perr,
      h("div", { class: "btns" }, h("button", { class: "btn primary", type: "submit", text: "Save player" }))));
  }
