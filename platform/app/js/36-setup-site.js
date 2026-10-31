  /* ======================================================
     SET UP A SITE FOR A COMIC (Step 3, ComicTable admins)
     Who it's for → the site → how they'll get it → invite them. One path, start to finish.
     ====================================================== */
  // The four ways a comic gets a site (plan, Oct 29). Saved on the site as theme.way.
  const SITE_WAYS = [
    ["template", "From a template", "They start from a ready-made design and make it theirs."],
    ["founder", "Built together", "You build it with them."],
    ["custom", "Custom-built", "A design made just for them, running on ComicTable."],
    ["embed", "Keep their site", "They keep the site they have and add ComicTable to it."]];
  // Site templates (their own gallery, not the Coaster's). More join as they're built.
  const SITE_TEMPLATES = [["spotlight", "Clean Spotlight", "A big photo, a bold name, nothing extra."], ["punk-flyer", "Punk Flyer", "A photocopied gig flyer: ransom-note name, tape and one loud color."], ["late-show", "Late Show", "A 70s talk-show set: wood paneling, a city skyline and cue-card dates."], ["public-access", "Public Access", "80s public-access TV: VHS scanlines, neon pink and cyan, and a channel guide for dates."], ["marquee", "Comedy Club Marquee", "The classic club night: a light-bulb marquee, red velvet and a letterboard of dates."], ["y2k", "Y2K Chrome", "Glossy early 2000s: chrome lettering, bubble buttons, holographic pastels and sparkles."], ["tabloid", "Tabloid", "A newspaper front page about the comic: masthead, breaking banner, a big headline."], ["diner", "Diner", "A late-night diner: a neon name, checkered trim and dates on the specials menu."], ["nineties", "90s", "A 90s sitcom set: squiggles, triangles, bold shadows and loud teal, purple and yellow."], ["web-90s", "90s Internet", "A homemade 90s web page: a starfield, a gray window, a tables-and-borders show list and a guestbook."], ["web-2000s", "2000s Internet", "A mid-2000s profile page: mood, online status, a profile song and your top shows."], ["click-wheel", "Click Wheel", "A pocket music player from the 2000s: a little screen menu, a click wheel, and your shows as the playlist."], ["comic-book", "Comic Book", "A comic book issue: halftone panels, a speech bubble, caption boxes and TIX! bursts."], ["street", "Street", "A city wall: a paste-up poster, stencil lettering, stickers and your shows as the next stops."], ["mixtape", "Mixtape", "A 2000s mixtape cover: big photo, chrome name and gold everywhere, with shows as the tracklist."], ["drop", "Streetwear Drop", "A limited-release product page: clean and bold, shows picked like sizes, and a 'Notify me' sign-up."], ["special", "Stand-Up Special", "A 90s late-night stand-up special: a spotlight on a brick wall, a big italic title card and a crowd."], ["block-party", "Block Party", "A loud summer block party flyer: a huge stacked name, a taped-up photo and bright bold color."], ["starter", "Starter", "Plain and complete: shows, podcast, videos and fans."]];
  const SITE_FEATURES = [["shows", "Live shows"], ["podcast", "Podcast"], ["videos", "YouTube"], ["merch", "Merch"], ["forum", "Forum"], ["chat", "Chat room"]];

  function setupSiteCard(onDone) {
    const st = { step: 1, group: false, comics: [], name: "", id: "", idTouched: false, domain: "", way: "template", template: "spotlight",
      features: { shows: true, podcast: false, videos: true, merch: false, forum: false, chat: false }, made: null };
    const box = h("section", { class: "card setup stack", id: "setupSite" });
    const STEPS = ["Who it's for", "The site", "How they'll get it", "Invite"];
    const chip = (label, on, onclick, attrs) => h("button", Object.assign({ class: "chip", type: "button", "aria-pressed": String(!!on), text: label, onclick }, attrs || {}));
    const nextBtn = (label, ok, fn, id) => h("button", { class: "btn primary", type: "button", id, text: label, disabled: !ok, onclick: fn });
    const backBtn = () => h("button", { class: "btn ghost", type: "button", text: "Back", onclick: () => { st.step--; draw(); } });
    const freeId = (n) => { const base = siteSlug(n); let id = base, k = 2; while (S.sites.some((x) => x.id === id)) id = base + "-" + k++; return id; };
    const autoName = () => st.group ? st.name : (st.comics[0] ? st.comics[0].name : "");

    function stepWho() {
      const input = h("input", { id: "suWho", type: "search", placeholder: "Find their Coaster, or type a new name", autocomplete: "off", "aria-label": "Comic's name" });
      const results = h("div", { class: "su-results" });
      let timer = null;
      const add = (c) => {
        if (st.comics.some((x) => (c.id && x.id === c.id) || (!c.id && !x.id && x.name.toLowerCase() === c.name.toLowerCase()))) return;
        st.comics = st.group ? st.comics.concat(c) : [c];
        if (!st.group && !st.idTouched) { st.name = c.name; st.id = freeId(c.name); }
        draw();
      };
      const look = async () => {
        const v = input.value.trim();
        if (!v) { results.replaceChildren(); return; }
        let found = [];
        try { found = await q(sb.from("comics").select("id, name, photo_url, user_id").ilike("name", "%" + v + "%").order("name", { ascending: true }).limit(6)); } catch (e) {}
        const exact = found.some((c) => c.name.toLowerCase() === v.toLowerCase());
        results.replaceChildren(...found.map((c) => h("button", { class: "su-hit", type: "button", onclick: () => add({ id: c.id, name: c.name, photo: c.photo_url, user_id: c.user_id }) },
          c.photo_url ? h("img", { src: c.photo_url, alt: "" }) : h("span", { class: "su-av", text: initials(c.name) }), h("b", { text: c.name }), h("span", { class: "hint", text: c.user_id ? "Has a login" : "Coaster" }))),
          exact ? null : h("button", { class: "su-hit new", type: "button", id: "suNew", onclick: () => add({ id: null, name: v, photo: "", user_id: null }) }, h("span", { class: "su-av", text: "+" }), h("b", { text: "New Coaster for “" + v + "”" })));
      };
      input.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(look, 180); });
      const picked = st.comics.map((c, i) => h("div", { class: "su-picked" },
        c.photo ? h("img", { src: c.photo, alt: "" }) : h("span", { class: "su-av", text: initials(c.name) }),
        h("div", { style: "flex:1;min-width:0" }, h("b", { text: c.name }), h("div", { class: "hint", text: c.id ? (c.user_id ? "Their Coaster · has a login" : "Their Coaster") : "New Coaster, made when you create the site" })),
        h("button", { class: "btn ghost sm", type: "button", text: "Remove", "aria-label": "Remove " + c.name, onclick: () => { st.comics.splice(i, 1); draw(); } })));
      setTimeout(() => input.focus(), 0);
      return [
        h("div", { class: "chips", role: "group", "aria-label": "One comic or a group" },
          chip("One comic", !st.group, () => { st.group = false; st.comics = st.comics.slice(0, 1); st.features.podcast = false; draw(); }, { "data-kind": "solo" }),
          chip("A group (podcast or show)", st.group, () => { st.group = true; st.features.podcast = true; draw(); }, { "data-kind": "group" })),
        st.comics.length ? h("div", { class: "stack", style: "gap:8px" }, picked) : null,
        st.group || !st.comics.length ? h("div", { class: "stack", style: "gap:6px" }, field(st.group ? "Add each host" : "Who's it for?", input), results) : null,
        h("div", { class: "btns" }, nextBtn("Next", st.comics.length > 0, () => { if (!st.name) st.name = autoName(); if (!st.idTouched) st.id = freeId(st.name); st.step = 2; draw(); }, "suNext1"))];
    }

    function stepSite() {
      const name = h("input", { id: "suName", value: st.name, placeholder: st.group ? "The podcast or show's name" : "Their name", autocomplete: "off" });
      const id = h("input", { id: "suId", value: st.id, autocapitalize: "none", spellcheck: "false" });
      const dom = h("input", { id: "suDomain", value: st.domain, placeholder: "theirname.com (add it later if they don't have one)", autocapitalize: "none", spellcheck: "false" });
      const msg = h("div", { class: "err" });
      name.addEventListener("input", () => { st.name = name.value; if (!st.idTouched) { st.id = freeId(name.value); id.value = st.id; } });
      id.addEventListener("input", () => { st.idTouched = true; st.id = id.value; });
      dom.addEventListener("input", () => { st.domain = dom.value; });
      return [
        h("div", { class: "grid" }, field("Site name", name, "c6"), field("Short id", id, "c6"), field("Web address", dom, "c12")),
        h("div", null, h("b", { text: "What's on it" }),
          h("div", { class: "chips" }, SITE_FEATURES.map(([k, l]) => chip(l, st.features[k], (e) => { st.features[k] = !st.features[k]; e.currentTarget.setAttribute("aria-pressed", String(st.features[k])); }, { "data-feat": k })))),
        msg,
        h("div", { class: "btns" }, backBtn(), nextBtn("Next", true, () => {
          st.name = name.value.trim(); st.id = siteSlug(id.value || st.name);
          if (!st.name) { name.classList.add("bad"); name.focus(); return; }
          if (st.id.length < 2) { msg.textContent = "Give the site a short id, like their-name."; id.focus(); return; }
          if (S.sites.some((x) => x.id === st.id)) { msg.textContent = "There's already a site with the id " + st.id + ". Pick another."; id.focus(); return; }
          st.step = 3; draw();
        }, "suNext2"))];
    }

    function stepHow() {
      const msg = h("div", { class: "err" });
      const create = nextBtn("Create " + st.name, true, async (e) => {
        const b = e.currentTarget; b.disabled = true; b.textContent = "Setting it up…"; msg.textContent = "";
        try { await make(); st.step = 4; draw(); }
        catch (er) { msg.textContent = /create_site/.test(errText(er)) && /function|schema cache/i.test(errText(er)) ? "The database needs 08_create_sites.sql first." : errText(er); b.disabled = false; b.textContent = "Create " + st.name; }
      }, "suCreate");
      return [
        h("div", { class: "su-ways" }, SITE_WAYS.map(([k, l, line]) => h("button", { class: "su-way", type: "button", "data-way": k, "aria-pressed": String(st.way === k), onclick: () => { st.way = k; draw(); } },
          h("b", { text: l }), h("span", { text: line })))),
        st.way === "template" ? h("div", null, h("b", { text: "Template" }),
          h("div", { class: "su-ways", style: "margin-top:8px" }, SITE_TEMPLATES.map(([k, l, line]) => h("button", { class: "su-way", type: "button", "data-site-template": k, "aria-pressed": String(st.template === k), onclick: () => { st.template = k; draw(); } },
            h("b", { text: l }), h("span", { text: line }))))) : null,
        h("p", { class: "hint", style: "margin:0", text: "This can change later. Their Coaster" + (st.comics.length > 1 ? "s" : "") + " and shows plug in whichever way you pick." }),
        msg, h("div", { class: "btns" }, backBtn(), create)];
    }

    // Everything happens here, in order: the site, its settings, any new Coasters, then the lineup.
    async function make() {
      const r = await sb.rpc("create_site", { p_id: st.id, p_name: st.name, p_domain: cleanDomain(st.domain) || null });
      if (r.error) throw r.error;
      const theme = { way: st.way }; if (st.way === "template") theme.template = st.template;
      await q(sb.from("sites").update({ features: st.features, theme }).eq("id", st.id));
      const lineup = [];
      for (const c of st.comics) {
        if (!c.id) { c.id = await newComicId(c.name); await q(sb.from("comics").insert({ id: c.id, name: c.name, title: "Comedian", bio: "" })); }
        let hid = st.id + "-" + (slug(c.name.split(" ")[0]) || "person");
        while (lineup.some((x) => x.id === hid)) hid += "-" + (lineup.length + 1);
        lineup.push({ id: hid, site_id: st.id, comic_id: c.id, name: c.name, sort: lineup.length });
      }
      await q(sb.from("hosts").insert(lineup));
      S.sites = await q(sb.from("sites").select("*").order("name", { ascending: true }));
      st.made = { id: st.id, name: st.name };
    }

    function stepInvite() {
      const site = st.made;
      const cards = st.comics.map((c) => {
        if (!c.user_id) return inviteCard(c, site.id, { role: "owner", siteName: site.name });
        const card = h("section", { class: "card stack" }, h("p", { class: "hint", text: "Adding " + c.name + "…" }));
        teamCall({ site_id: site.id, action: "comic_role", comic_id: c.id, role: "owner" })
          .then(() => card.replaceChildren(h("b", { text: c.name + " already has a login." }), h("p", { class: "hint", style: "margin:0", text: site.name + " is in their dashboard now. They run it as an Owner." })),
            (er) => card.replaceChildren(h("b", { text: c.name + " already has a login." }), h("p", { class: "err", text: "Couldn't add them to the team: " + er.message + " Do it from the site's Settings → Team." })));
        return card;
      });
      return [
        h("p", { style: "margin:0", text: (st.group ? site.name + " is set up with " + st.comics.map((c) => c.name).join(", ") + " on it." : site.name + "'s site is set up.") +
          (st.comics.some((c) => !c.user_id) ? " Text " + (st.comics.filter((c) => !c.user_id).length > 1 ? "each of them their link" : "them the link") + " and they're in." : "") }),
        h("div", { class: "stack" }, cards),
        h("div", { class: "btns" },
          h("button", { class: "btn primary", type: "button", id: "suOpen", text: "Open " + site.name, onclick: () => switchSite(site.id, "people") }),
          h("a", { class: "btn", id: "suSee", href: PRESS_HOST + "/s/" + site.id + "/", target: "_blank", rel: "noopener", text: "See their site ↗" }),
          h("button", { class: "btn ghost", type: "button", text: "Set up another", onclick: () => { onDone && onDone(); } }))];
    }

    function draw() {
      const body = st.step === 1 ? stepWho() : st.step === 2 ? stepSite() : st.step === 3 ? stepHow() : stepInvite();
      box.replaceChildren(
        h("div", { class: "card-head" }, h("h2", { text: "Set up a site for a comic" }), h("span", { class: "hint", text: "Step " + st.step + " of 4" })),
        h("ol", { class: "su-steps" }, STEPS.map((s, i) => h("li", { class: i + 1 === st.step ? "on" : i + 1 < st.step ? "done" : "", text: s }))),
        h("h3", { class: "su-title", text: STEPS[st.step - 1] }),
        ...body);
    }
    draw();
    return { el: box, prefill(n) { if (st.step === 1) { draw(); const i = box.querySelector("#suWho"); if (i) { i.value = n; i.dispatchEvent(new Event("input")); i.focus(); } } } };
  }
