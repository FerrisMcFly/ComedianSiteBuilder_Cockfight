  /* ======================================================
     HOME SCREEN PICKS
     ====================================================== */
  const NEWS_STYLES = [["card", "Big card"], ["banner", "Scrolling banner"], ["strip", "Small strip"]];
  let NEWS_READY = true;  // the database has 22_news.sql (styles and start dates)
  const PICK_KINDS = [["show", "Show"], ["video", "Video"], ["announcement", "Announcement"], ["merch", "Merch"], ["podcast", "Podcast"], ["post", "Blog post"], ["link", "Link"]];
  const showPick = (s) => ({ kind: "show", headline: ((s.venue || s.city || "Live") + " · " + shortDate(s.date)).slice(0, 90), body: [s.time, s.city].filter(Boolean).join(" · ").slice(0, 300) || null,
    button_label: "Get tickets", link: s.url || null, show_id: s.id, ends_on: s.date });
  async function pinToHome(pick) {
    try {
      const rows = await q(sb.from("home_picks").select("id,sort").eq("site_id", sid()));
      // a new pin goes to the top: it's what the comic wants seen first right now
      const top = rows.reduce((m, x) => Math.min(m, x.sort), 0) - 1;
      await q(sb.from("home_picks").insert({ site_id: sid(), sort: top, ...pick }));
      toast("Pinned to the top of your Home screen.", { action: { label: "See it", run: () => go("picks") } });
    } catch (e) { toast(errText(e), { bad: true }); }
  }
  // The Home screen page: News (pinned for now), Links (stay put), and the layout of the home screen.
  async function viewPicks(main) {
    const theme = await loadTheme();
    main.append(head("Home screen", "What fans see first. News is what's happening now; Links stay put; Layout is the order of everything."));
    const homeSet = withoutUniversal(theme && Array.isArray(theme.settings) ? theme.settings.filter((st) => isHomeSetting(st) && st.type !== "heading") : []);
    const linksWrap = h("div", { class: "stack" });
    const layout = homeSet.length ? [h("h2", { class: "sec-title", style: "margin-top:28px", text: "Layout" }),
      h("p", { class: "hint", style: "margin:-6px 0 10px", text: "Everything on your home screen, in order. Drag to move, switch off what you don't want." }),
      settingsForm(homeSet, "Save layout"),
      h("div", { class: "btns", style: "margin:10px 0 0" },
        h("button", { class: "btn ghost", type: "button", text: "Edit your socials →", onclick: () => { const me = (S.hosts || []).filter((x) => !x.hidden)[0]; OPEN_SOCIALS = me ? me.id : null; go("people"); } }))] : [];
    main.append(h("h2", { class: "sec-title", text: "News" }),
      h("p", { class: "hint", style: "margin:-6px 0 10px", text: "Pin what's happening: a show, a video, a special, an announcement. Each can be a big card, a scrolling banner or a small strip, and can come and go on dates you set. The first one is the biggest." }));
    const wrap = h("div", { class: "stack" }); main.append(wrap);
    let P = [], editing = null;
    const reloadP = async () => { P = (await q(sb.from("home_picks").select("*").eq("site_id", sid()).order("sort", { ascending: true }))).sort((a, b) => (a.sort - b.sort) || String(a.created_at || "").localeCompare(String(b.created_at || ""))); };
    try { await reloadP(); NEWS_READY = !P.length || "style" in P[0]; if (!P.length) { try { await q(sb.from("home_picks").select("style").limit(1)); NEWS_READY = true; } catch (e) { NEWS_READY = false; } } } catch (e) { wrap.append(h("p", { class: "err", text: /home_picks/.test(errText(e)) ? "Run supabase/15_home_picks.sql in Supabase first." : errText(e) })); return; }
    const t0 = today();
    const ended = (p) => p.ends_on && p.ends_on < t0;
    function form(p) {
      const kind = h("select", { "aria-label": "Type" }, PICK_KINDS.map(([v, l]) => h("option", { value: v, text: l, selected: (p ? p.kind : "announcement") === v })));
      const headline = h("input", { maxlength: "90", placeholder: "New special out now", value: p ? p.headline : "", "aria-label": "Headline" });
      const body = h("textarea", { maxlength: "300", rows: "2", placeholder: "One or two lines (optional)", "aria-label": "Text" }); body.value = p ? p.body || "" : "";
      const label = h("input", { maxlength: "30", placeholder: "Watch now", value: p ? p.button_label || "" : "", "aria-label": "Button text" });
      const link = h("input", { type: "url", maxlength: "500", placeholder: "https://…", value: p ? p.link || "" : "", "aria-label": "Button link" });
      const ends = h("input", { type: "date", value: p ? p.ends_on || "" : "", "aria-label": "Show until" });
      const starts = h("input", { type: "date", value: p ? p.starts_on || "" : "", "aria-label": "Show from" });
      const style = h("select", { "aria-label": "Style" }, NEWS_STYLES.map(([v, l]) => h("option", { value: v, text: l, selected: (p ? p.style || "card" : "card") === v })));
      // Picture: shown on the pick. A YouTube or Vimeo link plays right on the home screen, using the picture as its cover.
      let image = p ? p.image_url || null : null;
      const file = h("input", { type: "file", accept: "image/*", "aria-label": "Picture" });
      const pic = h("div", { class: "pick-pic" });
      const drawPic = () => pic.replaceChildren(image ? h("img", { src: image, alt: "" }) : h("div", { class: "ph", text: "No picture" }),
        h("div", { class: "btns" }, h("label", { class: "btn sm" }, image ? "Change picture" : "Add a picture", file),
          image ? h("button", { class: "btn sm ghost", type: "button", text: "Remove", onclick: () => { image = null; drawPic(); } }) : null,
          !image && ytId(link.value) ? h("button", { class: "btn sm ghost", type: "button", text: "Use the video's thumbnail", onclick: () => { image = "https://i.ytimg.com/vi/" + ytId(link.value) + "/hqdefault.jpg"; drawPic(); } }) : null));
      file.addEventListener("change", async () => {
        if (!file.files[0]) return;
        try { toast("Uploading…"); image = await uploadImage(file.files[0], "home", { square: false }); drawPic(); toast("Picture added. Save to keep it."); } catch (e) { toast(errText(e), { bad: true }); }
      });
      const vidHint = h("p", { class: "hint" });
      const drawVid = () => { vidHint.textContent = /youtu\.?be|vimeo\.com/i.test(link.value) ? "▶ This video will play right on your home screen." : "Tip: paste a YouTube or Vimeo link and the video plays right on your home screen."; drawPic(); };
      link.addEventListener("input", drawVid); drawVid();
      return h("form", { class: "card stack", onsubmit: async (e) => {
        e.preventDefault(); if (!headline.value.trim()) { headline.classList.add("bad"); headline.focus(); return; }
        const row = { kind: kind.value, headline: headline.value.trim(), body: body.value.trim() || null, button_label: label.value.trim() || null, link: link.value.trim() || null, image_url: image, ends_on: ends.value || null };
        if (p ? "style" in p : NEWS_READY) { row.style = style.value; row.starts_on = starts.value || null; }  // 22_news.sql
        try {
          if (p) await q(sb.from("home_picks").update(row).eq("id", p.id));
          else await q(sb.from("home_picks").insert({ site_id: sid(), sort: P.reduce((m, x) => Math.max(m, x.sort), -1) + 1, ...row }));
          editing = null; await reloadP(); draw(); toast(p ? "Saved. It's live." : "Added. It's live.");
        } catch (err) { toast(errText(err), { bad: true }); }
      } }, h("h2", { text: p ? "Edit news" : "Add news" }),
        h("div", { class: "grid" }, field("Type", kind, "c3"), field("Headline", headline, "c9"), field("Text", body, "c12"),
          field("Button text", label, "c4"), field("Button link", link, "c8"),
          NEWS_READY ? field("Style", style, "c4") : null, NEWS_READY ? field("Show from", starts, "c4") : null, field("Show until", ends, NEWS_READY ? "c4" : "c3"),
          field("Picture", pic, "c12")), vidHint,
        p && p.show_id ? h("p", { class: "hint", text: "Made from a show: sold out or cancelled shows on it automatically, and it comes off after the show." }) : null,
        h("div", { class: "btns" }, h("button", { class: "btn primary", type: "submit", text: p ? "Save" : "Add to News" }),
          p ? h("button", { class: "btn ghost", type: "button", text: "Cancel", onclick: () => { editing = null; draw(); } }) : h("span", { class: "hint", text: "Tip: pin a show from Shows (⋯ → Pin to Home screen) and it fills itself in." })));
    }
    function draw() {
      const list = h("section", { class: "card" }, P.length ? sortable(h("div", null, P.map((p, i) => {
        if (editing === p.id) return form(p);
        const kindName = (PICK_KINDS.find((k) => k[0] === p.kind) || [0, "Pick"])[1];
        return h("div", { class: "switch-row", style: "flex-wrap:wrap", "data-drag": p.id }, grip(p.headline),
          h("div", { style: "min-width:0;flex:1 1 300px" },
            h("div", { class: "btns" }, i === 0 && (p.style || "card") === "card" ? h("span", { class: "pill red", text: "Featured" }) : null, h("span", { class: "pill", text: kindName }),
              p.style && p.style !== "card" ? h("span", { class: "pill", text: (NEWS_STYLES.find((x) => x[0] === p.style) || [0, p.style])[1] }) : null,
              p.starts_on && p.starts_on > t0 ? h("span", { class: "pill", text: "From " + shortDate(p.starts_on) }) : null,
              p.hidden ? h("span", { class: "pill warn", text: "Hidden" }) : ended(p) ? h("span", { class: "pill", text: "Ended" }) : h("span", { class: "pill ok", text: "Live" })),
            h("div", { class: "wrap-any", style: "margin-top:4px;font-weight:600", text: p.headline }),
            p.body ? h("div", { class: "hint wrap-any", text: p.body }) : null,
            p.link ? h("div", { class: "hint wrap-any", text: (/youtu\.?be|vimeo\.com/i.test(p.link) ? "▶ Plays on your home screen · " : (p.button_label || "Link") + " → ") + p.link }) : null,
            p.image_url ? h("img", { class: "pick-thumb", src: p.image_url, alt: "" }) : null,
            p.ends_on ? h("div", { class: "hint", text: "Until " + shortDate(p.ends_on) }) : null),
          h("div", { class: "btns" },
            h("button", { class: "btn ghost sm", type: "button", text: "Edit", onclick: () => { editing = p.id; draw(); } }),
            h("button", { class: "btn ghost sm", type: "button", text: p.hidden ? "Show" : "Hide", onclick: async () => { try { await q(sb.from("home_picks").update({ hidden: !p.hidden }).eq("id", p.id)); await reloadP(); draw(); } catch (e) { toast(errText(e), { bad: true }); } } }),
            h("button", { class: "btn ghost sm danger", type: "button", text: "Remove", onclick: async () => {
              try { await q(sb.from("home_picks").delete().eq("id", p.id)); await reloadP(); draw();
                toast("Removed.", { action: { label: "Undo", run: async () => { const { id, ...row } = p; try { await q(sb.from("home_picks").insert(row)); await reloadP(); draw(); } catch (e) { toast(errText(e), { bad: true }); } } } }); }
              catch (e) { toast(errText(e), { bad: true }); }
            } })));
      })), (from, to) => reorder(from, to)) : empty("No news yet", "Add something below, or pin a show from Shows (⋯ → Pin to Home screen)."));
      wrap.replaceChildren(list, editing ? h("div") : form(null));
    }
    async function reorder(a, b) {
      // renumber everything so the order is exact even after pins went to the top
      const next = P.slice(); const [m] = next.splice(a, 1); next.splice(b, 0, m);
      try { for (let i = 0; i < next.length; i++) if (next[i].sort !== i) await q(sb.from("home_picks").update({ sort: i }).eq("id", next[i].id)); await reloadP(); draw(); }
      catch (e) { toast(errText(e), { bad: true }); }
    }
    draw();
    main.append(h("h2", { class: "sec-title", style: "margin-top:28px", text: "Links" }),
      h("p", { class: "hint", style: "margin:-6px 0 10px", text: "Buttons that stay on your home screen: booking, merch, Patreon, anything." }), linksWrap, ...layout);
    linksEditor(linksWrap);
  }

  // Links: permanent buttons on the home screen (booking, merch, Patreon…). Part of the Home screen page.
  async function linksEditor(wrap) {
    let L = [];
    const reloadL = async () => { L = await q(sb.from("links").select("*").eq("site_id", sid()).order("sort", { ascending: true })); };
    try { await reloadL(); } catch (e) { wrap.append(h("p", { class: "err", text: errText(e) })); return; }
    function draw() {
      const label = h("input", { placeholder: "Book us for your event", "aria-label": "Link text" }), url = h("input", { type: "url", placeholder: "https://…", "aria-label": "Link address" });
      const add = h("form", { class: "card stack", onsubmit: async (e) => {
        e.preventDefault();
        if (!label.value.trim()) { label.classList.add("bad"); label.focus(); return; }
        if (!/^https?:\/\//i.test(url.value.trim())) { url.classList.add("bad"); url.focus(); return; }
        try { await q(sb.from("links").insert({ site_id: sid(), label: label.value.trim(), url: url.value.trim(), sort: L.length })); await reloadL(); draw(); toast("Link added."); } catch (err) { toast(errText(err), { bad: true }); }
      } }, h("h3", { text: "Add a link" }), h("div", { class: "grid" }, field("Text", label, "c5"), field("Address", url, "c7")), h("div", { class: "btns" }, h("button", { class: "btn primary", type: "submit", text: "Add link" })));
      const list = h("section", { class: "card" }, L.length ? sortable(h("div", null, L.map((l, i) => h("div", { class: "switch-row", "data-drag": l.id }, grip(l.label),
        h("div", { style: "min-width:0" }, h("b", { text: l.label }), h("div", { class: "hint wrap-any", text: l.url + (l.hidden ? " · Hidden" : "") })),
        h("div", { class: "btns" },
          h("button", { class: "btn ghost sm", type: "button", text: l.hidden ? "Show" : "Hide", onclick: async () => { try { await q(sb.from("links").update({ hidden: !l.hidden }).eq("id", l.id)); await reloadL(); draw(); } catch (e) { toast(errText(e), { bad: true }); } } }),
          sure("Delete", async () => { try { await q(sb.from("links").delete().eq("id", l.id)); await reloadL(); draw(); } catch (e) { toast(errText(e), { bad: true }); } }))))),
          async (from, to) => { await resort("links", L, from, to); await reloadL(); draw(); })
        : empty("No links yet", "Booking, merch, Patreon: anything that stays. Add one below."));
      wrap.replaceChildren(list, add);
    }
    draw();
  }

