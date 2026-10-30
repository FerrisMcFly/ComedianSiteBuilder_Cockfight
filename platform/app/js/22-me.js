  /* ======================================================
     ME (a comic's own login)
     ====================================================== */
  // A comic's own Coaster page: requests from sites, then their Coaster (everything, including the fine-tuning).
  async function viewMe(main) {
    const me = S.me;
    if (!me) return viewHelping(main);
    const url = coasterUrl(me);
    main.append(head("My Coaster", "Every change shows on the phone as you make it, and saves by itself. Every site you're on pulls from it."));
    const wrap = h("div", { class: "stack" }); main.append(wrap);
    const here = S.hosts.find((x) => x.comic_id === me.id);
    const asks = h("div");
    wrap.append(asks, coasterPage({ ...me, id: here ? here.id : null, comic_id: me.id }, { me: true }), coasterTeamCard(me));
    requestsCard(me).then((c) => { if (c) asks.replaceWith(c); });
  }
  // Coasters this login helps with (on a comic's own team). Owners and Editors get the Coaster; Shows only gets the dates.
  let HELPING = null;
  async function viewHelping(main) {
    const list = S.helping || [];
    if (!list.length) { main.append(empty("No Coasters yet", "When a comic adds you to their team, their Coaster shows up here.")); return; }
    const c = list.find((x) => x.id === HELPING) || list[0];
    const pick = list.length > 1 ? h("select", { "aria-label": "Which Coaster", style: "width:auto", onchange: (e) => { HELPING = e.target.value; route(); } },
      list.map((x) => h("option", { value: x.id, text: x.name, selected: x.id === c.id }))) : null;
    if (c.teamRole === "shows") {
      main.append(head(c.name + "'s shows", "You're on " + c.name + "'s team for dates. Every date you add shows on their Coaster and every site they're on.", pick));
      return viewMyDates(main, c, true);
    }
    main.append(head(c.name + "'s Coaster", "You're on " + c.name + "'s team. Changes show on their Coaster and every site they're on.", pick));
    const wrap = h("div", { class: "stack" }); main.append(wrap);
    wrap.append(coasterPage({ ...c, id: null, comic_id: c.id }, { comic: true, onSite: false, bookers: false, folder: c.id }));
    const dates = h("div"); wrap.append(dates); viewMyDates(dates, c, true);
    wrap.append(coasterTeamCard(c));
  }
  // A comic's own team: their manager, agent, assistant. Same roles as a site team; several people can share one.
  const COASTER_ROLES = [["owner", "Owner", "Everything, including the team"], ["editor", "Editor", "The Coaster, links, look, dates and fans"], ["shows", "Shows only", "Dates"]];
  function coasterTeamCard(c) {
    const card = h("section", { class: "card" }, h("h2", { text: "Your team" }), h("p", { class: "hint", text: "Loading…" }));
    const call = (body) => teamCall({ comic_id: c.id, ...body });
    const title = c.id === (S.me && S.me.id) ? "Your team" : c.name + "'s team";
    async function draw() {
      let res;
      try { res = await call({ action: "coaster_team" }); }
      catch (e) { card.replaceChildren(h("h2", { text: title }), h("p", { class: "err", text: /Failed to fetch|NetworkError|Load failed/.test(e.message) ? "Couldn't reach ComicTable. Try again in a minute." : e.message })); return; }
      const name = (m) => LOGIN_DOMAINS.reduce((e, d) => e.replace("@" + d, ""), m.email);
      const roleSel = (m) => { const sel = h("select", { "aria-label": "Access for " + name(m), style: "width:auto" }, COASTER_ROLES.map(([k, l]) => h("option", { value: k, text: l, selected: m.role === k })));
        sel.addEventListener("change", async () => { try { await call({ action: "coaster_team_role", user_id: m.user_id, role: sel.value }); toast("Changed."); draw(); } catch (e) { toast(e.message, { bad: true }); } });
        return sel; };
      const user = h("input", { placeholder: "username or email", autocapitalize: "none", "aria-label": "Username or email" });
      const pass = h("input", { type: "text", placeholder: "at least 8 characters", "aria-label": "Starting password" });
      const role = h("select", { "aria-label": "Access", style: "width:auto" }, COASTER_ROLES.map(([k, l, d]) => h("option", { value: k, text: l + ": " + d.toLowerCase(), selected: k === "editor" })));
      const msg = h("div", { class: "err" });
      card.replaceChildren(h("h2", { text: title }), h("p", { class: "sub", text: "People who help with " + (title === "Your team" ? "your" : c.name + "'s") + " Coaster: a manager, an agent, an assistant." }),
        res.team.length ? h("div", null, res.team.map((m) => h("div", { class: "switch-row" },
          h("div", null, h("b", { text: name(m) }), m.you ? h("span", { class: "pill", style: "margin-left:6px", text: "You" }) : null,
            h("div", { class: "hint", text: (COASTER_ROLES.find((r) => r[0] === m.role) || [0, m.role])[1] + (m.last_sign_in ? " · last in " + ago(m.last_sign_in) : " · hasn't logged in yet") })),
          res.can_change && !m.you ? h("div", { class: "btns" }, roleSel(m), sure("Remove", async () => { try { await call({ action: "coaster_team_remove", user_id: m.user_id }); toast("Removed."); draw(); } catch (e) { toast(e.message, { bad: true }); } })) : null)))
          : h("p", { class: "hint", text: "Nobody yet." }),
        res.can_change ? h("div", { class: "newclub stack", style: "gap:10px;margin-top:12px" }, h("b", { text: "Add someone" }),
          h("div", { class: "grid" }, field("Username or email", user, "c6"), field("Starting password", pass, "c6"), h("div", { class: "field c12" }, h("span", { text: "Access" }), role)),
          h("div", { class: "hint", text: "They get a login, not a Coaster. Send them their username and password yourself. If they already have a login, the password is ignored." }), msg,
          h("div", { class: "btns" }, h("button", { class: "btn primary sm", type: "button", text: "Add to team", onclick: async (e) => {
            msg.textContent = "";
            if (!user.value.trim()) { user.classList.add("bad"); user.focus(); return; }
            const b = e.currentTarget; b.disabled = true;
            try { await call({ action: "coaster_team_add", email: loginEmail(user.value), password: pass.value, role: role.value }); toast("Added. They log in with " + loginEmail(user.value) + "."); draw(); }
            catch (er) { msg.textContent = er.message; b.disabled = false; }
          } }))) : null);
    }
    draw(); return card;
  }
  // A comic's dates, on their Coaster and every site they're on.
  // A comic's Shows (style guide board 5): one list for everything, by month, with a filter for each site they're on.
  // Dates belong to the Coaster: added and changed right here, and they show everywhere.
  async function viewMyDates(main, comic, noHead) {
    const me = comic || S.me;
    if (!me) return viewHelping(main);
    const addBox = h("div");
    const add = h("button", { class: "btn primary big", type: "button", id: "addDateBtn", text: "+ Add a show", onclick: () => { addBox.replaceChildren(coasterDateForm(me)); const f = addBox.querySelector("input"); if (f) f.focus(); } });
    if (!noHead) main.append(head("Shows", "Add a show once. It's on your Coaster and every site you're on.", add));
    else main.append(h("div", { class: "btns", style: "margin-bottom:12px" }, add));
    const chips = h("div", { class: "chips", role: "group", "aria-label": "Where it shows" });
    const list = h("div", { class: "stack", style: "gap:16px" }, h("section", { class: "card" }, h("p", { class: "hint", text: "Loading…" })));
    main.append(addBox, chips, list);
    let dates;
    try { dates = await q(sb.rpc("comic_shows", { p_comic: me.id })); }
    catch (e) { list.replaceChildren(h("section", { class: "card" }, h("p", { class: "err", text: /comic_shows|function/i.test(errText(e)) ? "This needs the latest database upgrade." : errText(e) }))); return; }
    dates = dates.filter((d) => d.date >= today()).sort((a, b) => (a.date + to24(a.time)).localeCompare(b.date + to24(b.time)));
    // fans within 50 miles of each club (their own list), when we know where both are
    const near = {};
    try {
      const vids = [...new Set(dates.map((d) => d.venue_id).filter(Boolean))];
      if (vids.length) {
        const [vs, fs] = await Promise.all([q(sb.from("venues").select("id,lat,lng").in("id", vids)), q(sb.from("comic_fans").select("lat,lng").eq("comic_id", me.id).not("lat", "is", null).limit(20000))]);
        const mi = (a, b, c, d) => { const r = Math.PI / 180, x = Math.sin((c - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) * r / 2) ** 2; return 7918 * Math.asin(Math.sqrt(x)); };
        vs.filter((v) => v.lat != null).forEach((v) => { near[v.id] = fs.filter((f) => mi(v.lat, v.lng, f.lat, f.lng) <= 50).length; });
      }
    } catch (e) {}
    // where each date shows: everywhere (their own), or a group's live show on that site
    const sites = [...new Map(dates.filter((d) => d.event && d.site_id).map((d) => [d.site_id, d.site_name])).entries()];
    let pick = "";
    const drawChips = () => chips.replaceChildren(...(sites.length ? [["", "Everywhere"], ["mine", "Just mine"]].concat(sites.map(([id, n]) => [id, n + " live shows"])) : []).map(([v, l]) =>
      h("button", { type: "button", class: "chip", "aria-pressed": String(pick === v), text: l, onclick: () => { pick = v; drawChips(); draw(); } })));
    const row = (d) => {
      const mine = d.comic_id === me.id;
      const r = h("div", { class: "drow show-row" }, dateTile(d.date),
        h("span", { class: "drow-main" }, h("b", { text: d.venue || d.city || "Show" }),
          h("span", { text: [d.city, DOW[parseISO(d.date).getDay()] + (d.time ? " " + d.time : ""), d.event ? d.site_name + " live show" : "everywhere"].filter(Boolean).join(" · ") })),
        d.venue_id && near[d.venue_id] != null ? h("span", { class: "near", text: near[d.venue_id] + " fan" + (near[d.venue_id] === 1 ? "" : "s") + " nearby" }) : null,
        statusPill(d),
        h("span", { class: "btns" }, d.url ? h("a", { class: "btn sm ghost", href: d.url, target: "_blank", rel: "noopener", text: "Tickets ↗" }) : null,
          mine ? h("button", { class: "btn sm", type: "button", text: "Edit", onclick: () => { const open = r.nextElementSibling && r.nextElementSibling.matches("form.newclub"); if (open) r.nextElementSibling.remove(); else r.after(coasterDateForm(me, d)); } })
            : h("button", { class: "btn sm ghost", type: "button", text: "Edit on " + d.site_name, title: "A live show by the whole " + d.site_name + " crew", onclick: () => switchSite(d.site_id, "shows") })));
      return r;
    };
    const draw = () => {
      const shown = dates.filter((d) => !pick || (pick === "mine" ? !d.event : d.event && d.site_id === pick));
      if (!shown.length) { list.replaceChildren(h("section", { class: "card" }, empty(dates.length ? "Nothing here" : "No shows yet", dates.length ? "Try Everywhere." : "Add your next date. It's on your Coaster and every site you're on."))); return; }
      const months = new Map(); shown.forEach((d) => { const k = d.date.slice(0, 7); if (!months.has(k)) months.set(k, []); months.get(k).push(d); });
      list.replaceChildren(...[...months].map(([k, ds]) => h("section", { class: "card" }, h("h2", { style: "margin:0 0 6px", text: MONTH_FULL[+k.slice(5) - 1] + (k.slice(0, 4) !== today().slice(0, 4) ? " " + k.slice(0, 4) : "") }),
        h("div", { class: "drows" }, ds.map(row)))));
    };
    drawChips(); draw();
  }

  // On a site's People page: give a comic their own login (or see that they have one).
  function loginBox(x) {
    const has = S.logins && S.logins[x.comic_id];
    const first1 = x.name.split(" ")[0];
    if (has) return h("div", { class: "hint" }, first1 + " has their own login" + (has === S.uid ? " (that's you)" : "") + ". They can edit their profile and dates from any site they're on.");
    const box = h("div");
    const open = () => {
      const user = h("input", { placeholder: "username or email", autocapitalize: "none", "aria-label": "Username or email" });
      const pass = h("input", { type: "text", placeholder: "only for a new login (8+)", "aria-label": "Starting password" });
      const own = h("input", { type: "checkbox" });
      const msg = h("div", { class: "err" });
      box.replaceChildren(h("div", { class: "newclub stack", style: "gap:8px" }, h("b", { text: "Give " + first1 + " a login" }),
        h("div", { class: "hint", text: "They'll be able to edit their own Coaster and dates on every site they're on, and they join " + S.site.name + "'s team. Already have a login? Type it and leave the password empty." }),
        h("div", { class: "grid" }, field("Username or email", user, "c6"), field("Starting password", pass, "c6")),
        h("label", { class: "check" }, own, "Make them an owner of " + S.site.name + " (for their own site)"), msg,
        h("div", { class: "btns" }, h("button", { class: "btn primary sm", type: "button", text: "Create login", onclick: async (e) => {
          msg.textContent = ""; if (!user.value.trim()) { user.classList.add("bad"); user.focus(); return; }
          const b = e.currentTarget; b.disabled = true;
          try { await teamCall({ action: "link_comic", comic_id: x.comic_id, email: loginEmail(user.value), password: pass.value, role: own.checked ? "owner" : "editor" });
            await loadLogins(); toast(first1 + " can log in now as " + loginEmail(user.value) + "."); route(); }
          catch (er) { msg.textContent = er.message; b.disabled = false; }
        } }), h("button", { class: "btn ghost sm", type: "button", text: "Cancel", onclick: () => box.replaceChildren(btn0) }))));
      user.focus();
    };
    const btn0 = h("div", { class: "btns" }, h("button", { class: "btn ghost sm", type: "button", text: "Give " + first1 + " a login", onclick: open }),
      // the person logged in is this comic (their login just was never linked): one tap and the Coaster is theirs
      S.me || S.isPlatform ? null : h("button", { class: "btn ghost sm", type: "button", text: "This is me", title: "Link your login to " + first1 + "'s Coaster", onclick: async (e) => {
        const b = e.currentTarget; b.disabled = true;
        try { await teamCall({ action: "link_comic", comic_id: x.comic_id, self: true }); toast("Linked. Coaster is in your sidebar now."); setTimeout(() => { location.hash = "#ct/me"; location.reload(); }, 600); }
        catch (er) { toast(er.message, { bad: true }); b.disabled = false; }
      } }));
    box.append(btn0);
    return box;
  }

  // One person's card: their shared profile, plus (on a site's People page) this site's own controls.
  function personCard(x, idx, opts = {}) {
    const shared = !!x.comic_id, lineup = !(opts.me || opts.comic);
    const own = h("input", { type: "checkbox", checked: !!(x.own_bio || x.own_title) });
    // This card is the person's Coaster: the Tape, look and what's on it are saved with everything else.
    const coasterRow = !shared ? null : (opts.me || opts.comic) ? { ...x, id: x.comic_id } : (S.coasters || {})[x.comic_id];
    const cf = coasterRow ? coasterFields(coasterRow, { me: opts.me, admin: opts.comic, onSite: lineup ? true : opts.onSite }) : null;
    // a photo just for this site (21_coasters.sql); otherwise the photo is the Coaster's
    const ownPhoto = shared && lineup && "own_photo" in x ? h("input", { type: "checkbox", checked: !!x.own_photo }) : null;
    const inp = { name: h("input", { value: x.name, required: true }), title: h("input", { value: x.title || "", placeholder: "Comedian" }), status: h("input", { value: x.status || "", placeholder: "Automatic" }), bio: h("textarea", { value: x.bio || "" }) };
    const moreSoc = (x.socials && typeof x.socials === "object") ? x.socials : {};
    const hasMore = "socials" in x;  // the database has 19_more_socials.sql
    for (const [k, l, ph] of SOC) if (COL_SOC.includes(k) || hasMore) inp[k] = h("input", { type: "url", value: (COL_SOC.includes(k) ? x[k] : moreSoc[k]) || "", placeholder: ph, "aria-label": l });
    let pic = x.photo_url ? h("img", { class: "avatar", src: x.photo_url, alt: "" }) : h("div", { class: "avatar", text: "No photo" });
    const file = h("input", { type: "file", accept: "image/*", style: "display:none" });
    file.addEventListener("change", () => { if (file.files[0]) { const im = h("img", { class: "avatar", src: URL.createObjectURL(file.files[0]), alt: "" }); pic.replaceWith(im); pic = im; } });
    const msg = h("div", { class: "err" });
    const save = h("button", { class: "btn primary", type: "submit", text: shared ? "Save Coaster" : "Save changes" });
    const showCount = S.shows.filter((s) => s.host === x.id).length;
    const card = h("form", { class: "card stack" + (x.hidden ? " is-hidden" : ""), "data-drag": lineup ? x.id : null, onsubmit: async (e) => {
      e.preventDefault(); msg.textContent = "";
      const bad = cf ? cf.check() : ""; if (bad) { msg.textContent = bad; return; }
      save.disabled = true;
      const prof = { name: inp.name.value.trim(), status: inp.status.value.trim() || null, ...(cf ? cf.patch() : {}) };
      for (const k of COL_SOC) prof[k] = inp[k].value.trim() || null;
      if (hasMore) { const more = {}; for (const [k] of SOC) if (!COL_SOC.includes(k) && inp[k] && inp[k].value.trim()) more[k] = inp[k].value.trim(); prof.socials = more; }
      const words = { title: inp.title.value.trim() || "Comedian", bio: inp.bio.value.trim() };
      try {
        let pic = null;
        if (file.files[0]) pic = await uploadImage(file.files[0], x.comic_id || x.id);
        const sitePhoto = !!(ownPhoto && ownPhoto.checked);
        if (pic && !sitePhoto) prof.photo_url = pic;
        if (cf && coasterRow) Object.assign(coasterRow, cf.patch());
        if (!shared) await q(sb.from("hosts").update({ ...prof, ...words }).eq("id", x.id));
        else {
          // the Coaster first, then this site's own bits
          await q(sb.from("comics").update(lineup && own.checked ? prof : { ...prof, ...words }).eq("id", x.comic_id));
          const here = {};
          if (lineup && own.checked) Object.assign(here, words, { own_bio: true, own_title: true });
          else if (lineup && (x.own_bio || x.own_title)) Object.assign(here, { own_bio: false, own_title: false });
          if (ownPhoto && sitePhoto) { here.own_photo = true; if (pic) here.photo_url = pic; }
          else if (ownPhoto && x.own_photo) here.own_photo = false;
          if (Object.keys(here).length) await q(sb.from("hosts").update(here).eq("id", x.id));
        }
        await reload.hosts(); if (opts.me) S.me = { ...S.me, ...prof, ...words }; file.value = ""; toast(prof.name + " saved."); route();
      } catch (err) { msg.textContent = errText(err); save.disabled = false; }
    } },
      h("div", { class: "person-top" }, lineup ? grip(x.name) : null, pic, h("div", { style: "min-width:0;flex:1" }, h("b", { text: x.name }), x.hidden ? h("span", { class: "pill", style: "margin-left:6px", text: "Hidden" }) : null,
        lineup ? h("div", { class: "hint", text: showCount ? showCount + " show" + (showCount > 1 ? "s" : "") : "No shows yet" }) : h("div", { class: "hint", text: opts.comic ? "Their Coaster: on every site they're on" : "Your Coaster: on every site you're on" }),
        cf ? cf.link : null,
        h("div", { class: "btns", style: "margin-top:6px;gap:4px" }, h("label", { class: "btn sm" }, "Change photo", file)))),
      shared && lineup ? h("div", { class: "hint", "data-also": x.comic_id, hidden: true }) : null,
      h("div", { class: "grid" }, field("Name", inp.name, "c6"), field("Title", inp.title, "c6"), field("Status", inp.status, "c12"), field("Bio", inp.bio, "c12")),
      // The fine-tuning (Tape, look, what's on it) lives on the Coaster page. On Lineup the card links there; a comic
      // nobody has claimed yet is fine-tuned right here by the site's team.
      cf && !lineup ? cf.tape : null,
      cf && !lineup ? cf.look : null,
      cf && lineup ? (() => {
        const first = x.name.split(" ")[0];
        if (S.me && x.comic_id === S.me.id) return h("div", { class: "fine-tune" }, h("span", { class: "hint", text: "Your look, Tape and what's on your Coaster:" }), h("a", { class: "btn sm", href: "#ct/me", text: "Coaster settings →" }));
        if (S.isPlatform) return h("div", { class: "fine-tune" }, h("span", { class: "hint", text: first + "'s look, Tape and what's on their Coaster:" }),
          h("button", { class: "btn sm", type: "button", text: "Coaster settings →", onclick: () => { comicOpen = x.comic_id; goCT("comics"); } }));
        if (S.logins && S.logins[x.comic_id]) return h("p", { class: "hint", style: "margin:0", text: first + " has their own login and sets their own Coaster look, Tape and what's on it." });
        return h("details", { class: "quiet" }, h("summary", { text: "Coaster settings: look, Tape, what's on it" }), cf.tape, cf.look, cf.more);
      })() : null,
      (() => {
        const filled = SOC.filter(([k]) => inp[k] && inp[k].value).length;
        const d = h("details", { class: "quiet", "data-socials": x.id, open: OPEN_SOCIALS === x.id || null }, h("summary", { text: "Social links" + (filled ? " (" + filled + ")" : "") }),
          h("p", { class: "hint", style: "margin:8px 0 0", text: "Paste the full link for each one you use. They show on " + (shared ? "every site you're on" : "your site") + ", and you choose which go on your home screen under Home screen → Layout." }),
          h("div", { class: "grid", style: "margin-top:8px" }, SOC.filter(([k]) => inp[k]).map(([k, l]) => field(l, inp[k], "c6"))),
          hasMore ? null : h("p", { class: "hint", text: "More platforms (Threads, Bluesky, Twitch, Spotify…) appear once supabase/19_more_socials.sql is run." }));
        if (OPEN_SOCIALS === x.id) { OPEN_SOCIALS = null; setTimeout(() => { try { d.scrollIntoView({ block: "center", behavior: "smooth" }); const f = d.querySelector("input"); f && f.focus({ preventScroll: true }); } catch (e) {} }, 60); }
        return d;
      })(),
      cf && !lineup ? cf.more : null,
      shared && lineup ? (() => {
        const first = x.name.split(" ")[0], custom = [x.own_title && "title", x.own_bio && "bio", x.own_photo && "photo"].filter(Boolean);
        return h("div", { class: "stack site-only", style: "gap:6px" }, h("b", { text: "Only on " + S.site.name }),
          h("div", null, custom.length ? h("span", { class: "pill red", text: "Custom for " + S.site.name + ": " + custom.join(", ") })
            : h("span", { class: "pill ok", text: "Using " + first + "'s Coaster" })),
          h("label", { class: "check" }, own, "Use a different title and bio on " + S.site.name),
          ownPhoto ? h("label", { class: "check" }, ownPhoto, "Use a different photo on " + S.site.name + " (the next photo you pick stays here)") : null);
      })() : null,
      msg,
      lineup && shared ? loginBox(x) : null,
      h("div", { class: "btns" }, save, !lineup ? null :
        h("button", { class: "btn ghost", type: "button", text: x.hidden ? "Show on site" : "Hide from site", title: "Hidden people keep their info and shows, but don't appear on your site", onclick: async () => {
          try { await q(sb.from("hosts").update({ hidden: !x.hidden }).eq("id", x.id)); await reload.hosts(); await reload.shows(); route(); toast(x.hidden ? x.name + " is back on your site." : x.name + " is hidden from your site."); } catch (e) { toast(errText(e), { bad: true }); }
        } }),
        !lineup ? null : h("button", { class: "btn ghost danger", type: "button", text: "Remove…", onclick: (e) => {
          const zone = e.currentTarget.parentNode;
          zone.replaceWith(h("div", { class: "newclub stack", style: "gap:8px" }, h("b", { text: "Take " + x.name + " off " + S.site.name + "?" }),
            h("span", { class: "hint", text: shared ? "Their page here goes away. Their profile and show dates stay theirs, and keep showing on any other site they're on." : (showCount ? "This also deletes their " + showCount + " show" + (showCount > 1 ? "s" : "") + ". To keep everything, use Hide from site instead." : "Their page goes away. This can't be undone.") }),
            h("div", { class: "btns" }, h("button", { class: "btn primary sm", type: "button", text: "Yes, remove", onclick: async () => {
              try { await q(sb.from("hosts").delete().eq("id", x.id)); await reload.hosts(); await reload.shows(); route(); toast(x.name + " is off " + S.site.name + "."); } catch (er) { toast(errText(er), { bad: true }); }
            } }), h("button", { class: "btn ghost sm", type: "button", text: "Cancel", onclick: () => route() }))));
        } })));
    return card;
  }


