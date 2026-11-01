  /* ======================================================
     THE SITE EDITOR (Step 4): Website → Design
     Left: one part open at a time (Template, Look, Words, Sections, What shows). Right: the real site, live, on a
     phone or a desktop, updating as you edit before anything saves. Saves itself a moment later, with Undo.
     A site on a template can switch templates from the gallery. A custom-built site edits its own settings.
     ====================================================== */
  const THEME_CACHE = {};
  async function themeFor(id) {
    if (!id) return null;
    if (THEME_CACHE[id] !== undefined) return THEME_CACHE[id];
    try { const r = await fetch("themes/" + id + ".json", { cache: "no-store" }); THEME_CACHE[id] = r.ok ? await r.json() : null; } catch (e) { THEME_CACHE[id] = null; }
    return THEME_CACHE[id];
  }
  // the options every site has, minus the socials ones (those follow the Coaster and have their own home)
  const SHOWN_OPTIONS = SITE_OPTIONS.filter((o) => !/^socials/.test(o.key || "")).filter((o, i, all) => o.type !== "heading" || (all[i + 1] && all[i + 1].type !== "heading"));
  const designOf = (t) => (t.design || (t.way === "template" ? t.template || "starter" : "") || sid());

  async function viewSiteEditor(main) {
    let draft = Object.assign({}, S.site.theme || {});
    const onTemplate = draft.way === "template";
    let design = designOf(draft), theme = await themeFor(design) || (onTemplate ? null : await loadTheme());
    let saved = JSON.stringify(draft), undo = null, timer = null, device = "phone";
    const status = h("div", { class: "cp-status", role: "status", "aria-live": "polite" });
    const parts = h("div", { class: "stack cp-parts", id: "siteEditor" });
    const base = PRESS_HOST + "/s/" + sid() + "/";
    const canLive = CFG.PLATFORM && base.startsWith(location.origin);
    const frame = h("iframe", { class: "cp-frame", id: "sitePreview", title: "Live preview of " + S.site.name, loading: "lazy" });
    const frameSrc = () => base + "?preview=1" + (onTemplate ? "&template=" + encodeURIComponent(draft.template || "starter") : "") + "&v=" + Date.now();
    const send = () => { if (canLive && frame.contentWindow) frame.contentWindow.postMessage({ type: "ct-site-preview", theme: draft }, location.origin); };
    window.addEventListener("message", (e) => { if (e.origin === location.origin && e.data && e.data.type === "ct-site-preview-ready" && e.source === frame.contentWindow) send(); });

    const showStatus = (txt, ok) => status.replaceChildren(h("span", { class: ok ? "ok" : "", text: txt }),
      ok && undo ? h("button", { class: "btn sm ghost", type: "button", id: "siteUndo", text: "Undo", onclick: () => { const back = undo; undo = null; draft = back; store(true).then(() => { draw(); reloadFrame(); }); } }) : null);
    async function store(isUndo) {
      const now = JSON.stringify(draft);
      if (now === saved) return true;
      showStatus("Saving…");
      try {
        const prev = JSON.parse(saved);
        await saveSite({ theme: draft });
        if (!isUndo) undo = prev;
        saved = now; showStatus("Saved", true);
        if (!canLive || !onTemplate) reloadFrame();
        return true;
      } catch (err) { showStatus(""); toast(errText(err), { bad: true }); return false; }
    }
    const changed = (read) => { if (read) Object.assign(draft, read()); send(); clearTimeout(timer); timer = setTimeout(() => store(), 1000); };
    const reloadFrame = () => { frame.src = frameSrc(); };

    const part = (n, id, title, sub, open, ...body) => {
      const d = h("details", { class: "card cp-part", open: open || null, "data-part": id },
        h("summary", null, h("span", { class: "cp-n", text: n }), h("span", { class: "cp-t" }, h("b", { text: title }), h("small", { text: sub }))), h("div", { class: "cp-body stack" }, ...body));
      d.addEventListener("toggle", () => { if (d.open) parts.querySelectorAll("details.cp-part").forEach((o) => { if (o !== d) o.open = false; }); });
      return d;
    };
    const rowsFor = (list) => { if (!list.length) return null; let set = null; set = settingRows(list, draft, () => changed(set.read)); return set.el; };

    function gallery() {
      return h("div", { class: "tpl-gallery" }, SITE_TEMPLATES.map(([k, l, line]) => h("button", { class: "tpl-card", type: "button", "data-site-template": k, "aria-pressed": String((draft.template || "starter") === k), onclick: async () => {
        if ((draft.template || "starter") === k) return;
        draft.template = k; design = k; theme = await themeFor(k);
        changed(); reloadFrame(); draw("template"); if (typeof nameIt === "function") nameIt();
      } }, h("img", { src: PRESS_HOST + "/templates/" + k + ".jpg", alt: "", loading: "lazy" }), h("b", { text: l }), h("small", { text: line }))));
    }

    function draw(open) {
      const all = withoutUniversal(theme && Array.isArray(theme.settings) ? theme.settings.filter((st) => !isHomeSetting(st)) : []);
      const words = all.filter((st) => st.type === "text");
      const sections = all.filter((st) => st.type === "order" || st.type === "home_items");
      const look = all.filter((st) => !words.includes(st) && !sections.includes(st) && st.type !== "heading");
      let n = 0;
      const which = open || (onTemplate ? "template" : "look");
      parts.replaceChildren(...[
        onTemplate ? part(String(++n), "template", "Template", "The whole look, in one tap. Your words, shows and photos come along.", which === "template", gallery()) : null,
        look.length ? part(String(++n), "look", "Look", "Colors, your photo, and this design's options", which === "look", rowsFor(look)) : null,
        words.length ? part(String(++n), "words", "Words", "Every line on the page. Retype one, or clear it to take it off.", which === "words",
          h("p", { class: "hint", style: "margin:0", text: "{name} fills in your name. {next_venue}, {next_city}, {next_date} and {next_day} fill in your next show; a line that uses them hides while there's no show coming up." }), rowsFor(words)) : null,
        sections.length ? part(String(++n), "sections", "Sections", "Drag to reorder. Switch one off to hide it.", which === "sections", rowsFor(sections)) : null,
        part(String(++n), "shows", "What shows", "How many shows, listen buttons, videos and the sign-up", which === "shows", rowsFor(SHOWN_OPTIONS))].filter(Boolean));
    }

    const devices = h("div", { class: "seg", role: "group", "aria-label": "Preview size" }, [["phone", "Phone"], ["desktop", "Desktop"]].map(([k, l]) =>
      h("button", { type: "button", "data-device": k, "aria-pressed": String(device === k), text: l, onclick: (e) => { device = k; stage.className = "site-stage " + k; devices.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.device === k))); } })));
    const stage = h("div", { class: "site-stage phone" }, h("div", { class: "site-screen" }, frame));
    const side = h("aside", { class: "cp-side site-side" }, devices, stage,
      h("div", { class: "cp-actions" }, status, h("a", { class: "btn sm", href: S.site.domain ? "https://" + S.site.domain : base, target: "_blank", rel: "noopener", text: "Open ↗" })));
    if (!theme && !onTemplate) parts.append(h("p", { class: "hint", text: "This design has no settings of its own yet." }));
    draw();
    const named = h("div", { class: "site-ed-name" });
    const nameIt = () => named.replaceChildren(h("b", { text: theme && theme.name ? theme.name : "Your design" }), theme && theme.description ? h("span", { class: "hint", text: " · " + theme.description.replace(/ A ComicTable template\.$/, "") }) : null);
    nameIt();
    main.append(h("div", { class: "cp site-ed" }, h("div", { class: "cp-main stack" }, named, parts), side));
    reloadFrame();
  }
