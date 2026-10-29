  /* ======================================================
     SETTINGS
     ====================================================== */
  const FEATURES = [["shows", "Shows & tour dates", "Your upcoming shows with ticket links."], ["podcast", "Podcast", "Episode archive that updates itself from your feed."], ["videos", "Videos", "Your latest YouTube uploads."],
    ["merch", "Merch", "Items you sell, linked to your store."], ["blog", "Blog", "Write posts for your fans. Drafts stay private until you publish."], ["fans", "Fan list", "Fans sign up with their email and city, so you can tell them when you're playing nearby."], ["forum", "Forum", "Message boards for your fans."], ["chat", "Chat room", "A live chat room that's always open for fans."]];
  async function viewSettings(main) {
    main.append(head("Settings", "Your site's name and address, which sections are on, who can log in, and the code for using it on your own website."));
    const name = h("input", { value: S.site.name });
    const domainIn = h("input", { value: S.site.domain || "", disabled: !S.isPlatform, placeholder: "yourname.com", autocapitalize: "none" });
    const siteCard = h("form", { class: "card stack", onsubmit: async (e) => {
      e.preventDefault();
      const patch = { name: name.value.trim() || S.site.name };
      if (S.isPlatform) patch.domain = cleanDomain(domainIn.value) || null;
      try { await q(sb.from("sites").update(patch).eq("id", sid())); Object.assign(S.site, patch); route(); toast("Saved."); } catch (err) { toast(errText(err), { bad: true }); }
    } }, h("h2", { text: "Your site" }), h("div", { class: "grid" }, field("Site name", name, "c8"), field("Address", domainIn, "c4")), h("div", { class: "btns" }, h("button", { class: "btn primary", type: "submit", text: "Save" })));
    // For comics who keep their own website: the snippet that puts this site's live content on it
    const snippet = '<div data-comictable="shows"></div>\n<div data-comictable="fans"></div>\n<script src="https://comictable.com/embed.js" data-site="' + sid() + '"><\/script>';
    const embedCard = h("section", { class: "card stack" }, h("h2", { text: "Use on your own website" }),
      h("p", { class: "sub", text: "Already have a site on Squarespace, Wix, WordPress or anything else? Paste this where you want your shows to appear. It stays up to date from this dashboard." }),
      h("pre", { class: "snippet", text: snippet }),
      h("div", { class: "hint", text: "Other pieces: data-comictable=\"episodes\", \"videos\" or \"posts\". Add data-limit=\"5\" to show fewer. Add data-accent=\"#ff3b6b\" to the script for your button color." }),
      h("div", { class: "btns" }, h("button", { class: "btn sm", type: "button", text: "Copy snippet", onclick: async () => toast((await copyText(snippet)) ? "Copied. Paste it into your site's HTML or embed block." : "Couldn't copy. Select it and copy instead.") })));
    // One page, four tabs, so nothing is buried at the bottom.
    const panes = [["general", "General", h("div", { class: "stack" }, siteCard, sectionsCard())], ["team", "Team", teamCard()], ["embed", "Your own website", embedCard]];
    if (!panes.some((x) => x[0] === SETTAB)) SETTAB = "general";
    const tabs = h("div", { class: "tabs", role: "tablist", "aria-label": "Settings" });
    const show = () => { panes.forEach(([k, , el]) => { el.hidden = k !== SETTAB; }); tabs.querySelectorAll("button").forEach((b) => { const on = b.dataset.tab === SETTAB; b.setAttribute("aria-selected", String(on)); b.tabIndex = on ? 0 : -1; }); };
    panes.forEach(([k, l]) => tabs.append(h("button", { type: "button", role: "tab", "data-tab": k, text: l, onclick: () => { SETTAB = k; show(); } })));
    tabs.addEventListener("keydown", (e) => { if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return; const i = panes.findIndex((x) => x[0] === SETTAB), j = (i + (e.key === "ArrowRight" ? 1 : -1) + panes.length) % panes.length; SETTAB = panes[j][0]; show(); tabs.children[j].focus(); });
    main.append(tabs, h("div", { class: "stack" }, ...panes.map((x) => x[2])));
    show();
  }
  // Every podcast this site's comics are on: feeds connected here, and ComicTable podcasts they co-host.
  // Each one can be left off this site (profile.podcasts_off, by name); the data kit filters it for every design.
  function podcastsCard() {
    const card = h("section", { class: "card stack" }, h("h2", { style: "margin:0", text: "Podcasts on your site" }), h("p", { class: "hint", text: "Looking for your podcasts…" }));
    (async () => {
      const names = new Map();
      (S.episodes || []).forEach((e) => { const n = (e.show_name || "").trim(); if (n && !names.has(n.toLowerCase())) names.set(n.toLowerCase(), { name: n, where: "Connected to this site" }); });
      try {
        const comics = [...new Set((S.hosts || []).map((x) => x.comic_id).filter(Boolean))];
        if (comics.length) {
          const hs = await q(sb.from("hosts").select("site_id").in("comic_id", comics).neq("site_id", sid()));
          const ids = [...new Set(hs.map((x) => x.site_id))];
          if (ids.length) (await q(sb.from("sites").select("id,name,domain,features").in("id", ids))).filter((x) => x.domain && (x.features || {}).podcast)
            .forEach((x) => { const k = x.name.toLowerCase(); names.set(k, { name: x.name, where: names.has(k) ? "Connected here, and on ComicTable at " + x.domain : "On ComicTable at " + x.domain + ". Shows up by itself" }); });
        }
      } catch (e) {}
      const off = new Set(((S.site.profile || {}).podcasts_off || []).map((x) => String(x).toLowerCase()));
      if (!names.size) { card.replaceChildren(h("h2", { style: "margin:0", text: "Podcasts on your site" }), empty("No podcasts yet", "Connect one in Podcast, or join a podcast's site on ComicTable, and it'll show up here.")); return; }
      card.replaceChildren(h("h2", { style: "margin:0", text: "Podcasts on your site" }),
        h("p", { class: "sub", style: "margin:0", text: "Every podcast you're on. Switch one off to leave it off this site. It stays on its own site, and nothing is deleted." }),
        h("div", { class: "switches" }, [...names.entries()].map(([k, x]) => h("div", { class: "switch-row" },
          h("div", null, h("b", { text: x.name }), h("div", { class: "hint", text: x.where })),
          h("label", { class: "switch" }, h("input", { type: "checkbox", role: "switch", checked: !off.has(k), "aria-label": "Show " + x.name + " on this site", onchange: async (e) => {
            e.target.checked ? off.delete(k) : off.add(k);
            const profile = { ...(S.site.profile || {}), podcasts_off: [...off] };
            try { await saveSite({ profile }, x.name + (e.target.checked ? " is on your site." : " is off your site.")); }
            catch (err) { e.target.checked = !e.target.checked; e.target.checked ? off.delete(k) : off.add(k); toast(errText(err), { bad: true }); }
          } }), h("span"))))));
    })();
    return card;
  }
  let SETTAB = "general";
  const loginEmail = (u) => { u = String(u || "").trim(); return u.includes("@") ? u.toLowerCase() : u.toLowerCase() + "@" + loginDom(); };
  async function teamCall(body) {
    const r = await fetch("/.netlify/functions/team", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + S.token }, body: JSON.stringify({ site_id: sid(), ...body }) });
    const out = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(out.error || (r.status === 404 ? "Team management isn't set up yet. See the setup steps." : "Something went wrong (" + r.status + ")."));
    return out;
  }
  function teamCard() {
    const card = h("section", { class: "card" }, h("h2", { text: "Team" }), h("p", { class: "hint", text: "Loading…" }));
    async function draw() {
      let res;
      try { res = await teamCall({ action: "list" }); }
      catch (e) { card.replaceChildren(h("h2", { text: "Team" }), h("p", { class: "sub", text: "Who can log in to this admin." }), h("p", { class: "err", text: /Failed to fetch|NetworkError|Load failed/.test(e.message) ? "Team management isn't set up yet. See the setup steps." : e.message })); return; }
      const owner = res.you_are === "owner";
      const user = h("input", { id: "teamUser", placeholder: "username or email", autocapitalize: "none", "aria-label": "Username or email" });
      const pass = h("input", { id: "teamPass", type: "text", placeholder: "at least 8 characters", "aria-label": "Starting password" });
      const role = h("select", { "aria-label": "Role", style: "width:auto" }, ["editor", "owner", "shows", "moderator"].map((k) => { const r = SITE_ROLES.find((x) => x[0] === k); return h("option", { value: k, text: r[1] + ": " + r[2].toLowerCase() }); }));
      const roleSel = (m) => { const sel = h("select", { "aria-label": "Access for " + m.email, style: "width:auto" }, SITE_ROLES.map(([k, l]) => h("option", { value: k, text: l, selected: m.role === k })));
        sel.addEventListener("change", async () => { try { await teamCall({ action: "set_role", user_id: m.user_id, role: sel.value }); toast("Changed to " + roleName(sel.value) + "."); draw(); } catch (e) { toast(e.message, { bad: true }); sel.value = m.role; } });
        return sel; };
      const msg = h("div", { class: "err" });
      card.replaceChildren(h("h2", { text: "Team" }), h("p", { class: "sub", text: "Who can log in to this admin." }),
        h("div", null, res.team.map((m) => h("div", { class: "switch-row" },
          h("div", null, h("b", { text: LOGIN_DOMAINS.reduce((e, d) => e.replace("@" + d, ""), m.email) }), m.you ? h("span", { class: "pill", style: "margin-left:6px", text: "You" }) : null,
            h("div", { class: "hint", text: roleName(m.role) + (m.last_sign_in ? " · last in " + ago(m.last_sign_in) : " · hasn't logged in yet") })),
          owner && !m.you ? h("div", { class: "btns" }, roleSel(m), sure("Remove", async () => { try { await teamCall({ action: "remove", user_id: m.user_id }); toast("Removed from the team."); draw(); } catch (e) { toast(e.message, { bad: true }); } })) : null))),
        owner ? h("div", { class: "newclub stack", style: "gap:10px;margin-top:12px" }, h("b", { text: "Add someone" }),
          h("div", { class: "grid" }, field("Username or email", user, "c6"), field("Starting password", pass, "c6"), h("div", { class: "field c12" }, h("span", { text: "Access" }), role)),
          h("div", { class: "hint", text: "Send them their username and password yourself. If they already have a login, the password is ignored." }), msg,
          h("div", { class: "btns" }, h("button", { class: "btn primary sm", type: "button", text: "Add to team", onclick: async (e) => {
            msg.textContent = "";
            if (!user.value.trim()) { user.classList.add("bad"); user.focus(); return; }
            const b = e.currentTarget; b.disabled = true;
            try { await teamCall({ action: "add", email: loginEmail(user.value), password: pass.value, role: role.value }); const em = loginEmail(user.value); toast("Added. They log in with " + em + "."); draw(); }
            catch (er) { msg.textContent = er.message; b.disabled = false; }
          } }))) : h("p", { class: "hint", text: "Only owners can add, change or remove people." }));
    }
    draw(); return card;
  }
