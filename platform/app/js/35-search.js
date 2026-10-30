  /* ======================================================
     SEARCH EVERYTHING (⌘K): pages, settings, shows, fans and sites
     ====================================================== */
  // words people use for a setting, and where it lives
  const SEARCH_HINTS = [["QR code", "ct/me", "links"], ["Template", "ct/me", "look"], ["Lettering", "ct/me", "look"], ["Doodles", "ct/me", "look"], ["Background / wall", "ct/me", "look"],
    ["Ticket buttons", "ct/me", "look"], ["Socials", "ct/me", "basics"], ["Photo", "ct/me", "basics"], ["Bio", "ct/me", "basics"], ["The Tape", "ct/me", "basics"], ["Links", "ct/me", "links"],
    ["What's on my Coaster", "ct/me", "on"], ["Team", "ct/me", null], ["Podcast player", "ct/media", null], ["Spotify", "ct/media", null], ["YouTube channel", "ct/media", null], ["Shorts", "ct/media", null],
    ["Password", "ct/account", null], ["Dark or light", "ct/account", null], ["Press kit", "ct/press", null]];
  let searchCache = null;
  async function openSearch() {
    if ($("searchBox")) return;
    const back = document.activeElement;
    const input = h("input", { type: "search", id: "searchInput", placeholder: "Search pages, settings, shows, fans", autocomplete: "off", "aria-label": "Search everything", role: "combobox", "aria-controls": "searchList", "aria-expanded": "true" });
    const list = h("div", { class: "sp-list", id: "searchList", role: "listbox", "aria-label": "Results" });
    let items = [], active = 0;
    const close = () => { wrap.remove(); if (back && back.focus) back.focus(); };
    const go2 = (it) => { close(); it.go(); };
    // what can be found
    const pages = menuItems().filter((x) => x.label && x.key !== "pick").map((x) => ({ group: "Pages", label: x.label, sub: x.site ? "Website" : "", go: x.onGo }));
    const hints = S.me ? SEARCH_HINTS.map(([l, to, part]) => ({ group: "Settings", label: l, sub: to === "ct/me" ? "My Coaster" : "", go: () => { if (part) ME_OPEN = part; goCT(to.slice(3)); } })) : [];
    const sites = S.sites.map((st) => ({ group: "Sites", label: st.name, sub: st.domain || "", go: () => switchSite(st.id, "home") }));
    const draw = () => {
      const t = input.value.trim().toLowerCase();
      const pool = [...pages, ...hints, ...(searchCache ? searchCache : []), ...sites];
      const hit = (x) => !t || (x.label + " " + (x.sub || "")).toLowerCase().includes(t);
      const shown = t ? pool.filter(hit).slice(0, 40) : [...pages.slice(0, 8)];
      items = shown; list.replaceChildren();
      let last = "";
      shown.forEach((it, i) => {
        if (it.group !== last) { list.append(h("div", { class: "sp-group", text: it.group })); last = it.group; }
        list.append(h("button", { type: "button", role: "option", class: "sp-item", id: "sr-" + i, "aria-selected": String(i === active), onclick: () => go2(it), onmousemove: () => { if (active !== i) { active = i; mark(); } } },
          h("b", { text: it.label }), it.sub ? h("span", { class: "hint", text: it.sub }) : null));
      });
      if (!shown.length) list.append(h("div", { class: "empty", style: "padding:18px" }, h("b", { text: "Nothing matches “" + input.value.trim() + "”" })));
      mark();
    };
    const mark = () => { items.forEach((_, i) => { const b = $("sr-" + i); if (b) b.setAttribute("aria-selected", String(i === active)); }); const cur = $("sr-" + active); if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: "nearest" }); };
    input.addEventListener("input", () => { active = 0; draw(); });
    input.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") { e.preventDefault(); active = Math.min(items.length - 1, active + 1); mark(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); active = Math.max(0, active - 1); mark(); }
      else if (e.key === "Enter") { e.preventDefault(); if (items[active]) go2(items[active]); }
      else if (e.key === "Escape") { e.preventDefault(); close(); }
    });
    const wrap = h("div", { class: "sp-wrap", id: "searchBox", onmousedown: (e) => { if (e.target === wrap) close(); } },
      h("div", { class: "sp-box", role: "dialog", "aria-modal": "true", "aria-label": "Search everything" }, input, list,
        h("div", { class: "sp-foot hint", text: "↑ ↓ to move · Enter to open · Esc to close" })));
    document.body.append(wrap);
    draw(); input.focus();
    // shows and fans load once, then they're searchable too
    if (!searchCache) {
      const found = [];
      try {
        if (S.me) {
          const shows = await q(sb.rpc("comic_shows", { p_comic: S.me.id }));
          shows.filter((d) => d.date >= today()).forEach((d) => found.push({ group: "Shows", label: (d.venue || "Show") + " · " + shortDate(d.date), sub: d.city || "", go: () => goCT("dates") }));
          const fans = await q(sb.from("comic_fans").select("name,email,city,state").eq("comic_id", S.me.id).limit(3000));
          fans.forEach((f) => found.push({ group: "Fans", label: f.name || f.email, sub: [f.email, f.city].filter(Boolean).join(" · "), go: () => goCT("fans") }));
        } else (S.shows || []).filter((s) => s.date >= today()).forEach((s) => found.push({ group: "Shows", label: (s.venue || "Show") + " · " + shortDate(s.date), sub: s.city || "", go: () => go("shows") }));
      } catch (e) {}
      searchCache = found;
      if ($("searchBox")) draw();
    }
  }
