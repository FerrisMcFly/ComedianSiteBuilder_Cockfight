  /* ======================================================
     SHOWS
     ====================================================== */
  const run = { open: false, step: 1, host: null, venue: null, days: new Set(), slots: [], month: null, showPaste: false };
  const list = { host: "all", past: false, q: "" };
  let editingShow = null, dupOf = null; // dupOf: the show being duplicated (its copy shows up right below it)
  let redrawShows = () => {};
  const STATUS = [["on_sale", "On sale"], ["few_left", "Few left"], ["sold_out", "Sold out"], ["free", "Free"], ["cancelled", "Cancelled"]];

  function viewShows(main) {
    const listCard = h("section", { class: "card" });
    const foundCard = h("div"), finder = h("div");
    main.append(head("Shows", "Your upcoming shows. Past ones drop off your site on their own.",
      h("button", { class: "btn primary big", type: "button", id: "addShowsBtn", text: "+ Add shows", onclick: () => openRun() })), h("div", { class: "stack" }, foundCard, listCard, finder, optionsFold(["home_shows", "shows_style"], "How shows look on your site")));
    redrawShows = () => { drawShowList(listCard, redrawShows); drawFound(foundCard); drawFinder(finder); };
    redrawShows();
    if (run.open) drawPanel();
  }

  /* ---------- show finder: pages ComicTable checks for new dates ---------- */
  const hostForComic = (c) => S.hosts.find((x) => x.comic_id === c);
  async function drawFound(box) {
    let found = [];
    try { found = await q(sb.from("found_shows").select("*").eq("state", "new").gte("date", today()).order("date", { ascending: true })); } catch (e) { box.replaceChildren(); return; }
    found = found.filter((f) => (f.comic_id ? !!hostForComic(f.comic_id) : f.site_id === sid()));
    if (!found.length) { box.replaceChildren(); return; }
    const add = async (list) => {
      const rows = list.map((f) => { const who = f.comic_id ? hostForComic(f.comic_id) : null;
        return { site_id: sid(), host: who ? who.id : null, lineup: who ? null : crew(), date: f.date, time: f.time, venue: f.venue, city: f.city, venue_id: f.venue_id, url: f.url, status: f.status || "on_sale" }; });
      await q(sb.from("shows").insert(rows));
      await q(sb.from("found_shows").update({ state: "added" }).in("id", list.map((f) => f.id)));
      await reload.shows(); redrawShows(); refreshNav();
    };
    box.replaceChildren(h("section", { class: "card", style: "border-color:var(--accent)" },
      h("div", { class: "toolbar" }, h("h2", { style: "margin:0", text: "Found " + found.length + " new show" + (found.length === 1 ? "" : "s") }),
        found.length > 1 ? h("button", { class: "btn primary sm", type: "button", text: "Add all " + found.length, onclick: async (e) => { e.currentTarget.disabled = true; try { await add(found); toast("Added " + found.length + " shows. They're live."); confetti(); } catch (er) { toast(errText(er), { bad: true }); } } }) : null),
      h("p", { class: "sub", text: "ComicTable spotted these on the pages you asked it to watch. Add the ones that are right." }),
      h("div", null, found.map((f) => h("div", { class: "switch-row" },
        h("div", { style: "min-width:0" }, h("b", { text: shortDate(f.date) + (f.time ? " at " + f.time : "") + " · " + (f.venue || f.city || "Show") }),
          h("div", { class: "hint wrap-any", text: [f.comic_id ? (hostForComic(f.comic_id) || {}).name : "Whole show", f.city, f.status === "sold_out" ? "Sold out" : "", f.title && f.title !== (hostForComic(f.comic_id) || {}).name ? "Listed as “" + f.title + "”" : ""].filter(Boolean).join(" · ") }),
          f.url ? h("a", { class: "hint", href: f.url, target: "_blank", rel: "noopener", text: "Ticket link ↗" }) : null),
        h("div", { class: "btns" },
          h("button", { class: "btn primary sm", type: "button", text: "Add", onclick: async (e) => { e.currentTarget.disabled = true; try { await add([f]); toast("Added. It's live."); } catch (er) { toast(errText(er), { bad: true }); } } }),
          h("button", { class: "btn ghost sm", type: "button", text: "Ignore", onclick: async () => { try { await q(sb.from("found_shows").update({ state: "ignored" }).eq("id", f.id)); drawFound(box); } catch (er) { toast(errText(er), { bad: true }); } } })))))));
  }
  function drawFinder(box) {
    const srcs = S.sources.filter((x) => x.kind === "shows" && (x.site_id === sid() || (x.comic_id && hostForComic(x.comic_id))));
    const whoOf = (src) => src.comic_id ? ((hostForComic(src.comic_id) || {}).name || "Someone") : "Whole show";
    const who = h("select", { id: "finderWho", "aria-label": "Whose shows", style: "width:auto" },
      S.hosts.map((x) => h("option", { value: x.id, text: x.name })), S.hosts.length > 1 ? h("option", { value: EVENT, text: "Whole show" }) : null);
    const url = h("input", { type: "url", id: "finderUrl", placeholder: "https://… their tour page, a club's calendar, Eventbrite, or a .ics calendar link", "aria-label": "Page to check" });
    const auto = h("select", { id: "finderMode", "aria-label": "When it finds a show", style: "width:auto" },
      h("option", { value: "ask", text: "Let me check them first" }), h("option", { value: "auto", text: "Add them automatically" }));
    const allMine = h("input", { type: "checkbox", id: "finderAll" });
    const msg = h("div", { class: "err" });
    box.replaceChildren(h("section", { class: "card" },
      h("div", { class: "toolbar", style: "margin-bottom:4px" }, h("h2", { style: "margin:0", text: "Find shows automatically" }),
        srcs.length > 1 ? h("button", { class: "btn sm", type: "button", text: "Check all now", onclick: () => importNow("shows", redrawShows) }) : null),
      h("p", { class: "sub", text: "Point ComicTable at the pages where dates get listed and it checks them every hour. On a club's calendar it only picks up shows that mention the comic's name." }),
      srcs.length ? h("div", null, srcs.map((src) => {
        const isErr = src.last_status && /^Error/.test(src.last_status);
        let host = src.url; try { host = new URL(src.url).hostname.replace(/^www\./, ""); } catch (e) {}
        return h("div", { class: "switch-row", style: "flex-wrap:wrap;align-items:start" },
          h("div", { style: "min-width:0;flex:1 1 260px" },
            h("div", { class: "btns", style: "gap:6px" }, h("b", { text: whoOf(src) + " · " + host }),
              !src.enabled ? h("span", { class: "pill", text: "Paused" }) : !src.last_status ? h("span", { class: "pill", text: "Not checked yet" }) : isErr ? h("span", { class: "pill red", text: "Problem" }) : h("span", { class: "pill ok", text: "Working" }),
              h("span", { class: "pill", text: src.auto_add ? "Adds automatically" : "Asks first" })),
            h("div", { class: "hint wrap-any", text: src.url }),
            src.site_id !== sid() ? h("div", { class: "hint", text: "Set up on " + siteName(src.site_id) + ". Dates it finds show here too." }) : null,
            isErr ? h("div", { class: "err", style: "font-size:13px", text: src.last_status.replace(/^Error:\s*/, "") })
              : src.last_run_at ? h("div", { class: "hint", text: "Last check " + new Date(src.last_run_at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) + (src.last_status ? ": " + src.last_status : "") }) : null),
          h("div", { class: "btns" },
            h("button", { class: "btn sm", type: "button", text: "Check now", onclick: () => importNow("shows", redrawShows, src.id) }),
            h("button", { class: "btn ghost sm", type: "button", text: src.auto_add ? "Ask me first" : "Add automatically", onclick: async () => { try { await q(sb.from("sources").update({ auto_add: !src.auto_add }).eq("id", src.id)); await reload.sources(); redrawShows(); } catch (e) { toast(errText(e), { bad: true }); } } }),
            h("button", { class: "btn ghost sm", type: "button", text: src.enabled ? "Pause" : "Resume", onclick: async () => { try { await q(sb.from("sources").update({ enabled: !src.enabled }).eq("id", src.id)); await reload.sources(); redrawShows(); } catch (e) { toast(errText(e), { bad: true }); } } }),
            sure("Stop checking", async () => { try { await q(sb.from("sources").delete().eq("id", src.id)); await reload.sources(); redrawShows(); toast("Stopped checking that page. Shows already added stay."); } catch (er) { toast(errText(er), { bad: true }); } })));
      })) : null,
      h("div", { class: srcs.length ? "newclub stack" : "stack", style: "gap:10px;margin-top:" + (srcs.length ? "12px" : "4px") },
        srcs.length ? h("b", { text: "Watch another page" }) : null,
        h("div", { class: "btns" }, S.hosts.length > 1 ? who : null, h("div", { style: "flex:1 1 300px" }, url)),
        h("div", { class: "btns" }, h("label", { class: "hint", style: "display:flex;gap:6px;align-items:center" }, "When it finds one:", auto),
          h("label", { class: "check" }, allMine, "Every show on this page is theirs (their own tour page)")),
        msg,
        h("div", { class: "btns" }, h("button", { class: "btn primary", type: "button", id: "finderAdd", text: "Start checking", onclick: async (e) => {
          const u = url.value.trim(); msg.textContent = "";
          if (!/^https?:\/\//i.test(u)) { url.classList.add("bad"); msg.textContent = "Paste the full link, starting with https://"; return; }
          const hv = S.hosts.length > 1 ? who.value : (S.hosts[0] || {}).id;
          const comic_id = hv && hv !== EVENT ? hostComic(hv) : null;
          if (srcs.some((x) => x.url.replace(/\/+$/, "") === u.replace(/\/+$/, "") && (x.comic_id || null) === comic_id)) { msg.textContent = "That page is already being checked for them."; return; }
          e.currentTarget.disabled = true;
          try {
            const created = await q(sb.from("sources").insert({ site_id: sid(), kind: "shows", url: u, host: comic_id ? hv : null, comic_id, auto_add: auto.value === "auto", match_all: allMine.checked }).select().single());
            await reload.sources(); redrawShows(); importNow("shows", redrawShows, created && created.id);
          } catch (er) { msg.textContent = errText(er); e.currentTarget.disabled = false; }
        } })))));
  }

  async function loadSlots(venueId) {
    if (!venueId || S.slotCache[venueId]) return;
    try { S.slotCache[venueId] = await q(sb.rpc("venue_slots", { v: venueId })); } catch (e) { S.slotCache[venueId] = []; }
  }
  function timesFor(venue, dow) {
    const learned = (S.slotCache[venue && venue.id] || []).filter((r) => r.dow === dow).sort((a, b) => b.uses - a.uses).slice(0, 3).map((r) => to24(r.show_time)).filter(Boolean);
    if (learned.length) return [...new Set(learned)].sort();
    const dflt = venue && venue.default_times && venue.default_times[dow];
    if (dflt && dflt.length) return dflt.map(to24).filter(Boolean).sort();
    return DEFAULT_TIMES[dow].slice();
  }
  function setDay(date, on, times) {
    if (on) { run.days.add(date); if (!run.slots.some((s) => s.date === date)) for (const t of times || timesFor(run.venue, parseISO(date).getDay())) run.slots.push({ date, time: t, url: "" }); }
    else { run.days.delete(date); run.slots = run.slots.filter((s) => s.date !== date); }
  }
  const sortedSlots = () => run.slots.slice().sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

  /* ---------- the "Add shows" panel: one step at a time ---------- */
  let panelReturnFocus = null;
  function openRun(prefill) {
    const ok = (id) => id === EVENT ? S.hosts.length > 1 : S.hosts.some((x) => x.id === id);
    if (!ok(run.host)) run.host = store.get("csb_host_" + sid());
    if (!ok(run.host)) run.host = (S.hosts[0] || {}).id;
    if (prefill) {
      run.venue = null; run.days.clear(); run.slots = []; run.showPaste = false;
      Object.assign(run, prefill);
    }
    if (!run.month) { const d = new Date(); run.month = new Date(d.getFullYear(), d.getMonth(), 1); }
    run.step = !run.venue ? 1 : run.slots.length && run.step === 3 ? 3 : 2;
    run.open = true;
    panelReturnFocus = document.activeElement;
    drawPanel();
  }
  function closeRun() {
    run.open = false;
    const p = $("runPanel"); if (p) p.remove();
    document.body.style.overflow = "";
    if (panelReturnFocus && panelReturnFocus.focus) panelReturnFocus.focus();
  }
  function resetRun() { run.venue = null; run.days.clear(); run.slots = []; run.step = 1; run.showPaste = false; }

  function drawPanel() {
    let wrap = $("runPanel");
    if (!wrap) {
      wrap = h("div", { id: "runPanel", class: "drawer-wrap" });
      wrap.addEventListener("keydown", (e) => { if (e.key === "Escape" && !(e.target.classList && e.target.classList.contains("club-search"))) closeRun(); });
      document.body.append(wrap);
    }
    document.body.style.overflow = "hidden";
    const n = run.slots.length;
    const steps = [[1, "Club"], [2, "Dates"], [3, "Times & tickets"]];
    const canGo = (k) => k === 1 || (k === 2 && run.venue) || (k === 3 && run.venue && n);
    const progress = h("ol", { class: "steps" }, steps.map(([k, label]) => h("li", { class: k === run.step ? "on" : k < run.step ? "done" : "" },
      h("button", { type: "button", disabled: !canGo(k) || k === run.step, onclick: () => { run.step = k; drawPanel(); } }, h("span", { class: "dotnum", text: k < run.step ? "✓" : String(k) }), label))));
    const who = S.hosts.find((x) => x.id === run.host);
    const summary = run.venue ? h("div", { class: "run-summary" },
      h("div", null, h("b", { text: run.venue.name }), h("div", { class: "hint", text: venueCity(run.venue) + (S.hosts.length > 1 && who ? " · " + who.name : "") })),
      h("button", { class: "btn ghost sm", type: "button", text: "Change", onclick: () => { run.step = 1; drawPanel(); } })) : null;

    let body, footer;
    if (run.step === 1) {
      const pick = async (v) => {
        const changed = !run.venue || run.venue.id !== v.id;
        run.venue = v; await loadSlots(v.id);
        if (changed) { const days = [...run.days]; run.slots = []; run.days.clear(); days.forEach((d) => setDay(d, true)); }
        run.step = 2; drawPanel();
      };
      const recent = recentVenues(run.host).filter((v) => !run.venue || v.id !== run.venue.id);
      body = h("div", { class: "stack" },
        S.hosts.length > 1 ? h("div", { class: "field" }, h("span", { text: "Who's performing?" }),
          h("div", { class: "seg", role: "group", "aria-label": "Comedian" }, S.hosts.map((x) => h("button", { type: "button", "aria-pressed": String(run.host === x.id), text: x.name,
            onclick: () => { run.host = x.id; store.set("csb_host_" + sid(), x.id); drawPanel(); } })),
            h("button", { type: "button", "aria-pressed": String(run.host === EVENT), text: "Whole show", title: "A show with everyone, like a live podcast",
              onclick: () => { run.host = EVENT; store.set("csb_host_" + sid(), EVENT); drawPanel(); } }))) : null,
        h("div", { class: "field" }, h("span", { text: "Which club?" }), clubPicker(pick)),
        recent.length ? h("div", { class: "field" }, h("span", { text: "Recent clubs" }), h("div", { class: "chips" }, recent.map((v) => h("button", { class: "chip", type: "button", onclick: () => pick(v) }, v.name, h("small", { class: "hint", text: " · " + v.city }))))) : null,
        run.venue ? h("button", { class: "btn ghost sm", type: "button", style: "justify-self:start", text: "Keep " + run.venue.name + " →", onclick: () => { run.step = 2; drawPanel(); } }) : null);
      footer = h("div", { class: "drawer-foot" }, h("span", { class: "hint", text: "Can't find it? Type the name and choose “Add as a new club”." }));
      setTimeout(() => { const i = $("clubSearch"); i && i.focus(); });
    } else if (run.step === 2) {
      const chosen = [...run.days].sort();
      const pasteTA = h("textarea", { placeholder: "Fri Nov 6 — 7:00 PM, 9:30 PM\nSat Nov 7 — 6:00 PM, 8:30 PM", "aria-label": "Showtimes text" });
      body = h("div", { class: "stack" }, summary,
        h("div", { class: "field" }, h("span", { text: "Tap the days you're playing" }), calendar(run.month, drawPanel)),
        chosen.length ? h("div", { class: "chips" }, chosen.map((d) => h("button", { class: "chip on", type: "button", "aria-label": "Remove " + niceDate(d), onclick: () => { setDay(d, false); drawPanel(); } }, shortDate(d) + "  ✕"))) : h("p", { class: "hint", text: "Green dots mark days you already have a show." }),
        h("details", { class: "quiet" }, h("summary", { text: "Or paste the showtimes from the club's website" }),
          h("div", { class: "stack", style: "gap:8px;margin-top:8px" }, pasteTA, h("button", { class: "btn sm", type: "button", style: "justify-self:start", text: "Fill in from this text", onclick: () => {
            const found = parseShowtimes(pasteTA.value);
            if (!found.length) { toast("Couldn't find any dates in that. Try lines like “Fri Nov 6 7:00 PM, 9:30 PM”.", { bad: true }); return; }
            for (const f of found) { setDay(f.date, false); setDay(f.date, true, f.times.length ? f.times : null); }
            const d0 = parseISO(found[0].date); run.month = new Date(d0.getFullYear(), d0.getMonth(), 1);
            run.step = 3; drawPanel(); toast("Found " + run.slots.length + " shows. Check the times.");
          } }))));
      footer = h("div", { class: "drawer-foot" },
        h("button", { class: "btn ghost", type: "button", text: "← Back", onclick: () => { run.step = 1; drawPanel(); } }),
        h("button", { class: "btn primary big", type: "button", id: "toTimes", disabled: !n, text: n ? "Next: times & tickets (" + n + " show" + (n > 1 ? "s" : "") + ")" : "Pick at least one day", onclick: () => { run.step = 3; drawPanel(); } }));
    } else {
      const slotsBox = h("div", { class: "slots" });
      let lastDay = "";
      for (const s of sortedSlots()) {
        if (s.date !== lastDay) {
          lastDay = s.date; const day = s.date;
          slotsBox.append(h("div", { class: "slot-day" }, h("span", { text: niceDate(day) }), h("button", { class: "btn ghost sm", type: "button", text: "+ time", onclick: () => {
            const ts = run.slots.filter((x) => x.date === day).map((x) => x.time).sort(); const last = ts[ts.length - 1] || "19:00";
            const [H, M] = last.split(":").map(Number); const mins = Math.min(23 * 60 + 30, H * 60 + M + 150);
            run.slots.push({ date: day, time: pad(Math.floor(mins / 60)) + ":" + pad(mins % 60), url: "" }); drawPanel();
          } })));
        }
        slotsBox.append(h("div", { class: "slot" },
          h("input", { type: "time", value: s.time, step: "300", "aria-label": "Time on " + shortDate(s.date), oninput: (e) => { s.time = e.target.value; } }),
          h("input", { type: "url", class: "url", value: s.url, placeholder: "Ticket link (optional)", "aria-label": "Ticket link for " + shortDate(s.date) + " " + (to12(s.time) || ""), oninput: (e) => { s.url = e.target.value.trim(); e.target.classList.remove("bad"); } }),
          h("button", { class: "btn ghost sm rm", type: "button", "aria-label": "Remove this show", text: "✕", onclick: () => { run.slots.splice(run.slots.indexOf(s), 1); if (!run.slots.some((x) => x.date === s.date)) run.days.delete(s.date); if (!run.slots.length) run.step = 2; drawPanel(); } })));
      }
      const links = h("textarea", { id: "pasteLinks", placeholder: "Paste your ticket links here, one per line", "aria-label": "Ticket links, one per line" });
      const pasteBox = h("div", { class: "paste" }, h("div", { class: "hint", text: "One per line, in the same order as the shows below. Paste just one link and it's used for every show." }), links,
        h("div", { class: "btns" }, h("button", { class: "btn sm primary", type: "button", text: "Fill in links", onclick: () => {
          const urls = links.value.split(/\s+/).map((x) => x.trim()).filter((x) => /^https?:\/\//i.test(x));
          if (!urls.length) { toast("No links found. Each one should start with https://", { bad: true }); return; }
          const ordered = sortedSlots();
          if (urls.length === 1) ordered.forEach((s) => { s.url = urls[0]; });
          else ordered.forEach((s, i) => { if (urls[i]) s.url = urls[i]; });
          run.showPaste = false; drawPanel();
          const extra = urls.length - ordered.length;
          toast(urls.length === 1 ? "Using that link for all " + ordered.length + " shows." : extra > 0 ? "Filled " + ordered.length + " shows. " + extra + " extra link" + (extra > 1 ? "s were" : " was") + " left over." : urls.length < ordered.length ? "Filled " + urls.length + " of " + ordered.length + " shows." : "Filled all " + urls.length + " ticket links.");
        } }), h("button", { class: "btn sm ghost", type: "button", text: "Cancel", onclick: () => { run.showPaste = false; drawPanel(); } })));
      const msg = h("div", { class: "err" });
      const save = h("button", { class: "btn primary big", type: "button", id: "saveRun", text: "Add " + n + " show" + (n === 1 ? "" : "s"), onclick: async () => {
        msg.textContent = "";
        if (run.slots.some((s) => s.url && !/^https?:\/\//i.test(s.url))) { msg.textContent = "One of the ticket links doesn't start with https://"; return; }
        const v = run.venue;
        const who0 = run.host === EVENT ? { host: null, lineup: crew() } : { host: run.host };
        const rows = sortedSlots().map((s) => ({ site_id: sid(), ...who0, date: s.date, time: to12(s.time), venue: v.name, city: venueCity(v), venue_id: v.id, url: s.url || null, status: "on_sale" }));
        save.disabled = true;
        try {
          await q(sb.from("shows").insert(rows));
          await reload.shows(); delete S.slotCache[v.id];
          const who = run.host === EVENT ? S.site.name : first(run.host), where = v.name;
          resetRun(); closeRun(); redrawShows(); refreshNav(); confetti();
          toast("🎤 " + rows.length + " show" + (rows.length > 1 ? "s" : "") + " live for " + who + " at " + where + "!");
        } catch (e) { msg.textContent = errText(e); save.disabled = false; }
      } });
      body = h("div", { class: "stack" }, summary,
        run.showPaste ? pasteBox : h("button", { class: "btn", type: "button", style: "justify-self:start", id: "openPaste", text: "Paste all ticket links at once", onclick: () => { run.showPaste = true; drawPanel(); setTimeout(() => $("pasteLinks") && $("pasteLinks").focus()); } }),
        h("p", { class: "hint", style: "margin:0", text: S.slotCache[run.venue.id] && S.slotCache[run.venue.id].length ? "Times are this club's usual showtimes. Change any that are off." : "Times are typical showtimes. Change any that are off." }),
        slotsBox, msg);
      footer = h("div", { class: "drawer-foot" }, h("button", { class: "btn ghost", type: "button", text: "← Back", onclick: () => { run.step = 2; drawPanel(); } }), save);
    }

    const panel = h("aside", { class: "drawer", role: "dialog", "aria-modal": "true", "aria-label": "Add shows" },
      h("div", { class: "drawer-head" }, h("h2", { text: "Add shows" }), h("button", { class: "btn ghost sm", type: "button", "aria-label": "Close", text: "✕", onclick: closeRun })),
      progress, h("div", { class: "drawer-body" }, body), footer);
    wrap.replaceChildren(h("div", { class: "drawer-backdrop", onclick: closeRun }), panel);
  }

  const isNewClub = (v) => !!(v && v.created_by_site && !v.verified);
  // "The Comedy Club at Duckworth's" ~ "duckworths comedy club": compare the words that matter
  const clubKey = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/['’]/g, "").replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/).filter((w) => w && !["the", "a", "at", "and", "of", "comedy", "club", "clubs", "lounge", "theater", "theatre", "house", "room", "bar", "co"].includes(w));
  function similarClubs(name, city) {
    const k = clubKey(name), c = String(city || "").trim().toLowerCase();
    if (!k.length) return [];
    return S.venues.filter((v) => {
      if (c && String(v.city).toLowerCase() !== c) return false;
      const vk = clubKey(v.name); if (!vk.length) return false;
      const shared = k.filter((w) => vk.includes(w)).length;
      return shared / Math.min(k.length, vk.length) >= 0.6;
    }).slice(0, 3);
  }
  function recentVenues(host) {
    const seen = new Set(), out = [];
    for (const s of S.shows.slice().sort((a, b) => b.date.localeCompare(a.date))) {
      if (s.host !== host || !s.venue_id || seen.has(s.venue_id)) continue;
      const v = venueById(s.venue_id); if (!v) continue;
      seen.add(s.venue_id); out.push(v); if (out.length >= 5) break;
    }
    return out;
  }

  function clubPicker(onPick, idBase) {
    const base = idBase || "club";
    const nc = base === "club" ? "nc" : base + "Nc"; // ids for the new-club form
    const wrap = h("div", { class: "combo" });
    const input = h("input", { id: base + "Search", class: "club-search", placeholder: "Search clubs: “Laugh Boston”, “Improv”, “Denver”…", autocomplete: "off", role: "combobox", "aria-expanded": "false", "aria-controls": base + "List", "aria-label": "Search clubs" });
    const listEl = h("div", { class: "combo-list", id: base + "List", role: "listbox", hidden: true });
    const newBox = h("div");
    let items = [], sel = 0;
    const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ");
    function search() {
      const words = norm(input.value).split(/\s+/).filter(Boolean);
      if (!words.length) { listEl.hidden = true; input.setAttribute("aria-expanded", "false"); return; }
      const scored = [];
      for (const v of S.venues) {
        const hay = norm(v.name + " " + v.city + " " + (v.state || ""));
        if (!words.every((w) => hay.includes(w))) continue;
        scored.push([norm(v.name).startsWith(words[0]) ? 0 : 1, v]);
      }
      scored.sort((a, b) => a[0] - b[0] || a[1].name.localeCompare(b[1].name));
      items = scored.slice(0, 8).map((x) => x[1]); sel = 0; draw();
    }
    function draw() {
      listEl.replaceChildren(...items.map((v, i) => h("button", { class: "combo-item", type: "button", role: "option", "aria-selected": String(i === sel), onmousedown: (e) => e.preventDefault(), onclick: () => onPick(v) },
        h("span", null, v.name, isNewClub(v) ? h("small", { text: "  (new)" }) : null), h("small", { text: venueCity(v) }))),
        h("button", { class: "combo-item new", type: "button", role: "option", "aria-selected": String(sel === items.length), onmousedown: (e) => e.preventDefault(), onclick: () => showNew() }, "+ Add “" + input.value.trim() + "” as a new club"));
      listEl.hidden = false; input.setAttribute("aria-expanded", "true");
    }
    function showNew() {
      listEl.hidden = true;
      const name = h("input", { id: nc + "Name", value: input.value.trim(), required: true });
      const city = h("input", { id: nc + "City", placeholder: "Boston", required: true });
      const state = h("input", { id: nc + "State", placeholder: "MA", maxlength: "3" });
      const site = h("input", { id: nc + "Site", type: "url", placeholder: "https://… (optional)" });
      const msg = h("div", { class: "err" });
      const save = h("button", { class: "btn primary", type: "button", text: "Save club", onclick: async () => {
        msg.textContent = "";
        if (!name.value.trim()) { name.classList.add("bad"); name.focus(); return; }
        if (!city.value.trim()) { city.classList.add("bad"); city.focus(); return; }
        const twins = save.dataset.anyway ? [] : similarClubs(name.value, city.value);
        if (twins.length) {
          msg.replaceChildren(h("span", { class: "hint", style: "color:var(--text)", text: "Did you mean one of these? " }),
            ...twins.map((v) => h("button", { class: "chip", type: "button", style: "margin:4px 6px 0 0", text: v.name + " · " + venueCity(v), onclick: () => onPick(v) })));
          save.dataset.anyway = "1"; save.textContent = "No, add it as a new club";
          return;
        }
        save.disabled = true;
        const row = { name: name.value.trim(), city: city.value.trim(), state: state.value.trim().toUpperCase() || null, website: site.value.trim() || null,
          status: "approved", verified: false, created_by_site: sid() };
        try {
          const created = await q(sb.from("venues").insert(row).select().single());
          await reload.venues(); toast("Added " + created.name + " to the club database.");
          onPick(venueById(created.id) || created);
        } catch (e) { msg.textContent = /already exists/.test(errText(e)) ? "That club is already on the list. Search for it above." : errText(e); save.disabled = false; }
      } });
      newBox.replaceChildren(h("div", { class: "newclub stack", style: "gap:10px;margin-top:8px" }, h("b", { text: "New club" }),
        h("div", { class: "grid" }, field("Club name", name, "c6"), field("City", city, "c4"), field("State", state, "c2"), field("Website", site, "c12")),
        msg, h("div", { class: "btns" }, save, h("button", { class: "btn ghost", type: "button", text: "Cancel", onclick: () => newBox.replaceChildren() }))));
      city.focus();
    }
    input.addEventListener("input", search);
    input.addEventListener("focus", search);
    input.addEventListener("blur", () => setTimeout(() => { listEl.hidden = true; input.setAttribute("aria-expanded", "false"); }, 120));
    input.addEventListener("keydown", (e) => {
      if (listEl.hidden) return;
      if (e.key === "ArrowDown") { e.preventDefault(); sel = Math.min(items.length, sel + 1); draw(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); sel = Math.max(0, sel - 1); draw(); }
      else if (e.key === "Enter") { e.preventDefault(); sel < items.length ? onPick(items[sel]) : showNew(); }
      else if (e.key === "Escape") { listEl.hidden = true; }
    });
    wrap.append(input, listEl);
    return h("div", null, wrap, newBox);
  }

  function calendar(month, redraw) {
    const y = month.getFullYear(), m = month.getMonth();
    const firstDow = new Date(y, m, 1).getDay(), days = new Date(y, m + 1, 0).getDate();
    const t0 = today(), now = new Date();
    const booked = new Set(S.shows.filter((s) => s.host === run.host).map((s) => s.date));
    const headRow = h("div", { class: "cal-head" },
      h("button", { class: "btn ghost sm", type: "button", "aria-label": "Previous month", text: "‹", disabled: y < now.getFullYear() || (y === now.getFullYear() && m <= now.getMonth()), onclick: () => { run.month = new Date(y, m - 1, 1); redraw(); } }),
      h("span", { text: MONTH_FULL[m] + " " + y }),
      h("button", { class: "btn ghost sm", type: "button", "aria-label": "Next month", text: "›", onclick: () => { run.month = new Date(y, m + 1, 1); redraw(); } }));
    const grid = h("div", { class: "cal-grid" }, ["S", "M", "T", "W", "T", "F", "S"].map((d) => h("div", { class: "cal-dow", text: d })));
    for (let i = 0; i < firstDow; i++) grid.append(h("span"));
    for (let d = 1; d <= days; d++) {
      const ds = y + "-" + pad(m + 1) + "-" + pad(d);
      grid.append(h("button", { class: "day" + (ds === t0 ? " today" : ""), type: "button", "data-date": ds, "aria-pressed": String(run.days.has(ds)), disabled: ds < t0, "aria-label": niceDate(ds) + (booked.has(ds) ? ", already has a show" : ""),
        onclick: () => { setDay(ds, !run.days.has(ds)); redraw(); } }, String(d), booked.has(ds) ? h("span", { class: "dot" }) : null));
    }
    return h("div", { class: "cal" }, headRow, grid);
  }

  function drawShowList(card, redraw) {
    const t0 = today();
    const base = S.shows.filter((s) => list.past || s.date >= t0);
    const chips = S.hosts.length > 1 ? h("div", { class: "seg", role: "group", "aria-label": "Filter by comedian" },
      h("button", { type: "button", "aria-pressed": String(list.host === "all"), text: "Everyone", onclick: () => { list.host = "all"; redraw(); } }),
      S.hosts.map((x) => h("button", { type: "button", "aria-pressed": String(list.host === x.id), text: first(x.id), onclick: () => { list.host = x.id; redraw(); } }))) : h("span");
    const search = h("input", { type: "search", class: "search", placeholder: "Search city or club", value: list.q, "aria-label": "Search shows" });
    const past = h("label", { class: "check" }, h("input", { type: "checkbox", checked: list.past, onchange: (e) => { list.past = e.target.checked; redraw(); } }), "Show past");
    const pastCount = S.shows.filter((s) => s.date < t0).length;
    const clear = pastCount && list.past ? h("button", { class: "btn sm ghost danger", type: "button", text: "Clear " + pastCount + " past", onclick: async () => {
      const gone = S.shows.filter((s) => s.date < t0);
      try { await q(sb.from("shows").delete().in("id", gone.map((x) => x.id))); await reload.shows(); redraw(); refreshNav();
        toast("Cleared " + gone.length + " past shows.", { action: { label: "Undo", run: () => restore(gone, redraw) } }); } catch (e) { toast(errText(e), { bad: true }); }
    } }) : null;
    const tbody = h("tbody");
    const count = h("span", { class: "hint" });
    const draw = () => {
      const qq = list.q.toLowerCase();
      const rows = base.filter((s) => (list.host === "all" || s.host === list.host || (s.event && (s.lineup_hosts || []).includes(list.host))) && (!qq || ((s.city || "") + " " + (s.venue || "")).toLowerCase().includes(qq)))
        .sort((a, b) => (a.date + to24(a.time)).localeCompare(b.date + to24(b.time)));
      count.textContent = rows.length + " show" + (rows.length === 1 ? "" : "s");
      tbody.replaceChildren();
      let lastM = "";
      for (const s of rows) {
        const mo = monthLabel(s.date);
        if (mo !== lastM) { tbody.append(h("tr", { class: "month" }, h("td", { colspan: "6", text: mo }))); lastM = mo; }
        tbody.append(editingShow === s.id ? editRow(s, redraw) : showRow(s, redraw, t0));
        if (dupOf === s.id) tbody.append(editRow(s, redraw, true));
      }
      if (!rows.length) tbody.append(h("tr", null, h("td", { colspan: "6" }, S.shows.length ? empty("Nothing matches", "") :
        h("div", { class: "empty" }, h("b", { text: "No shows yet" }), "Add a whole weekend at a club in about 30 seconds.", h("div", { style: "margin-top:12px" }, h("button", { class: "btn primary", type: "button", text: "+ Add shows", onclick: () => openRun() }))))));
    };
    search.addEventListener("input", () => { list.q = search.value; draw(); });
    draw();
    card.replaceChildren(h("div", { class: "toolbar" }, chips, h("div", { class: "btns" }, search, past, clear, count)),
      h("div", { class: "tablewrap" }, h("table", { class: "shows-table" }, h("thead", null, h("tr", null, ["When", S.hosts.length > 1 ? "Who" : "", "Club", "Tickets", "Status", ""].map((x) => h("th", { text: x })))), tbody)));
  }

  function showRow(s, redraw, t0) {
    const status = h("select", { class: "status st-" + (s.status || "on_sale"), "aria-label": "Status", onchange: async (e) => {
      try { await q(sb.from("shows").update({ status: e.target.value }).eq("id", s.id)); s.status = e.target.value; e.target.className = "status st-" + s.status; toast("Marked " + STATUS.find((x) => x[0] === s.status)[1].toLowerCase() + "."); }
      catch (err) { toast(errText(err), { bad: true }); e.target.value = s.status; }
    } }, STATUS.map(([v, l]) => h("option", { value: v, text: l, selected: (s.status || "on_sale") === v })));
    const menu = h("details", { class: "menu" }, h("summary", { class: "btn ghost sm", "aria-label": "More actions", text: "⋯" }),
      h("div", { class: "menu-pop" },
        h("button", { type: "button", text: "Duplicate (same night, new time)", onclick: () => { dupOf = s.id; editingShow = null; redraw(); } }),
        h("button", { type: "button", text: "Add more shows at this club", onclick: async () => {
          const v = venueById(s.venue_id); if (v) await loadSlots(v.id);
          const d = parseISO(s.date); openRun({ host: s.host, venue: v || null, month: new Date(d.getFullYear(), d.getMonth(), 1) });
        } }),
        s.event ? null : h("button", { type: "button", text: s.hidden_here ? "Show on this site again" : "Hide on this site only", onclick: async () => {
          try {
            if (s.hidden_here) await q(sb.from("site_hidden").delete().eq("site_id", sid()).eq("kind", "show").eq("item_id", s.id));
            else await q(sb.from("site_hidden").insert({ site_id: sid(), kind: "show", item_id: s.id }));
            await reload.shows(); redraw(); refreshNav(); toast(s.hidden_here ? "It's back on this site." : "Hidden here. It still shows on " + first(s.host) + "'s other sites.");
          } catch (e) { toast(errText(e), { bad: true }); }
        } }),
        s.date >= t0 ? h("button", { type: "button", text: "Pin to Home screen", onclick: () => pinToHome(showPick(s)) }) : null,
        h("button", { type: "button", class: "danger", text: "Delete", onclick: async () => {
          try { await q(sb.from("shows").delete().eq("id", s.id)); await reload.shows(); redraw(); refreshNav();
            toast("Deleted " + shortDate(s.date) + " in " + (s.city || s.venue) + ".", { action: { label: "Undo", run: () => restore([s], redraw) } }); }
          catch (e) { toast(errText(e), { bad: true }); }
        } })));
    menu.addEventListener("toggle", () => { if (menu.open) document.querySelectorAll("details.menu[open]").forEach((m) => { if (m !== menu) m.open = false; }); });
    const from = s.site_id && s.site_id !== sid() ? "Added on " + siteName(s.site_id) : "";
    return h("tr", { class: s.date < t0 || s.hidden_here ? "past" : "" },
      h("td", { class: "nowrap" }, h("b", { text: shortDate(s.date) }), h("div", { class: "hint", text: s.time || "Time TBA" })),
      h("td", { class: "nowrap" }, S.hosts.length > 1 ? (s.event ? h("span", { class: "pill", text: "Whole show" }) : first(s.host)) : "",
        s.hidden_here ? h("div", null, h("span", { class: "pill warn", text: "Hidden here" })) : null, from ? h("div", { class: "hint", text: from }) : null),
      h("td", { class: "wrap-any" }, h("div", { text: s.venue || "—" }), h("div", { class: "hint", text: s.city || "" })),
      h("td", null, s.url ? h("a", { href: s.url, target: "_blank", rel: "noopener", text: "Link ↗" }) : h("button", { class: "pill warn", type: "button", style: "border:0;cursor:pointer", text: "+ Add link", onclick: () => { editingShow = s.id; dupOf = null; redraw(); } })),
      h("td", null, status),
      h("td", { class: "actions" }, h("button", { class: "btn ghost sm", type: "button", text: "Edit", onclick: () => { editingShow = s.id; dupOf = null; redraw(); } }), menu));
  }
  async function restore(rows, redraw) {
    try { await q(sb.from("shows").insert(rows.map(({ id, event, hidden_here, lineup_hosts, hidden, ...r }) => ({ ...r, site_id: event ? r.site_id : sid() })))); await reload.shows(); redraw(); refreshNav(); toast("Restored."); } catch (e) { toast(errText(e), { bad: true }); }
  }
  function editRow(s, redraw, isCopy) {
    let venue = { venue_id: s.venue_id, venue: s.venue, city: s.city };
    const host = S.hosts.length > 1 ? h("select", { "aria-label": "Who" }, S.hosts.map((x) => h("option", { value: x.id, text: first(x.id), selected: !s.event && x.id === s.host })),
      h("option", { value: EVENT, text: "Whole show", selected: !!s.event })) : null;
    const date = h("input", { type: "date", value: s.date, "aria-label": "Date" });
    const later = (() => { const t = to24(s.time) || "19:00"; const [H, M] = t.split(":").map(Number); const m = Math.min(23 * 60 + 30, H * 60 + M + 120); return pad(Math.floor(m / 60)) + ":" + pad(m % 60); })();
    const time = h("input", { type: "time", step: "300", value: isCopy ? later : to24(s.time), "aria-label": "Time" });
    const url = h("input", { type: "url", value: s.url || "", placeholder: "Ticket link", "aria-label": "Ticket link" });
    const status = h("select", { "aria-label": "Status" }, STATUS.map(([v, l]) => h("option", { value: v, text: l, selected: (s.status || "on_sale") === v })));
    const note = h("input", { value: s.note || "", placeholder: "Note (e.g. 18+, special guest)", "aria-label": "Note" });
    const clubCell = h("td", { class: "wrap-any" });
    const drawClub = () => clubCell.replaceChildren(h("div", { text: venue.venue || "—" }), h("div", { class: "hint", text: venue.city || "" }),
      h("button", { class: "btn ghost sm", type: "button", text: "Change club", style: "margin:2px 0 4px -10px", onclick: () => {
        clubCell.replaceChildren(clubPicker((v) => { venue = { venue_id: v.id, venue: v.name, city: venueCity(v) }; drawClub(); }, "editClub"));
        setTimeout(() => $("editClubSearch") && $("editClubSearch").focus());
      } }), note);
    drawClub();
    const cancel = () => { editingShow = null; dupOf = null; redraw(); };
    const save = async () => {
      if (!date.value) { date.classList.add("bad"); date.focus(); return; }
      if (url.value && !/^https?:\/\//i.test(url.value.trim())) { url.classList.add("bad"); url.focus(); return; }
      const hv = host ? host.value : s.host;
      const who = hv === EVENT ? { host: null, comic_id: null, lineup: s.event && s.lineup ? s.lineup : crew(), site_id: sid() } : { host: hv, lineup: null };
      const row = { ...who, date: date.value, time: to12(time.value), url: url.value.trim() || null, note: note.value.trim() || null,
        status: status.value, venue: venue.venue, city: venue.city, venue_id: venue.venue_id || null };
      try {
        if (isCopy) await q(sb.from("shows").insert({ ...row, site_id: sid() }));
        else await q(sb.from("shows").update(row).eq("id", s.id));
        editingShow = null; dupOf = null; await reload.shows(); redraw(); refreshNav();
        toast(isCopy ? "Added the " + (row.time || "new") + " show. It's live." : "Saved. It's live.");
      } catch (e) { toast(errText(e), { bad: true }); }
    };
    const tr = h("tr", { class: "editing" },
      h("td", null, isCopy ? h("div", { class: "pill ok", style: "margin-bottom:6px", text: "New show" }) : null, h("div", { class: "stack", style: "gap:6px" }, date, time)), h("td", null, host), clubCell,
      h("td", null, url, isCopy && s.url ? h("div", { class: "hint", text: "Same link as the original. Paste the new one if it's different." }) : null), h("td", null, status),
      h("td", { class: "actions" }, h("button", { class: "btn primary sm", type: "button", text: isCopy ? "Add show" : "Save", onclick: save }), " ", h("button", { class: "btn ghost sm", type: "button", text: "Cancel", onclick: cancel })));
    tr.addEventListener("keydown", (e) => {
      if (e.target && e.target.classList && e.target.classList.contains("club-search")) return; // the club search uses Enter / Escape itself
      if (e.key === "Enter") { e.preventDefault(); save(); } if (e.key === "Escape") cancel();
    });
    setTimeout(() => { (isCopy ? time : date).focus(); if (isCopy && time.select) try { time.select(); } catch (e) {} });
    return tr;
  }

  /* ======================================================
     IMPORT SOURCES (podcast + YouTube)
     ====================================================== */
  async function importNow(kind, onDone, sourceId) {
    const noun = kind === "podcast" ? "episodes" : kind === "shows" ? "shows" : "videos";
    toast("Checking for new " + noun + "…");
    try {
      const r = await fetch("/.netlify/functions/import-now", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + S.token }, body: JSON.stringify({ site_id: sid(), kind, source_id: sourceId || null }) });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error || ("Import failed (" + r.status + ")"));
      const results = body.results || [];
      await reload.sources(); kind === "podcast" ? await reload.episodes() : kind === "shows" ? await reload.shows() : await reload.videos();
      onDone(); refreshNav();
      if (!results.length) return toast(body.message || "Nothing to import.");
      const bad = results.filter((x) => !x.ok), nNew = results.reduce((a, x) => a + (x.ok ? parseInt(x.status, 10) || 0 : 0), 0);
      if (results.length === 1 && bad.length) return toast(bad[0].status.replace(/^Error:\s*/, ""), { bad: true });
      if (nNew) confetti();
      const what = results.length === 1 ? results[0].status : nNew + " new " + noun + " from " + results.length + " " + (kind === "podcast" ? "feeds" : kind === "shows" ? "pages" : "channels");
      toast((nNew ? "" : "You're up to date. ") + what + (bad.length ? " · " + bad.length + " had a problem (see below)" : ""), bad.length ? { bad: true } : {});
    } catch (e) { toast(/Failed to fetch|NetworkError|Load failed|404/.test(e.message) ? "The import service isn't set up yet. See the setup steps." : errText(e), { bad: true }); }
  }
  function sourceCard(kind, redraw) {
    const isPod = kind === "podcast";
    const mine = S.sources.filter((s) => s.kind === kind && s.site_id === sid());
    const elsewhere = S.sources.filter((s) => s.kind === kind && s.site_id !== sid());
    const card = h("section", { class: "card" });
    const ownerOptions = (sel) => [h("option", { value: "", text: "The show", selected: !sel })].concat(S.hosts.map((x) => h("option", { value: x.id, text: x.name, selected: sel === x.id })));
    const head2 = h("div", { class: "toolbar", style: "margin-bottom:4px" }, h("h2", { style: "margin:0", text: mine.length ? (isPod ? "Podcast feeds" : "YouTube channels") : (isPod ? "Connect your podcast" : "Connect your YouTube channels") }),
      mine.length > 1 ? h("button", { class: "btn sm", type: "button", text: "Check all now", onclick: () => importNow(kind, redraw) }) : null);
    card.append(head2, h("p", { class: "sub", text: isPod
      ? "Paste an Apple Podcasts link or RSS feed. New episodes add themselves every hour, with dates, lengths and Apple links. Got more than one show? Connect each one."
      : "Connect as many channels as you like: the show's, and each person's. New uploads show up on their own every hour, and a person's videos also appear on their page." }));
    if (mine.length) card.append(h("div", null, mine.map((src) => {
      const when = src.last_run_at ? new Date(src.last_run_at) : null;
      const isErr = src.last_status && /^Error/.test(src.last_status);
      const owner = !isPod ? h("select", { "aria-label": "Whose channel", style: "width:auto;min-height:34px;padding:4px 8px;font-size:13px", onchange: async (e) => {
        const host = e.target.value || null;
        const comic_id = hostComic(host);
        try { await q(sb.from("sources").update({ host, comic_id }).eq("id", src.id)); await q(sb.from("videos").update({ host, comic_id }).eq("source_id", src.id)); src.host = host; await reload.videos();
          toast(host ? "Those videos now show on " + first(host) + "'s page too." : "Marked as the show's channel."); } catch (er) { toast(errText(er), { bad: true }); }
      } }, ownerOptions(src.host)) : null;
      return h("div", { class: "switch-row", style: "flex-wrap:wrap;align-items:start" },
        h("div", { style: "min-width:0;flex:1 1 260px" },
          h("div", { class: "btns", style: "gap:6px" }, h("b", { class: "wrap-any", text: src.label || (isPod ? "Podcast feed" : "YouTube channel") }),
            !src.enabled ? h("span", { class: "pill", text: "Paused" }) : !src.last_status ? h("span", { class: "pill", text: "Not checked yet" }) : isErr ? h("span", { class: "pill red", text: "Problem" }) : h("span", { class: "pill ok", text: "Working" })),
          h("div", { class: "hint wrap-any", text: src.url }),
          isErr ? h("div", { class: "err", style: "font-size:13px", text: src.last_status.replace(/^Error:\s*/, "") })
            : when ? h("div", { class: "hint", text: "Last check " + when.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) + (src.last_status ? ": " + src.last_status : "") }) : null),
        h("div", { class: "btns" }, owner ? h("label", { class: "hint", style: "display:flex;gap:6px;align-items:center" }, "Whose:", owner) : null,
          h("button", { class: "btn sm", type: "button", text: "Check now", onclick: () => importNow(kind, redraw, src.id) }),
          h("button", { class: "btn ghost sm", type: "button", text: src.enabled ? "Pause" : "Resume", onclick: async () => { try { await q(sb.from("sources").update({ enabled: !src.enabled }).eq("id", src.id)); await reload.sources(); redraw(); } catch (e) { toast(errText(e), { bad: true }); } } }),
          sure("Disconnect", async () => { try { await q(sb.from("sources").delete().eq("id", src.id)); await reload.sources(); redraw(); toast("Disconnected. The " + (isPod ? "episodes" : "videos") + " already imported stay."); } catch (er) { toast(errText(er), { bad: true }); } })));
    })));
    if (elsewhere.length) card.append(h("div", { style: "margin-top:8px" }, elsewhere.map((src) => {
      const who = S.hosts.find((x) => x.comic_id === src.comic_id);
      return h("div", { class: "switch-row" }, h("div", { style: "min-width:0" }, h("b", { class: "wrap-any", text: src.label || "YouTube channel" }),
        h("div", { class: "hint", text: (who ? who.name + "'s channel, connected on " : "Connected on ") + siteName(src.site_id) + ". Their videos show here automatically." })),
        h("span", { class: "pill ok", text: "Shared" }));
    })));
    const input = h("input", { type: "url", id: kind + "Src", placeholder: isPod ? "https://podcasts.apple.com/us/podcast/…  or an RSS feed" : "https://www.youtube.com/@channel", "aria-label": isPod ? "Podcast link" : "YouTube channel link" });
    const whose = !isPod ? h("select", { id: kind + "Owner", "aria-label": "Whose channel", style: "width:auto" }, ownerOptions(null)) : null;
    const msg = h("div", { class: "err" });
    card.append(h("div", { class: mine.length ? "newclub stack" : "stack", style: "gap:8px;margin-top:" + (mine.length ? "12px" : "4px") },
      mine.length ? h("b", { text: isPod ? "Add another podcast" : "Add another channel" }) : null,
      h("div", { class: "btns" }, h("div", { style: "flex:1 1 260px" }, input), whose, h("button", { class: "btn primary", type: "button", text: "Connect", onclick: async () => {
        const u = input.value.trim(); msg.textContent = "";
        if (!/^https?:\/\//i.test(u) && !/^@/.test(u)) { input.classList.add("bad"); msg.textContent = "Paste the full link, starting with https://"; return; }
        const same = (s) => s.url.replace(/\/+$/, "").toLowerCase() === u.replace(/\/+$/, "").toLowerCase();
        if (mine.some(same)) { msg.textContent = "That one's already connected."; return; }
        const dupe = elsewhere.find(same);
        if (dupe) { msg.textContent = "That channel is already connected on " + siteName(dupe.site_id) + ", so its videos already show here."; return; }
        const host = whose && whose.value ? whose.value : null;
        try {
          const created = await q(sb.from("sources").insert({ site_id: sid(), kind, url: u, host, comic_id: hostComic(host) }).select().single());
          await reload.sources(); redraw(); importNow(kind, redraw, created && created.id);
        } catch (e) { msg.textContent = errText(e); }
      } })), msg));
    return card;
  }

