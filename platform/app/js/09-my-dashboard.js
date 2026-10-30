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
