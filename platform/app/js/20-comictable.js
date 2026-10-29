  /* ======================================================
     COMICTABLE LEVEL: overview, comics, your sites
     ====================================================== */
  async function viewOverview(main) {
    const hr = new Date().getHours(), hi = hr < 5 ? "Up late" : hr < 12 ? "Morning" : hr < 17 ? "Afternoon" : "Evening";
    main.append(h("div", { class: "page-head" }, h("div", null, h("h1", { class: "hello", text: hi + ", " + S.user }), h("p", { class: "sub", text: "Everything running on ComicTable." }))));
    const wrap = h("div", { class: "stack" }, h("section", { class: "card" }, h("p", { class: "hint", text: "Loading…" }))); main.append(wrap);
    const count = async (t, f) => { let x = sb.from(t).select("id", { count: "exact", head: true }); if (f) x = f(x); const r = await x; return r.error ? 0 : r.count || 0; };
    let comics = 0, shows = 0, fans = 0, reqs = [], bad = [];
    try {
      [comics, shows, fans] = await Promise.all([count("comics"), count("shows", (x) => x.gte("date", today())), count("fans")]);
      try { reqs = await q(sb.from("site_requests").select("*").eq("handled", false)); } catch (e) {}
      try { bad = (await q(sb.from("sources").select("site_id, kind, label, last_status").like("last_status", "Error%"))); } catch (e) {}
    } catch (e) {}
    const todo = [];
    if (reqs.length) todo.push([reqs.length + " new request" + (reqs.length > 1 ? "s" : "") + " from comictable.com", () => goCT("sites")]);
    for (const b of bad) todo.push([(S.sites.find((x) => x.id === b.site_id) || {}).name + ": " + (b.label || b.kind) + " import has a problem", () => switchSite(b.site_id, b.kind === "podcast" ? "podcast" : b.kind === "shows" ? "shows" : "videos")]);
    const siteRows = await Promise.all(S.sites.slice().sort((a, b) => a.name.localeCompare(b.name)).slice(0, 60).map(async (st) => {
      const [p, up] = await Promise.all([count("hosts", (x) => x.eq("site_id", st.id)), sb.rpc("site_shows", { p_site: st.id }).then((r) => (r.data || []).length, () => 0)]);
      if (!p) todo.push([st.name + " has nobody on it yet", () => switchSite(st.id, "people")]);
      return h("div", { class: "switch-row" },
        h("div", { style: "min-width:0" }, h("b", { text: st.name }), h("div", { class: "hint", text: (st.domain || "No web address yet") + " · " + p + (p === 1 ? " comic" : " comics") + " · " + up + " upcoming show" + (up === 1 ? "" : "s") })),
        h("div", { class: "btns" }, h("button", { class: "btn sm", type: "button", text: "Open", onclick: () => switchSite(st.id, "home") }),
          st.domain ? h("a", { class: "btn sm ghost", href: "https://" + st.domain, target: "_blank", rel: "noopener", text: "Visit ↗" }) : null));
    }));
    wrap.replaceChildren(
      h("div", { class: "stats" }, [["Sites", S.sites.length, () => goCT("sites")], ["Coasters", comics, () => goCT("comics")], ["Upcoming shows", shows], ["Fans on lists", fans]]
        .map(([l, n, fn]) => h(fn ? "button" : "div", { class: "stat", type: fn ? "button" : null, style: fn ? "text-align:left;cursor:pointer" : null, onclick: fn || null }, h("div", { class: "n", text: n }), h("div", { class: "l", text: l })))),
      todo.length ? h("section", { class: "card" }, h("h2", { text: "Worth a look" }), h("div", { class: "todo" }, todo.map(([t, fn]) => h("div", { class: "todo-item" }, h("span", { text: t }), h("button", { class: "btn sm", type: "button", text: "Go", onclick: fn })))))
        : h("section", { class: "card" }, empty("All caught up ✨", "Every site looks good.")),
      h("section", { class: "card" }, h("div", { class: "toolbar" }, h("h2", { style: "margin:0", text: "Sites" }), h("button", { class: "btn primary sm", type: "button", text: "+ New site", onclick: () => goCT("sites") })), h("div", null, siteRows)));
  }

  /* ---------- Club database (super admins) ---------- */
  const clubQ = { t: "", only: "all" };
  async function viewClubs(main) {
    const addBox = h("div");
    main.append(head("Club database", "Every comedy club on ComicTable. Comics pick from this list when they add shows, so clean names here make everyone's sites look right.",
      h("button", { class: "btn primary", type: "button", id: "addClub", text: "+ Add a club", onclick: () => { addBox.replaceChildren(clubForm(null, () => { addBox.replaceChildren(); draw(); })); } })), addBox);
    const card = h("section", { class: "card" }, h("p", { class: "hint", text: "Loading…" })); main.append(card);
    let uses = {};
    try { (await q(sb.from("shows").select("venue_id").not("venue_id", "is", null))).forEach((r) => { uses[r.venue_id] = (uses[r.venue_id] || 0) + 1; }); } catch (e) {}
    const search = h("input", { type: "search", id: "clubSearchAll", placeholder: "Search name, city or state", value: clubQ.t, "aria-label": "Search clubs", style: "max-width:300px" });
    const filt = h("div", { class: "seg", role: "group", "aria-label": "Show" }, [["all", "All"], ["new", "Needs a check"], ["unused", "No shows"]].map(([v, l]) =>
      h("button", { type: "button", "aria-pressed": String(clubQ.only === v), text: l, onclick: () => { clubQ.only = v; draw(); } })));
    const body = h("div");
    search.addEventListener("input", () => { clubQ.t = search.value; drawList(); });
    function drawList() {
      const t = clubQ.t.trim().toLowerCase();
      const rows = S.venues.filter((v) => (!t || (v.name + " " + v.city + " " + (v.state || "")).toLowerCase().includes(t))
        && (clubQ.only === "all" || (clubQ.only === "new" && !v.verified) || (clubQ.only === "unused" && !uses[v.id])))
        .sort((a, b) => a.name.localeCompare(b.name));
      body.replaceChildren(h("div", { class: "hint", style: "margin:8px 0", text: rows.length + " of " + S.venues.length + " clubs" }),
        rows.length ? h("div", { class: "tablewrap" }, h("table", { class: "shows-table" },
          h("thead", null, h("tr", null, ["Club", "City", "Shows", "", ""].map((x) => h("th", { text: x })))),
          h("tbody", null, rows.slice(0, 300).map((v) => clubRow(v))))) : empty("No clubs match", "Try another search, or add it."),
        rows.length > 300 ? h("p", { class: "hint", text: "Showing the first 300. Search to narrow it down." }) : null);
    }
    function clubRow(v) {
      const tr = h("tr", null,
        h("td", null, h("b", { text: v.name }), v.verified ? null : h("span", { class: "pill warn", style: "margin-left:6px", text: "Needs a check" }), v.website ? h("div", { class: "hint wrap-any", text: v.website }) : null),
        h("td", { text: venueCity(v) }),
        h("td", { class: "nowrap", text: String(uses[v.id] || 0) }),
        h("td", null, v.verified ? null : h("button", { class: "btn sm", type: "button", text: "Looks good", onclick: async () => { try { await q(sb.from("venues").update({ verified: true }).eq("id", v.id)); v.verified = true; drawList(); toast("Checked."); } catch (e) { toast(errText(e), { bad: true }); } } })),
        h("td", { class: "actions" }, h("button", { class: "btn ghost sm", type: "button", text: "Edit", onclick: () => tr.replaceWith(h("tr", { class: "editing" }, h("td", { colspan: "5" }, clubForm(v, () => { draw(); })))) })));
      return tr;
    }
    function clubForm(v, done) {
      const f = { name: h("input", { value: v ? v.name : "", placeholder: "Club name", id: "cfName" }), city: h("input", { value: v ? v.city : "", placeholder: "City", id: "cfCity" }),
        state: h("input", { value: v ? v.state || "" : "", placeholder: "NY", maxlength: "3", id: "cfState" }), website: h("input", { type: "url", value: v ? v.website || "" : "", placeholder: "https://…" }),
        address: h("input", { value: v ? v.address || "" : "", placeholder: "Street address (optional)" }) };
      const msg = h("div", { class: "err" });
      const others = S.venues.filter((x) => !v || x.id !== v.id).sort((a, b) => a.name.localeCompare(b.name));
      const mergeSel = v ? h("select", { "aria-label": "Merge into", style: "max-width:320px" }, h("option", { value: "", text: "Merge into another club…" }), others.map((x) => h("option", { value: x.id, text: x.name + " · " + venueCity(x) }))) : null;
      return h("form", { class: "card stack", style: "box-shadow:none", onsubmit: async (e) => {
        e.preventDefault(); msg.textContent = "";
        const row = { name: f.name.value.trim(), city: f.city.value.trim(), state: f.state.value.trim().toUpperCase() || null, website: f.website.value.trim() || null, address: f.address.value.trim() || null, verified: true };
        if (!row.name || !row.city) { msg.textContent = "A club needs a name and a city."; return; }
        try {
          if (v) {
            await q(sb.from("venues").update(row).eq("id", v.id));
            // keep every show at this club in step with the cleaned-up name
            await q(sb.from("shows").update({ venue: row.name, city: row.state ? row.city + ", " + row.state : row.city }).eq("venue_id", v.id));
          } else await q(sb.from("venues").insert({ ...row, status: "approved" }));
          await reload.venues(); toast(v ? "Saved. Shows at this club were updated too." : row.name + " added."); done();
        } catch (er) { msg.textContent = /duplicate|unique/i.test(errText(er)) ? "That club is already in the list." : errText(er); }
      } }, h("h2", { text: v ? "Edit " + v.name : "Add a club" }),
        h("div", { class: "grid" }, field("Name", f.name, "c6"), field("City", f.city, "c4"), field("State", f.state, "c2"), field("Website", f.website, "c6"), field("Address", f.address, "c6")), msg,
        h("div", { class: "btns" }, h("button", { class: "btn primary", type: "submit", text: v ? "Save club" : "Add club" }), h("button", { class: "btn ghost", type: "button", text: "Cancel", onclick: done })),
        v ? h("div", { class: "newclub stack", style: "gap:8px" }, h("b", { text: "Duplicate? Merge it" }), h("div", { class: "hint", text: "Moves every show at " + v.name + " (" + (uses[v.id] || 0) + ") to the club you pick, then removes this one." }),
          h("div", { class: "btns" }, mergeSel, h("button", { class: "btn sm", type: "button", text: "Merge", onclick: async () => {
            const into = S.venues.find((x) => x.id === mergeSel.value); if (!into) { mergeSel.focus(); return; }
            try {
              await q(sb.from("shows").update({ venue_id: into.id, venue: into.name, city: venueCity(into) }).eq("venue_id", v.id));
              await q(sb.from("venues").delete().eq("id", v.id));
              await reload.venues(); toast("Merged into " + into.name + "."); done();
            } catch (er) { toast(errText(er), { bad: true }); }
          } }), sure("Delete club", async () => { try { await q(sb.from("venues").delete().eq("id", v.id)); await reload.venues(); toast("Deleted. Shows that were there keep their club name."); done(); } catch (er) { toast(errText(er), { bad: true }); } }))) : null);
    }
    function draw() {
      filt.querySelectorAll("button").forEach((b, i) => b.setAttribute("aria-pressed", String(["all", "new", "unused"][i] === clubQ.only)));
      drawList();
    }
    card.replaceChildren(h("div", { class: "toolbar" }, filt, search), body);
    draw();
  }

  /* ---------- Comics (super admins) ---------- */
  let comicOpen = null;
  const comicQ = { t: "", only: "all", sort: "name" };
  async function viewComics(main) {
    const wrap = h("div", { class: "stack" }, h("section", { class: "card" }, h("p", { class: "hint", text: "Loading…" })));
    let comics, lineups, shows;
    const load = async () => {
      [comics, lineups, shows] = await Promise.all([
        q(sb.from("comics").select("*").order("name", { ascending: true })),
        q(sb.from("hosts").select("id, site_id, comic_id, hidden")),
        q(sb.from("shows").select("id, comic_id, lineup, date").gte("date", today()))]);
    };
    try { await load(); } catch (e) { main.append(head("Coasters", ""), h("p", { class: "err", text: errText(e) })); return; }
    const onSites = (c) => lineups.filter((l) => l.comic_id === c.id).map((l) => ({ ...l, site: S.sites.find((x) => x.id === l.site_id) })).filter((x) => x.site);
    const upcoming = (c) => shows.filter((x) => x.comic_id === c.id || (x.lineup || []).includes(c.id)).length;
    const open = comicOpen && comics.find((c) => c.id === comicOpen);
    if (open) { await comicDetail(main, open, onSites, async () => { await load(); }); return; }

    const addBox = h("div");
    main.append(head("Coasters", "Every comic on ComicTable has a Coaster: their card at comictable.com/<name>. Their profile, dates and YouTube follow them to every site they're on.",
      h("button", { class: "btn primary", type: "button", id: "addComic", text: "+ Add a Coaster", onclick: () => {
        const name = h("input", { id: "newComicName", placeholder: "Full name", maxlength: "60" });
        const msg = h("div", { class: "err" });
        addBox.replaceChildren(h("form", { class: "card stack", onsubmit: async (e) => {
          e.preventDefault(); const n = name.value.trim(); if (!n) { name.focus(); return; }
          if (comics.some((c) => c.name.toLowerCase() === n.toLowerCase()) && !msg.dataset.ok) { msg.dataset.ok = "1"; msg.textContent = "There's already a comic called " + n + ". Click Add Coaster again if this is someone else."; return; }
          try { const id = await newComicId(n); await q(sb.from("comics").insert({ id, name: n, title: "Comedian", bio: "" })); comicOpen = id; toast(n + " added. Fill in their profile, then put them on a site."); route(); }
          catch (er) { msg.textContent = errText(er); }
        } }, h("h2", { text: "Add a Coaster" }), h("p", { class: "sub", text: "Any comic can have one. They don't need a site: put them on one, or several, any time." }), field("Name", name), msg,
          h("div", { class: "btns" }, h("button", { class: "btn primary", type: "submit", text: "Add Coaster" }), h("button", { class: "btn ghost", type: "button", text: "Cancel", onclick: () => addBox.replaceChildren() }))));
        name.focus();
      } })), addBox, wrap);

    const withLogin = comics.filter((c) => c.user_id).length, noSite = comics.filter((c) => !onSites(c).length).length;
    const stats = h("div", { class: "stats" }, [["Coasters", comics.length, "all"], ["With their own login", withLogin, "login"], ["Not on a site yet", noSite, "nosite"], ["Upcoming dates", shows.length, null]]
      .map(([l, n, f]) => h(f ? "button" : "div", { class: "stat", type: f ? "button" : null, style: f ? "text-align:left;cursor:pointer" : null, onclick: f ? () => { comicQ.only = f; draw(); } : null }, h("div", { class: "n", text: n }), h("div", { class: "l", text: l }))));
    const search = h("input", { type: "search", placeholder: "Find a Coaster", value: comicQ.t, "aria-label": "Find a comic", style: "max-width:260px" });
    const filt = h("div", { class: "seg", role: "group", "aria-label": "Show" });
    const sortSel = h("select", { "aria-label": "Sort", style: "width:auto" }, [["name", "A to Z"], ["shows", "Most upcoming dates"], ["new", "Newest"]].map(([v, l]) => h("option", { value: v, text: l, selected: comicQ.sort === v })));
    const grid = h("div", { class: "comic-grid" });
    search.addEventListener("input", () => { comicQ.t = search.value; draw(); });
    sortSel.addEventListener("change", () => { comicQ.sort = sortSel.value; draw(); });
    function draw() {
      filt.replaceChildren(...[["all", "All"], ["login", "Has a login"], ["nologin", "No login"], ["nosite", "Not on a site"]].map(([v, l]) =>
        h("button", { type: "button", "aria-pressed": String(comicQ.only === v), text: l, onclick: () => { comicQ.only = v; draw(); } })));
      const t = comicQ.t.trim().toLowerCase();
      let rows = comics.filter((c) => (!t || c.name.toLowerCase().includes(t)) &&
        (comicQ.only === "all" || (comicQ.only === "login" && c.user_id) || (comicQ.only === "nologin" && !c.user_id) || (comicQ.only === "nosite" && !onSites(c).length)));
      rows = rows.slice().sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
      if (comicQ.sort === "shows") rows = rows.slice().sort((a, b) => upcoming(b) - upcoming(a));
      if (comicQ.sort === "new") rows = rows.slice().sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
      grid.replaceChildren(...(rows.length ? rows.map((c) => {
        const st = onSites(c), n = upcoming(c);
        return h("button", { class: "comic-card", type: "button", onclick: () => { comicOpen = c.id; route(); } },
          c.photo_url ? h("img", { class: "avatar", src: c.photo_url, alt: "" }) : h("div", { class: "avatar initials", text: c.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase() }),
          h("div", { class: "cc-body" }, h("b", { text: c.name }), h("span", { class: "hint", text: (c.title || "Comedian") + (c.handle ? " · comictable.com/" + c.handle : "") }),
            h("div", { class: "cc-chips" }, st.length ? st.map((x) => h("span", { class: "pill", text: x.site.name })) : h("span", { class: "pill warn", text: "No site" }))),
          h("div", { class: "cc-meta" }, c.user_id ? h("span", { class: "pill ok", text: "Login" }) : null, h("span", { text: n + (n === 1 ? " date" : " dates") }), h("span", { "aria-hidden": "true", text: "›" })));
      }) : [empty("No comics match", "Try another search or filter.")]));
    }
    draw();
    wrap.replaceChildren(stats, h("section", { class: "card" }, h("div", { class: "toolbar" }, filt, h("div", { class: "btns" }, search, sortSel)), grid));
  }

  async function comicDetail(main, c, onSites, reloadData) {
    const sites = onSites(c);
    const back = h("button", { class: "btn ghost sm", type: "button", text: "← All Coasters", onclick: () => { comicOpen = null; route(); } });
    main.append(h("div", { style: "margin-bottom:8px" }, back),
      h("div", { class: "page-head" }, h("div", { class: "person-top", style: "margin:0" },
        c.photo_url ? h("img", { class: "avatar", src: c.photo_url, alt: "" }) : h("div", { class: "avatar initials", text: c.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase() }),
        h("div", null, h("h1", { text: c.name }), h("p", { class: "sub", text: (c.title || "Comedian") + " · " + (sites.length ? "on " + sites.map((x) => x.site.name).join(", ") : "not on a site yet") + (c.user_id ? " · has a login" : "") })))));
    const grid = h("div", { class: "detail-grid" });
    main.append(grid);
    const pressBox = h("details", { class: "card press-details" }, h("summary", { class: "press-sum" }, h("span", { text: "Press kit" }), h("span", { class: "hint", text: "Approved photos and bios for clubs" })));
    pressBox.addEventListener("toggle", () => { if (pressBox.open && pressBox.children.length === 1) pressBox.append(pressKitEditor(c.id)); }, { once: false });
    main.append(pressBox);
    const left = h("div", { class: "stack" }), right = h("div", { class: "stack" });
    grid.append(left, right);

    // dates everywhere
    const datesCard = h("section", { class: "card" }, h("h2", { text: "Upcoming dates" }), h("p", { class: "hint", text: "Loading…" }));
    main.insertBefore(coasterPage({ ...c, id: null, comic_id: c.id }, { comic: true, onSite: sites.length > 0, bookers: false }), grid);
    left.append(datesCard);
    try {
      const dates = await q(sb.rpc("comic_shows", { p_comic: c.id }));
      // a date belongs to the comic's Coaster, so it's added right here and shows on every site they're on
      const addBox = h("div");
      datesCard.replaceChildren(h("div", { class: "toolbar" }, h("h2", { style: "margin:0", text: "Upcoming dates (" + dates.length + ")" }),
          h("button", { class: "btn sm", type: "button", text: "+ Add a date", onclick: () => addBox.replaceChildren(coasterDateForm(c)) })), addBox,
        dates.length ? h("div", null, dates.slice(0, 30).map((d) => h("div", { class: "switch-row" },
          h("div", null, h("b", { text: shortDate(d.date) + (d.time ? " · " + d.time : "") + " · " + (d.venue || d.city || "Show") }), h("div", { class: "hint", text: [d.city, d.event ? d.site_name + " live show" : "added on " + d.site_name, d.url ? "" : "no ticket link"].filter(Boolean).join(" · ") })),
          h("button", { class: "btn sm ghost", type: "button", text: "Edit", onclick: () => switchSite(d.site_id, "shows") }))))
          : empty("No upcoming dates", sites.length ? "Add some, or point the show finder at their tour page." : "Put them on a site first."));
    } catch (e) { datesCard.replaceChildren(h("h2", { text: "Upcoming dates" }), h("p", { class: "err", text: errText(e) })); }

    // sites
    const addSel = h("select", { "aria-label": "Add to a site", style: "max-width:240px" }, h("option", { value: "", text: "Put them on a site…" }),
      S.sites.filter((st) => !sites.some((x) => x.site_id === st.id)).sort((a, b) => a.name.localeCompare(b.name)).map((st) => h("option", { value: st.id, text: st.name })));
    // their role on each site, right here (founder, Oct 29): On the lineup, Shows only, Moderator, Editor or Owner
    let roles = {};
    if (c.user_id) { try { (await q(sb.from("admins").select("site_id,role").eq("user_id", c.user_id))).forEach((r) => { roles[r.site_id] = r.role; }); } catch (e) { roles = null; } }
    const roleSel = (x) => {
      if (!c.user_id) return h("span", { class: "pill", title: "Give them a login (below) to make them an owner or editor", text: "On the lineup" });
      const cur = roles && roles[x.site_id] ? roles[x.site_id] : "none";
      const sel = h("select", { class: "role-sel", "aria-label": "Role on " + x.site.name, style: "width:auto" },
        [["none", "On the lineup"]].concat(SITE_ROLES.slice().reverse().map((r) => [r[0], r[1]])).map(([v, l]) => h("option", { value: v, text: l, selected: v === cur })));
      sel.addEventListener("change", async () => {
        try { await teamCall({ action: "comic_role", site_id: x.site_id, comic_id: c.id, role: sel.value }); toast(c.name.split(" ")[0] + " is " + (sel.value === "none" ? "on the lineup (no dashboard access)" : roleName(sel.value).toLowerCase()) + " on " + x.site.name + "."); }
        catch (e) { toast(e.message, { bad: true }); sel.value = cur; }
      });
      return sel;
    };
    right.append(h("section", { class: "card stack" }, h("h2", { text: "Sites" }), h("p", { class: "hint", style: "margin:-6px 0 0", text: "Every site " + c.name.split(" ")[0] + " is on, and what they can do there." }),
      sites.length ? h("div", null, sites.map((x) => h("div", { class: "switch-row" }, h("div", null, h("b", { text: x.site.name }), x.hidden ? h("span", { class: "pill", style: "margin-left:6px", text: "Hidden there" }) : null, h("div", { class: "hint", text: x.site.domain || "No web address yet" })),
        h("div", { class: "btns" }, roleSel(x), h("button", { class: "btn sm ghost", type: "button", text: "Open", onclick: () => switchSite(x.site_id, "people") }),
          sure("Take off", async () => { try { await q(sb.from("hosts").delete().eq("id", x.id)); toast(c.name + " is off " + x.site.name + ". Their dates stay theirs."); await reloadData(); route(); } catch (e) { toast(errText(e), { bad: true }); } })))))
        : h("p", { class: "hint", text: "Not on any site yet." }),
      h("div", { class: "btns" }, addSel, h("button", { class: "btn sm", type: "button", text: "Add", onclick: async () => {
        const st = S.sites.find((x) => x.id === addSel.value); if (!st) { addSel.focus(); return; }
        if (needsAsk(c)) { try { await askForComic(c, st.id); } catch (e) { toast(/duplicate|unique/i.test(errText(e)) ? "Already asked. Waiting for " + c.name.split(" ")[0] + "." : errText(e), { bad: true }); } return; }
        let id = st.id + "-" + (slug(c.name.split(" ")[0]) || "person");
        try {
          const taken = (await q(sb.from("hosts").select("id").like("id", id + "%"))).map((r) => r.id);
          while (taken.includes(id)) id = id + "-" + Math.floor(Math.random() * 900 + 100);
          const cnt = (await q(sb.from("hosts").select("id").eq("site_id", st.id))).length;
          await q(sb.from("hosts").insert({ id, site_id: st.id, comic_id: c.id, name: c.name, sort: cnt }));
          toast(c.name + " is on " + st.name + " now."); await reloadData(); route();
        } catch (e) { toast(errText(e), { bad: true }); }
      } }))));

    // login
    const loginCard = h("section", { class: "card stack" }, h("h2", { text: "Login" }));
    if (c.user_id) {
      loginCard.append(h("p", { class: "sub", text: "They have their own login. They see their Me page, edit their profile and dates on every site, and manage the sites they're on the team of." }),
        h("div", { class: "btns" }, sure("Unlink login", async () => {
          try { await teamCall(sites[0] ? { action: "unlink_comic", comic_id: c.id, site_id: sites[0].site_id } : { action: "coaster_unlink", comic_id: c.id }); toast("Unlinked. The login still exists, but it's no longer " + c.name + "."); await reloadData(); route(); }
          catch (e) { toast(e.message, { bad: true }); }
        })));
    } else if (!sites.length) {
      // No site yet: a login just for their Coaster (they land on Me)
      const user = h("input", { placeholder: "username or email", autocapitalize: "none", "aria-label": "Username or email" });
      const pass = h("input", { type: "text", placeholder: "only for a new login (8+)", "aria-label": "Starting password" });
      const msg = h("div", { class: "err" });
      loginCard.append(h("p", { class: "sub", text: "Gives them their own login to edit their Coaster. No site needed: they land on their Me page." }),
        h("div", { class: "grid" }, field("Username or email", user, "c6"), field("Starting password", pass, "c6")), msg,
        h("div", { class: "btns" }, h("button", { class: "btn primary sm", type: "button", text: "Create login", onclick: async (e) => {
          msg.textContent = ""; if (!user.value.trim()) { user.focus(); return; }
          const b = e.currentTarget; b.disabled = true;
          try { await teamCall({ action: "coaster_login", comic_id: c.id, email: loginEmail(user.value), password: pass.value });
            toast(c.name + " can log in now as " + loginEmail(user.value) + "."); await reloadData(); route(); }
          catch (er) { msg.textContent = er.message; b.disabled = false; }
        } })));
    } else {
      const user = h("input", { placeholder: "username or email", autocapitalize: "none", "aria-label": "Username or email" });
      const pass = h("input", { type: "text", placeholder: "only for a new login (8+)", "aria-label": "Starting password" });
      const siteSel = h("select", { "aria-label": "Team", style: "width:auto" }, sites.map((x) => h("option", { value: x.site_id, text: x.site.name })));
      const owner = h("input", { type: "checkbox" });
      const msg = h("div", { class: "err" });
      loginCard.append(h("p", { class: "sub", text: "Gives them their own login: their Me page, their profile and dates everywhere, and a spot on one site's team." }),
        h("div", { class: "grid" }, field("Username or email", user, "c6"), field("Starting password", pass, "c6")),
        h("div", { class: "btns" }, h("label", { class: "hint", style: "display:flex;gap:6px;align-items:center" }, "Team:", siteSel), h("label", { class: "check" }, owner, "Owner")), msg,
        h("div", { class: "btns" }, h("button", { class: "btn primary sm", type: "button", text: "Create login", onclick: async (e) => {
          msg.textContent = ""; if (!user.value.trim()) { user.focus(); return; }
          const b = e.currentTarget; b.disabled = true;
          try { await teamCall({ action: "link_comic", site_id: siteSel.value, comic_id: c.id, email: loginEmail(user.value), password: pass.value, role: owner.checked ? "owner" : "editor" });
            toast(c.name + " can log in now as " + loginEmail(user.value) + "."); await reloadData(); route(); }
          catch (er) { msg.textContent = er.message; b.disabled = false; }
        } })));
    }
    right.append(loginCard);

    // channels and pages being watched for them
    const srcCard = h("section", { class: "card stack" }, h("h2", { text: "Channels and pages" }), h("p", { class: "hint", text: "Loading…" }));
    right.append(srcCard);
    try {
      const srcs = await q(sb.from("sources").select("*").eq("comic_id", c.id));
      srcCard.replaceChildren(h("h2", { text: "Channels and pages" }),
        srcs.length ? h("div", null, srcs.map((x) => h("div", { class: "switch-row" }, h("div", { style: "min-width:0" }, h("b", { text: x.kind === "youtube" ? "YouTube · " + (x.label || "channel") : x.kind === "shows" ? "Show finder · " + (() => { try { return new URL(x.url).hostname.replace(/^www\./, ""); } catch (e) { return x.url; } })() : "Podcast · " + (x.label || "feed") }),
          h("div", { class: "hint wrap-any", text: (x.last_status || "Not checked yet") + " · set up on " + siteName(x.site_id) })),
          h("span", { class: "pill" + (/^Error/.test(x.last_status || "") ? " warn" : " ok"), text: /^Error/.test(x.last_status || "") ? "Problem" : x.enabled ? "On" : "Paused" }))))
          : h("p", { class: "hint", text: "None yet. Connect their YouTube under a site's Videos, or watch their tour page under Shows → Find shows automatically." }));
    } catch (e) { srcCard.replaceChildren(h("h2", { text: "Channels and pages" }), h("p", { class: "err", text: errText(e) })); }

    right.append(h("section", { class: "card stack" }, h("h2", { text: "Delete" }), h("p", { class: "hint", text: "Removes " + c.name + " from every site, along with their dates and channels. This can't be undone." }),
      S.isOwner === false ? null : h("div", { class: "btns" }, sure("Delete comic", async () => {
        try { await q(sb.from("comics").delete().eq("id", c.id)); comicOpen = null; toast(c.name + " deleted."); route(); } catch (e) { toast(errText(e), { bad: true }); }
      }))));
  }

  // Adding a date without a site (a Coaster on its own). Pick the club from ComicTable's club list so shared bills
  // can match it; anything not on the list can be typed in.
  function coasterDateForm(me) {
    const club = h("input", { placeholder: "Start typing the club", autocomplete: "off", "aria-label": "Club" });
    const city = h("input", { placeholder: "City", "aria-label": "City" });
    const date = h("input", { type: "date", min: today(), "aria-label": "Date", required: true });
    const time = h("input", { type: "time", "aria-label": "Time" });
    const url = h("input", { type: "url", placeholder: "https://… (tickets)", "aria-label": "Ticket link" });
    const list = h("div", { class: "stack", style: "gap:4px" });
    const msg = h("div", { class: "err" });
    let venue = null, seq = 0;
    club.addEventListener("input", async () => {
      venue = null; const t = club.value.trim(), my = ++seq;
      if (t.length < 2) { list.replaceChildren(); return; }
      let rows = [];
      try { rows = await q(sb.from("venues").select("id, name, city, state").ilike("name", "%" + t.replace(/[%_,()]/g, "") + "%").limit(5)); } catch (e) {}
      if (my !== seq) return;
      list.replaceChildren(...rows.map((v) => h("button", { class: "btn ghost sm", type: "button", style: "justify-content:flex-start", text: v.name + (v.city ? " · " + v.city + (v.state ? ", " + v.state : "") : ""),
        onclick: () => { venue = v; club.value = v.name; city.value = [v.city, v.state].filter(Boolean).join(", "); list.replaceChildren(); } })));
    });
    const to12 = (t) => { const m = String(t || "").match(/^(\d{1,2}):(\d{2})/); if (!m) return null; const hh = +m[1]; return ((hh % 12) || 12) + ":" + m[2] + (hh >= 12 ? " PM" : " AM"); };
    return h("form", { class: "newclub stack", style: "gap:10px;margin:12px 0", onsubmit: async (e) => {
      e.preventDefault(); msg.textContent = "";
      if (!date.value) { date.focus(); return; }
      if (!club.value.trim()) { club.focus(); return; }
      const u = url.value.trim();
      if (u && !/^https?:\/\//i.test(u)) { msg.textContent = "The ticket link needs to start with https://"; url.focus(); return; }
      try {
        await q(sb.from("shows").insert({ comic_id: me.id, site_id: null, date: date.value, time: to12(time.value), venue: club.value.trim(), city: city.value.trim() || null,
          venue_id: venue && venue.name === club.value.trim() ? venue.id : null, url: u || null, status: "on_sale" }));
        toast("Date added. It's on the Coaster and every site they're on."); route();
      } catch (er) { msg.textContent = /site_id|not-null|null value/i.test(errText(er)) ? "This needs the latest database upgrade." : errText(er); }
    } }, h("b", { text: "Add a date" }),
      h("div", { class: "grid" }, field("Club", club, "c6"), field("City", city, "c6")), list,
      h("div", { class: "grid" }, field("Date", date, "c4"), field("Time", time, "c4"), field("Tickets", url, "c4")), msg,
      h("div", { class: "btns" }, h("button", { class: "btn primary", type: "submit", text: "Add date" })));
  }
  function viewMySites(main) {
    main.append(head("Your sites", "The sites you can manage."));
    main.append(h("section", { class: "card" }, h("div", null, S.sites.map((st) => h("div", { class: "switch-row" },
      h("div", null, h("b", { text: st.name }), h("div", { class: "hint", text: st.domain || "No web address yet" })),
      h("div", { class: "btns" }, h("button", { class: "btn sm", type: "button", text: "Open", onclick: () => switchSite(st.id, "home") }),
        st.domain ? h("a", { class: "btn sm ghost", href: "https://" + st.domain, target: "_blank", rel: "noopener", text: "Visit ↗" }) : null))))));
  }

