  /* ======================================================
     ADD A COMIC, AND SET UP GROUP SITES (Step 3, ComicTable admins)
     The Coaster comes first (founder, Oct 31): "+ Add a comic" makes their Coaster, texts them the invite, then
     offers a website as an extra. Group sites (a podcast, a show) are set up from Coasters that already exist.
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

  const freeSiteId = (n) => { const base = siteSlug(n); let id = base, k = 2; while (S.sites.some((x) => x.id === id)) id = base + "-" + k++; return id; };
  const suChip = (label, on, onclick, attrs) => h("button", Object.assign({ class: "chip", type: "button", "aria-pressed": String(!!on), text: label, onclick }, attrs || {}));
  const suBtn = (label, ok, fn, id, cls) => h("button", { class: "btn " + (cls || "primary"), type: "button", id, text: label, disabled: !ok, onclick: fn });
  function suFrame(box, title, steps, step, body) {
    box.replaceChildren(
      h("div", { class: "card-head" }, h("h2", { text: title }), h("span", { class: "hint", text: "Step " + step + " of " + steps.length })),
      h("ol", { class: "su-steps" }, steps.map((x, i) => h("li", { class: i + 1 === step ? "on" : i + 1 < step ? "done" : "", text: x }))),
      h("h3", { class: "su-title", text: steps[step - 1] }), ...body);
  }
  // the site's name, id, address and what's on it (st holds them)
  function siteFields(st, ids) {
    const name = h("input", { id: ids.name, value: st.name, placeholder: ids.namePh || "Site name", autocomplete: "off" });
    const id = h("input", { id: ids.id, value: st.id, autocapitalize: "none", spellcheck: "false" });
    const dom = h("input", { id: ids.domain, value: st.domain, placeholder: "theirname.com (add it later if they don't have one)", autocapitalize: "none", spellcheck: "false" });
    name.addEventListener("input", () => { st.name = name.value; if (!st.idTouched) { st.id = freeSiteId(name.value); id.value = st.id; } });
    id.addEventListener("input", () => { st.idTouched = true; st.id = id.value; });
    dom.addEventListener("input", () => { st.domain = dom.value; });
    const check = (msg) => {
      st.name = name.value.trim(); st.id = siteSlug(id.value || st.name);
      if (!st.name) { name.classList.add("bad"); name.focus(); return false; }
      if (st.id.length < 2) { msg.textContent = "Give the site a short id, like their-name."; id.focus(); return false; }
      if (S.sites.some((x) => x.id === st.id)) { msg.textContent = "There's already a site with the id " + st.id + ". Pick another."; id.focus(); return false; }
      return true;
    };
    return { check, el: [h("div", { class: "grid" }, field("Site name", name, "c6"), field("Short id", id, "c6"), field("Web address", dom, "c12")),
      h("div", null, h("b", { text: "What's on it" }),
        h("div", { class: "chips" }, SITE_FEATURES.map(([k, l]) => suChip(l, st.features[k], (e) => { st.features[k] = !st.features[k]; e.currentTarget.setAttribute("aria-pressed", String(st.features[k])); }, { "data-feat": k }))))] };
  }
  // how they'll get it: the four ways, and the template gallery
  function sitePicker(st, redraw, extra) {
    return [h("div", { class: "su-ways" }, (extra || []).concat(SITE_WAYS).map(([k, l, line]) => h("button", { class: "su-way", type: "button", "data-way": k, "aria-pressed": String(st.way === k), onclick: () => { st.way = k; redraw(); } },
        h("b", { text: l }), h("span", { text: line })))),
      st.way === "template" ? h("div", null, h("b", { text: "Template" }),
        h("div", { class: "su-ways", style: "margin-top:8px" }, SITE_TEMPLATES.map(([k, l, line]) => h("button", { class: "su-way", type: "button", "data-site-template": k, "aria-pressed": String(st.template === k), onclick: () => { st.template = k; redraw(); } },
          h("b", { text: l }), h("span", { text: line }))))) : null];
  }
  // makes the site and puts the comics on its lineup. ownerComic: a solo comic's own site, so their invite makes them its Owner.
  async function makeSite(st, comics, ownerComic) {
    const r = await sb.rpc("create_site", { p_id: st.id, p_name: st.name, p_domain: cleanDomain(st.domain) || null });
    if (r.error) throw r.error;
    const theme = { way: st.way }; if (st.way === "template") theme.template = st.template; if (ownerComic) theme.owner_comic = ownerComic;
    await q(sb.from("sites").update({ features: st.features, theme }).eq("id", st.id));
    const lineup = [];
    for (const c of comics) {
      let hid = st.id + "-" + (slug(c.name.split(" ")[0]) || "person");
      while (lineup.some((x) => x.id === hid)) hid += "-" + (lineup.length + 1);
      lineup.push({ id: hid, site_id: st.id, comic_id: c.id, name: c.name, sort: lineup.length });
    }
    await q(sb.from("hosts").insert(lineup));
    S.sites = await q(sb.from("sites").select("*").order("name", { ascending: true }));
  }
  // a comic who already has a login runs their site from their own dashboard right away
  function ownerNow(c, site) {
    const card = h("section", { class: "card stack" }, h("p", { class: "hint", text: "Adding " + c.name + "…" }));
    teamCall({ site_id: site.id, action: "comic_role", comic_id: c.id, role: "owner" })
      .then(() => card.replaceChildren(h("b", { text: c.name + " already has a login." }), h("p", { class: "hint", style: "margin:0", text: site.name + " is in their dashboard now. They run it as an Owner." })),
        (er) => card.replaceChildren(h("b", { text: c.name + " already has a login." }), h("p", { class: "err", text: "Couldn't add them to the team: " + er.message + " Do it from the site's Settings → Team." })));
    return card;
  }

  /* ---------- + Add a comic: their Coaster → their invite → a website too? ---------- */
  function addComicCard(opts) {
    opts = opts || {};
    const st = { step: 1, comic: null, file: null, name: opts.name || "", siteName: "", id: "", idTouched: false, domain: "", way: "none", template: "spotlight",
      features: { shows: true, podcast: false, videos: true, merch: false, forum: false, chat: false }, made: null };
    const box = h("section", { class: "card setup stack", id: "addComicFlow" });
    const STEPS = ["Their Coaster", "Text them the invite", "A website too?"];
    const openCoaster = () => { comicOpen = st.comic.id; goCT("comics"); };

    function stepCoaster() {
      const name = h("input", { id: "acName", value: st.name, placeholder: "Their full name", maxlength: "60", autocomplete: "off" });
      const at = h("span", { class: "hint" });
      const same = h("div", { class: "su-results" });
      const photo = h("input", { id: "acPhoto", type: "file", accept: "image/*", "aria-label": "Their photo" });
      const msg = h("div", { class: "err" });
      let timer = null;
      const look = async () => {
        const v = name.value.trim(); st.name = v;
        at.textContent = v ? "Their Coaster will be at comictable.com/" + (slug(v) || "…") : "";
        if (!v) { same.replaceChildren(); return; }
        let found = [];
        try { found = await q(sb.from("comics").select("id, name, photo_url, user_id").ilike("name", "%" + v + "%").order("name", { ascending: true }).limit(4)); } catch (e) {}
        same.replaceChildren(...(found.length ? [h("span", { class: "hint", text: "Already on ComicTable?" })] : []), ...found.map((c) => h("button", { class: "su-hit", type: "button", "data-use": c.id, onclick: () => { st.comic = { id: c.id, name: c.name, photo: c.photo_url, user_id: c.user_id }; st.step = 2; draw(); } },
          c.photo_url ? h("img", { src: c.photo_url, alt: "" }) : h("span", { class: "su-av", text: initials(c.name) }), h("b", { text: c.name }), h("span", { class: "hint", text: "Use this Coaster" }))));
      };
      name.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(look, 180); });
      photo.addEventListener("change", () => { st.file = photo.files[0] || null; });
      if (st.name) setTimeout(look, 0);
      setTimeout(() => name.focus(), 0);
      const make = suBtn("Make their Coaster", true, async (e) => {
        const n = name.value.trim(); msg.textContent = "";
        if (!n) { name.classList.add("bad"); name.focus(); return; }
        const b = e.currentTarget; b.disabled = true; b.textContent = "Making it…";
        try {
          const id = await newComicId(n);
          await q(sb.from("comics").insert({ id, name: n, title: "Comedian", bio: "" }));
          st.comic = { id, name: n, photo: "", user_id: null };
          if (st.file) {
            try { const url = await uploadImage(st.file, "coaster", { folder: "comics/" + id }); await q(sb.from("comics").update({ photo_url: url }).eq("id", id)); st.comic.photo = url; }
            catch (er) { toast("Their Coaster is made, but the photo didn't save: " + errText(er), { bad: true }); }
          }
          st.step = 2; draw();
        } catch (er) { msg.textContent = errText(er); b.disabled = false; b.textContent = "Make their Coaster"; }
      }, "acMake");
      return [field("Name", name), at, same,
        h("label", { class: "field" }, h("span", { text: "Photo (optional)" }), photo, h("span", { class: "hint", text: "A square photo of their face works best. They can change it any time." })),
        msg, h("div", { class: "btns" }, make)];
    }

    function stepInvite() {
      const c = st.comic;
      return [
        h("p", { style: "margin:0", text: c.name + "'s Coaster is ready at comictable.com/" + c.id + "." }),
        c.user_id ? h("p", { class: "hint", style: "margin:0", text: c.name.split(" ")[0] + " already has a login, so there's nothing to send." }) : inviteCard(c, null),
        h("div", { class: "btns" }, suBtn("Next: a website?", true, () => { st.step = 3; draw(); }, "acNext2"),
          suBtn("Done for now", true, openCoaster, "acDone", "ghost"))];
    }

    function stepSite() {
      const c = st.comic;
      if (st.made) {
        const site = st.made;
        return [h("p", { style: "margin:0", text: site.name + " is set up, with " + c.name + "'s Coaster on it." + (c.user_id ? "" : " When they use their invite link, they'll run it as its Owner.") }),
          c.user_id ? ownerNow(c, site) : null,
          h("div", { class: "btns" },
            suBtn("Open " + site.name, true, () => switchSite(site.id, "people"), "acOpenSite"),
            h("a", { class: "btn", id: "acSee", href: PRESS_HOST + "/s/" + site.id + "/", target: "_blank", rel: "noopener", text: "See their site ↗" }),
            suBtn("Add another comic", true, () => { opts.onDone && opts.onDone(); }, "acAnother", "ghost"))];
      }
      if (!st.siteName) { st.siteName = c.name; st.name = c.name; st.id = freeSiteId(c.name); }
      const msg = h("div", { class: "err" });
      const fields = st.way !== "none" ? siteFields(st, { name: "acSiteName", id: "acSiteId", domain: "acSiteDomain" }) : null;
      return [h("p", { class: "hint", style: "margin:0", text: "Optional. Their Coaster works on its own; a site pulls from it." }),
        ...sitePicker(st, draw, [["none", "Not now", "Just the Coaster for now. Give them a site any time."]]),
        ...(fields ? fields.el : []), msg,
        h("div", { class: "btns" }, st.way === "none" ? suBtn("Finish", true, openCoaster, "acFinish")
          : suBtn("Create the site", true, async (e) => {
            if (!fields.check(msg)) return;
            const b = e.currentTarget; b.disabled = true; b.textContent = "Setting it up…"; msg.textContent = "";
            try { await makeSite(st, [c], c.id); st.made = { id: st.id, name: st.name }; draw(); }
            catch (er) { msg.textContent = errText(er); b.disabled = false; b.textContent = "Create the site"; }
          }, "acSite"))];
    }

    function draw() { suFrame(box, "Add a comic", STEPS, st.step, st.step === 1 ? stepCoaster() : st.step === 2 ? stepInvite() : stepSite()); }
    draw();
    return box;
  }

  /* ---------- Set up a group site: a podcast or show with several comics' Coasters on it ---------- */
  function setupSiteCard(onDone) {
    const st = { step: 1, comics: [], name: "", id: "", idTouched: false, domain: "", way: "template", template: "spotlight",
      features: { shows: true, podcast: true, videos: true, merch: false, forum: false, chat: false }, made: null };
    const box = h("section", { class: "card setup stack", id: "setupSite" });
    const STEPS = ["The hosts", "The site", "How they'll get it", "Invite"];
    const back = () => h("button", { class: "btn ghost", type: "button", text: "Back", onclick: () => { st.step--; draw(); } });

    function stepWho() {
      const input = h("input", { id: "suWho", type: "search", placeholder: "Find each host's Coaster", autocomplete: "off", "aria-label": "Host's name" });
      const results = h("div", { class: "su-results" });
      let timer = null;
      const add = (c) => { if (!st.comics.some((x) => x.id === c.id)) st.comics = st.comics.concat(c); draw(); };
      const look = async () => {
        const v = input.value.trim();
        if (!v) { results.replaceChildren(); return; }
        let found = [];
        try { found = await q(sb.from("comics").select("id, name, photo_url, user_id").ilike("name", "%" + v + "%").order("name", { ascending: true }).limit(6)); } catch (e) {}
        results.replaceChildren(...found.map((c) => h("button", { class: "su-hit", type: "button", onclick: () => add({ id: c.id, name: c.name, photo: c.photo_url, user_id: c.user_id }) },
          c.photo_url ? h("img", { src: c.photo_url, alt: "" }) : h("span", { class: "su-av", text: initials(c.name) }), h("b", { text: c.name }), h("span", { class: "hint", text: c.user_id ? "Has a login" : "Coaster" }))),
          found.length ? null : h("div", { class: "su-hit new", id: "suNone" }, h("span", { class: "su-av", text: "?" }), h("span", null, "No Coaster called “" + v + "” yet. ",
            h("button", { class: "btn sm", type: "button", text: "Add them as a comic first", onclick: () => { ADD_COMIC_NAME = v; goCT("comics"); } }))));
      };
      input.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(look, 180); });
      setTimeout(() => input.focus(), 0);
      return [
        h("p", { class: "hint", style: "margin:0", text: "For a podcast or show with several comics. Each host needs a Coaster first; a solo comic's site starts from + Add a comic." }),
        st.comics.length ? h("div", { class: "stack", style: "gap:8px" }, st.comics.map((c, i) => h("div", { class: "su-picked" },
          c.photo ? h("img", { src: c.photo, alt: "" }) : h("span", { class: "su-av", text: initials(c.name) }),
          h("div", { style: "flex:1;min-width:0" }, h("b", { text: c.name }), h("div", { class: "hint", text: c.user_id ? "Their Coaster · has a login" : "Their Coaster" })),
          h("button", { class: "btn ghost sm", type: "button", text: "Remove", "aria-label": "Remove " + c.name, onclick: () => { st.comics.splice(i, 1); draw(); } })))) : null,
        h("div", { class: "stack", style: "gap:6px" }, field("Add each host", input), results),
        h("div", { class: "btns" }, suBtn("Next", st.comics.length > 0, () => { if (!st.idTouched) st.id = freeSiteId(st.name); st.step = 2; draw(); }, "suNext1"))];
    }
    function stepSite() {
      const msg = h("div", { class: "err" }), f = siteFields(st, { name: "suName", id: "suId", domain: "suDomain", namePh: "The podcast or show's name" });
      return [...f.el, msg, h("div", { class: "btns" }, back(), suBtn("Next", true, () => { if (f.check(msg)) { st.step = 3; draw(); } }, "suNext2"))];
    }
    function stepHow() {
      const msg = h("div", { class: "err" });
      return [...sitePicker(st, draw), h("p", { class: "hint", style: "margin:0", text: "This can change later. Their Coasters and shows plug in whichever way you pick." }), msg,
        h("div", { class: "btns" }, back(), suBtn("Create " + st.name, true, async (e) => {
          const b = e.currentTarget; b.disabled = true; b.textContent = "Setting it up…"; msg.textContent = "";
          try { await makeSite(st, st.comics, null); st.made = { id: st.id, name: st.name }; st.step = 4; draw(); }
          catch (er) { msg.textContent = /create_site/.test(errText(er)) && /function|schema cache/i.test(errText(er)) ? "The database needs 08_create_sites.sql first." : errText(er); b.disabled = false; b.textContent = "Create " + st.name; }
        }, "suCreate"))];
    }
    function stepInvite() {
      const site = st.made;
      return [
        h("p", { style: "margin:0", text: site.name + " is set up with " + st.comics.map((c) => c.name).join(", ") + " on it." + (st.comics.some((c) => !c.user_id) ? " Text each of them their link and they're in." : "") }),
        h("div", { class: "stack" }, st.comics.map((c) => c.user_id ? ownerNow(c, site) : inviteCard(c, site.id, { role: "owner", siteName: site.name }))),
        h("div", { class: "btns" },
          suBtn("Open " + site.name, true, () => switchSite(site.id, "people"), "suOpen"),
          h("a", { class: "btn", id: "suSee", href: PRESS_HOST + "/s/" + site.id + "/", target: "_blank", rel: "noopener", text: "See their site ↗" }),
          suBtn("Set up another", true, () => { onDone && onDone(); }, null, "ghost"))];
    }
    function draw() { suFrame(box, "Set up a group site", STEPS, st.step, st.step === 1 ? stepWho() : st.step === 2 ? stepSite() : st.step === 3 ? stepHow() : stepInvite()); }
    draw();
    return { el: box };
  }
  // a name waiting for + Add a comic (from a request on comictable.com, or a group site's missing host)
  let ADD_COMIC_NAME = "";
