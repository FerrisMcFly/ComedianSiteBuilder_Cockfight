  /* ======================================================
     PODCAST
     ====================================================== */
  let epQ = "", editingEp = null;
  function viewPodcast(main) {
    const wrap = h("div", { class: "stack" });
    main.append(head("Podcast", "Connect your feed once and episodes keep themselves up to date. Anything you edit here stays the way you wrote it."), wrap,
      h("details", { class: "quiet opts-fold" }, h("summary", { text: "Listen buttons and which podcasts show" }), h("div", { class: "stack" }, SITE_OPTIONS.some((o) => o.key === "listen_style") ? settingsForm(SITE_OPTIONS.filter((o) => o.key === "listen_style"), "Save") : null, podcastsCard())));
    const redraw = () => { wrap.replaceChildren(sourceCard("podcast", redraw), episodeAdd(redraw), episodeList(redraw)); refreshNav(); };
    redraw();
  }
  function epFields(ep) {
    const st = { patreon: ep.patreon || "" };
    const f = {
      num: h("input", { type: "number", min: "1", value: ep.num ?? "", "aria-label": "Episode number" }),
      title: h("input", { value: ep.title || "", placeholder: "Episode title" }),
      posted: h("input", { type: "date", value: ep.posted || today() }),
      length: h("input", { value: ep.length || "", placeholder: "1h 12m" }),
      url: h("input", { type: "url", value: ep.url || "", placeholder: "https://podcasts.apple.com/…" }),
      blurb: h("textarea", { value: ep.blurb || "", placeholder: "What happens in this one? (optional)" })
    };
    const seg = h("div", { class: "seg", role: "group", "aria-label": "Patreon" });
    const drawSeg = () => seg.replaceChildren(...[["", "No"], ["p2", "Part 2 on Patreon"], ["p1", "Part 1 on Patreon"]].map(([k, l]) => h("button", { type: "button", "aria-pressed": String(st.patreon === k), text: l, onclick: () => { st.patreon = k; drawSeg(); } })));
    drawSeg();
    const layout = h("div", { class: "grid" }, field("Episode #", f.num, "c2"), field("Title", f.title, "c6"), field("Posted", f.posted, "c2"), field("Length", f.length, "c2"),
      field("Listen link", f.url, "c7"), h("div", { class: "field c5" }, h("span", { text: "Patreon" }), seg), field("Description", f.blurb, "c12"));
    const read = () => ({ num: Number(f.num.value), title: f.title.value.trim(), posted: f.posted.value, length: f.length.value.trim() || null, url: f.url.value.trim() || null, patreon: st.patreon || null, blurb: f.blurb.value.trim() || null });
    return { f, layout, read };
  }
  function episodeAdd(redraw) {
    const next = (S.episodes[0] ? S.episodes[0].num : 0) + 1;
    const { f, layout, read } = epFields({ num: next });
    const msg = h("div", { class: "err" });
    const save = h("button", { class: "btn primary", type: "submit", text: "Add episode" });
    const form = h("form", { class: "stack", style: "margin-top:12px", onsubmit: async (e) => {
      e.preventDefault(); msg.textContent = "";
      const row = read();
      if (!row.title) { f.title.classList.add("bad"); f.title.focus(); return; }
      if (S.episodes.some((x) => x.num === row.num)) { msg.textContent = "#" + row.num + " already exists. Edit it in the list below."; f.num.classList.add("bad"); return; }
      save.disabled = true;
      try { await q(sb.from("episodes").insert({ ...row, site_id: sid() })); await reload.episodes(); confetti(); toast("#" + row.num + " " + row.title + " is live!"); redraw(); }
      catch (err) { msg.textContent = errText(err); save.disabled = false; }
    } }, layout, msg, h("div", { class: "btns" }, save));
    const det = h("details", { class: "card" }, h("summary", { style: "cursor:pointer;font-weight:700;font-family:var(--display);font-size:18px", text: "Add an episode by hand" }), form);
    if (!S.sources.some((s) => s.kind === "podcast")) det.open = true;
    return det;
  }
  function episodeList(redraw) {
    const card = h("section", { class: "card" });
    const search = h("input", { type: "search", class: "search", placeholder: "Search episodes", value: epQ, "aria-label": "Search episodes" });
    const tbody = h("tbody");
    const draw = () => {
      const s = epQ.toLowerCase();
      const rows = S.episodes.filter((e) => !s || (e.num + " " + e.title + " " + (e.blurb || "")).toLowerCase().includes(s));
      tbody.replaceChildren(...rows.map((e) => editingEp === e.id ? epEditRow(e, redraw) : h("tr", { class: e.hidden ? "past" : "" },
        h("td", { class: "nowrap", text: "#" + e.num }),
        h("td", { class: "wrap-any" }, h("b", { text: e.title }), e.blurb ? h("div", { class: "hint", text: e.blurb.length > 110 ? e.blurb.slice(0, 110) + "…" : e.blurb }) : null),
        h("td", { class: "nowrap", text: shortDate(e.posted) }),
        h("td", null, e.patreon ? h("span", { class: "pill red", text: e.patreon === "p1" ? "Part 1 Patreon" : "Part 2 Patreon" }) : ""),
        h("td", null, e.url ? h("a", { href: e.url, target: "_blank", rel: "noopener", text: "Link ↗" }) : h("span", { class: "pill warn", text: "No link" })),
        h("td", { class: "actions" },
          h("button", { class: "btn ghost sm", type: "button", text: "Edit", onclick: () => { editingEp = e.id; draw(); } }),
          h("button", { class: "btn ghost sm", type: "button", text: e.hidden ? "Show" : "Hide", onclick: async () => { try { await q(sb.from("episodes").update({ hidden: !e.hidden }).eq("id", e.id)); e.hidden = !e.hidden; draw(); } catch (err) { toast(errText(err), { bad: true }); } } }),
          h("button", { class: "btn ghost sm danger", type: "button", text: "Delete", onclick: async () => {
            try { await q(sb.from("episodes").delete().eq("id", e.id)); await reload.episodes(); redraw();
              toast("Deleted #" + e.num + ".", { action: { label: "Undo", run: async () => { const { id, ...r } = e; try { await q(sb.from("episodes").insert(r)); await reload.episodes(); redraw(); } catch (er) { toast(errText(er), { bad: true }); } } } }); }
            catch (err) { toast(errText(err), { bad: true }); }
          } })))));
      if (!rows.length) tbody.replaceChildren(h("tr", null, h("td", { colspan: "6" }, empty(S.episodes.length ? "No matches" : "No episodes yet", S.episodes.length ? "" : "Connect your feed above and they'll appear here."))));
    };
    search.addEventListener("input", () => { epQ = search.value; draw(); });
    draw();
    card.append(h("h2", { text: S.episodes.length + " episodes" }), h("div", { class: "toolbar" }, search),
      h("div", { class: "tablewrap" }, h("table", null, h("thead", null, h("tr", null, ["#", "Title", "Posted", "", "Link", ""].map((x) => h("th", { text: x })))), tbody)));
    card._draw = draw;
    return card;
  }
  function epEditRow(e, redraw) {
    const { f, layout, read } = epFields(e);
    const done = () => { editingEp = null; redraw(); };
    const save = async () => {
      const row = read();
      if (!row.title) { f.title.classList.add("bad"); return; }
      try { await q(sb.from("episodes").update(row).eq("id", e.id)); await reload.episodes(); toast("Saved #" + row.num + "."); done(); } catch (err) { toast(errText(err), { bad: true }); }
    };
    const box = h("div", { class: "stack" }, layout, h("div", { class: "btns" }, h("button", { class: "btn primary sm", type: "button", text: "Save", onclick: save }), h("button", { class: "btn ghost sm", type: "button", text: "Cancel", onclick: done })));
    box.addEventListener("keydown", (ev) => { if (ev.key === "Escape") done(); });
    setTimeout(() => f.title.focus());
    return h("tr", { class: "editing" }, h("td", { colspan: "6" }, box));
  }

