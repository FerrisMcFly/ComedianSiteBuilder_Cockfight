  /* ======================================================
     THEME (built from the front end's theme.json)
     ====================================================== */
  // "order" setting: a list the comic arranges and switches on or off. Saved as [{ key, on }].
  // Options the design adds later show up at the end, with their default.
  function orderPicker(st, v) {
    const opts = (st.options || []).map((o) => Array.isArray(o) ? { key: o[0], label: o[1], help: o[2] || "", on: o[3] !== false } : { key: o.key, label: o.label || o.key, help: o.help || "", on: o.on !== false });
    const saved = Array.isArray(v) ? v.filter((x) => x && opts.some((o) => o.key === x.key)) : [];
    let items = saved.map((x) => ({ ...opts.find((o) => o.key === x.key), on: !!x.on })).concat(opts.filter((o) => !saved.some((x) => x.key === o.key)));
    const box = h("div", { class: "order-list" });
    const draw = () => box.replaceChildren(...items.map((it, i) => h("div", { class: "order-row" + (it.on ? "" : " off"), "data-drag": it.key }, grip(it.label),
      h("div", { style: "min-width:0;flex:1 1 220px" }, h("b", { text: it.label }), it.help ? h("div", { class: "hint", text: it.help }) : null),
      h("div", { class: "btns" },
        h("label", { class: "switch" }, h("input", { type: "checkbox", role: "switch", checked: it.on, "aria-label": "Show " + it.label, onchange: (e) => { it.on = e.target.checked; draw(); } }), h("span"))))));
    sortable(box, (from, to) => { arrMove(items, from, to); draw(); });
    draw();
    return { el: box, get value() { return items.map((x) => ({ key: x.key, on: x.on })); } };
  }
  // Home screen, item by item: every link, social, podcast and block on its own row, in the comic's order.
  // Built from the dashboard's own data with the same CSB.homeCatalog / homeArrange the site uses, so they agree.
  const GROUP_NAME = { me: "You", links: "Link", socials: "Social", support: "Support", picks: "Picks", shows: "Shows", podcast: "Podcast", special: "Video", list: "Mailing list", blog: "Blog", clips: "Videos" };
  async function homeData() {
    const me = (S.hosts || []).filter((x) => !x.hidden)[0] || {};
    const [links, picks, posts] = await Promise.all([
      q(sb.from("links").select("*").eq("site_id", sid()).order("sort", { ascending: true })).catch(() => []),
      q(sb.from("home_picks").select("id,hidden,ends_on").eq("site_id", sid())).catch(() => []),
      q(sb.from("blog_posts").select("id,published").eq("site_id", sid())).catch(() => [])]);
    let elsewhere = [];
    try {
      const comics = [...new Set((S.hosts || []).map((x) => x.comic_id).filter(Boolean))];
      if (comics.length) {
        const ids = [...new Set((await q(sb.from("hosts").select("site_id").in("comic_id", comics).neq("site_id", sid()))).map((x) => x.site_id))];
        if (ids.length) elsewhere = (await q(sb.from("sites").select("id,name,domain,features").in("id", ids))).filter((x) => x.domain && (x.features || {}).podcast).map((x) => ({ name: x.name, podcast: true }));
      }
    } catch (e) {}
    const off = ((S.site.profile || {}).podcasts_off || []).map((x) => String(x).toLowerCase());
    return { people: [{ photo: me.photo_url, bio: me.bio, socials: CSB.socialsOf ? CSB.socialsOf(me) : { instagram: me.instagram, youtube: me.youtube, tiktok: me.tiktok, twitter: me.twitter, website: me.website } }],
      links: links.filter((l) => !l.hidden), profile: S.site.profile || {}, features: S.site.features || {},
      picks: picks.filter((x) => !x.hidden && (!x.ends_on || x.ends_on >= today())), shows: (S.shows || []).filter((x) => x.date >= today() && !x.hidden_here),
      episodes: (S.episodes || []).map((e) => ({ show: e.show_name })).filter((e) => !off.includes(String(e.show || "").toLowerCase())),
      elsewhere: elsewhere.filter((x) => !off.includes(x.name.toLowerCase())), videos: (S.videos || []).filter((v) => !v.hidden), posts: posts.filter((x) => x.published) };
  }
  function homeItemsEditor() {
    let items = null;
    const box = h("div", { class: "order-list" }, h("p", { class: "hint", text: "Loading your home screen…" }));
    const move = (i, j) => { if (j < 0 || j >= items.length) return; const [m] = items.splice(i, 1); items.splice(j, 0, m); draw(); };
    function draw() {
      box.replaceChildren(...(items.length ? items.map((it, i) => h("div", { class: "order-row" + (it.on ? "" : " off"), "data-drag": it.key }, grip(it.label),
        h("div", { style: "min-width:0;flex:1 1 220px" }, h("div", { class: "btns", style: "gap:6px" }, h("span", { class: "pill", text: GROUP_NAME[it.group] || it.group }), h("b", { class: "wrap-any", text: it.label })), it.sub ? h("div", { class: "hint wrap-any", text: it.sub }) : null),
        h("div", { class: "btns" },
          h("button", { class: "btn ghost sm", type: "button", "aria-label": "Move " + it.label + " to the top", text: "⤒", disabled: i === 0, onclick: () => move(i, 0) }),
          h("label", { class: "switch" }, h("input", { type: "checkbox", role: "switch", checked: it.on, "aria-label": "Show " + it.label, onchange: (e) => { it.on = e.target.checked; draw(); } }), h("span")))))
        : [empty("Nothing to arrange yet", "Add links, socials, shows or a podcast and they'll show up here.")]));
    }
    sortable(box, (from, to) => move(from, to));
    if (!window.CSB || !CSB.homeArrange) { box.replaceChildren(h("p", { class: "err", text: "Couldn't load the layout tools. Refresh the page." })); return { el: box, ready: Promise.resolve(), get value() { return (S.site.theme || {}).home_items; } }; }
    const ready = homeData().then((d) => {
      const cat = CSB.homeCatalog(d), t = S.site.theme || {};
      items = CSB.homeArrange(cat, t.home_items || CSB.homeFromSections(cat, t.home)); draw();
    }, (e) => box.replaceChildren(h("p", { class: "err", text: errText(e) })));
    return { el: box, ready, get value() { return items ? items.map((x) => ({ key: x.key, on: x.on })) : (S.site.theme || {}).home_items; } };
  }
  // Design settings that belong to the home screen live on the Home screen page; everything else on Design.
  // A design marks them with "page": "home", or by key (home, home_*) and a "Home screen" heading.
  // Options every site has (defined once in the toolkit): a design's theme.json can't redefine these, so they're
  // left out of its Custom settings and its home screen settings.
  const SITE_OPTIONS = (window.CSB && CSB.SITE_OPTIONS) || [];
  const UNIVERSAL = new Set(SITE_OPTIONS.filter((o) => o.key).map((o) => o.key));
  // drop a design's settings that are now universal, and any heading left with nothing under it
  const withoutUniversal = (list) => {
    const kept = list.filter((st) => !st.key || !UNIVERSAL.has(st.key));
    return kept.filter((st, i) => st.type !== "heading" || (kept[i + 1] && kept[i + 1].type !== "heading"));
  };
  const isHomeSetting = (st) => st.page === "home" || (st.type === "heading" ? /home screen/i.test(st.label || "") : /^home($|_)/.test(st.key || ""));
  // One form for a set of design settings. Saves only those keys, so the two pages don't overwrite each other.
  function settingsForm(list, saveLabel) {
    const vals = Object.assign({}, S.site.theme || {});
    const inputs = {};
    // "order": a list the comic arranges and switches on or off (menu order, Home screen sections).
    // Saved as [{ key, on }]. Options the design adds later show up at the end, with their default.
    const orderList = (st, v) => { const o = orderPicker(st, v); inputs[st.key] = o; return o.el; };
    const rows = list.map((st) => {
      if (st.type === "heading") return h("div", { class: "set-head" }, h("h2", { text: st.label }), st.help ? h("p", { class: "hint", text: st.help }) : null);
      const v = st.key in vals ? vals[st.key] : st.default;
      if (st.type === "home_items") { const ed = homeItemsEditor(); inputs[st.key] = ed; return h("div", { class: "set-order" }, h("div", null, h("b", { text: st.label }), st.help ? h("div", { class: "hint", text: st.help }) : null), ed.el); }
      if (st.type === "order") return h("div", { class: "set-order" }, h("div", null, h("b", { text: st.label }), st.help ? h("div", { class: "hint", text: st.help }) : null), orderList(st, v));
      let input;
      if (st.type === "toggle") input = h("label", { class: "switch" }, (inputs[st.key] = h("input", { type: "checkbox", role: "switch", checked: !!v, "aria-label": st.label })), h("span"));
      else if (st.type === "select") input = (inputs[st.key] = h("select", { "aria-label": st.label, style: "width:auto" }, (st.options || []).map((o) => { const [ov, ol] = Array.isArray(o) ? o : [o, o]; return h("option", { value: ov, text: ol, selected: String(v) === String(ov) }); })));
      else if (st.type === "lines") { const ta = h("textarea", { "aria-label": st.label, style: "min-height:150px;width:100%", placeholder: st.placeholder || "One per line" }); ta.value = (Array.isArray(v) ? v : []).join("\n");
        inputs[st.key] = { get value() { return ta.value.split(/\n+/).map((x) => x.trim()).filter(Boolean).slice(0, st.max || 50); } };
        return h("div", { class: "set-order" }, h("div", null, h("b", { text: st.label }), st.help ? h("div", { class: "hint", text: st.help }) : null), ta); }
      else if (st.type === "socials_hide") {
        // every network: tap to hide it on this site (the Coaster and other sites keep it)
        const hide = new Set(Array.isArray(v) ? v : []);
        const box = h("div", { class: "soc-picks" });
        const draw = () => box.replaceChildren(...((window.CSB && CSB.SOCIALS) || []).filter(([k]) => k !== "website").map(([k, l]) => {
          const ic = h("span", { "aria-hidden": "true" }); ic.innerHTML = CSB.socialIcon ? CSB.socialIcon(k, { brand: true, size: 18 }) : "";
          return h("button", { type: "button", class: "soc-pick", "aria-pressed": String(!hide.has(k)), title: (hide.has(k) ? "Hidden here: " : "Showing: ") + l, onclick: () => { hide.has(k) ? hide.delete(k) : hide.add(k); draw(); } }, ic, h("span", { text: l }));
        }));
        draw();
        inputs[st.key] = { get value() { return [...hide]; } };
        return h("div", { class: "set-order" }, h("div", null, h("b", { text: st.label }), st.help ? h("div", { class: "hint", text: st.help }) : null), box);
      }
      else if (st.type === "color") input = (inputs[st.key] = h("input", { type: "color", value: /^#[0-9a-f]{6}$/i.test(v || "") ? v : "#000000", "aria-label": st.label, style: "width:64px;height:40px;padding:2px" }));
      else input = (inputs[st.key] = h("input", { value: v ?? "", placeholder: st.placeholder || "", "aria-label": st.label, style: "max-width:260px" }));
      return h("div", { class: "switch-row" }, h("div", null, h("b", { text: st.label }), st.help ? h("div", { class: "hint", text: st.help }) : null), input);
    });
    const save = h("button", { class: "btn primary", type: "submit", text: saveLabel });
    return h("form", { class: "card stack", onsubmit: async (e) => {
      e.preventDefault(); save.disabled = true;
      const out = {};
      for (const st of list) { if (st.type === "heading") continue; const el = inputs[st.key]; out[st.key] = st.type === "toggle" ? el.checked : el.value; }
      try { await saveSite({ theme: Object.assign({}, S.site.theme || {}, out) }, "Saved. Refresh your site to see it."); } catch (err) { toast(errText(err), { bad: true }); }
      save.disabled = false;
    } }, h("div", { class: "switches" }, rows), h("div", { class: "btns" }, save));
  }
  // Which parts of the site are on (Shows, Podcast, Forum…). Off hides it from the site and the menu; nothing is deleted.
  function sectionsCard() {
    return h("section", { class: "card" }, h("h2", { text: "Sections" }), h("p", { class: "sub", text: "Turning one off hides it from your site and from the menu. Nothing is deleted." }), h("div", { class: "switches" }, FEATURES.map(([k, l, d]) => {
      const box = h("input", { type: "checkbox", role: "switch", checked: F(k), "aria-label": l, onchange: async (e) => {
        const features = { ...(S.site.features || {}), [k]: e.target.checked };
        try { await q(sb.from("sites").update({ features }).eq("id", sid())); S.site.features = features; route(); toast(l + (e.target.checked ? " is on." : " is off.")); }
        catch (err) { e.target.checked = !e.target.checked; toast(errText(err), { bad: true }); }
      } });
      return h("div", { class: "switch-row" }, h("div", null, h("b", { text: l }), h("div", { class: "hint", text: d })), h("label", { class: "switch" }, box, h("span")));
    })));
  }
  // Website → Look: the design, and the extras that come with it (Lev's loading jokes, Cockfight's music…).
  async function viewTheme(main) {
    const theme = await loadTheme();
    const name = theme && theme.name ? theme.name : "Your design";
    const list = withoutUniversal(theme && Array.isArray(theme.settings) ? theme.settings.filter((st) => !isHomeSetting(st)) : []);
    main.append(h("section", { class: "card stack" }, h("div", null, h("b", { text: name }), theme && theme.description ? h("p", { class: "hint", style: "margin:4px 0 0", text: theme.description }) : null),
      list.some((st) => st.type !== "heading") ? null : h("p", { class: "hint", style: "margin:0", text: "This design has no extra settings." })));
    if (list.some((st) => st.type !== "heading")) main.append(settingsForm(list, "Save"));
  }
  // A few of the options every site has, on the page they're about (Shows, Podcast, Fan list), folded away.
  function optionsFold(keys, label) {
    const list = SITE_OPTIONS.filter((o) => keys.includes(o.key));
    if (!list.length) return null;
    return h("details", { class: "quiet opts-fold" }, h("summary", { text: label }), settingsForm(list, "Save"));
  }

