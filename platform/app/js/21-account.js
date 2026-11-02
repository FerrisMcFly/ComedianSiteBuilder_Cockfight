  /* ======================================================
     YOUR ACCOUNT (the person logged in, not a site)
     ====================================================== */
  async function viewAccount(main) {
    main.append(head("Your account", "Your login: the name you go by in here, your email and your password. This is you, not any one site."));
    const wrap = h("div", { class: "stack" }); main.append(wrap);

    // appearance: saved on this device
    const curTheme = (() => { try { return localStorage.getItem("ct_theme") || "system"; } catch (e) { return "system"; } })();
    const themeSeg = h("div", { class: "seg", role: "group", "aria-label": "Appearance" }, [["system", "Match my computer"], ["light", "Light"], ["dark", "Dark"]].map(([v, l]) =>
      h("button", { type: "button", "data-theme-choice": v, "aria-pressed": String(curTheme === v), text: l, onclick: () => {
        try { if (v === "system") localStorage.removeItem("ct_theme"); else localStorage.setItem("ct_theme", v); } catch (e) {}
        if (v === "system") document.documentElement.removeAttribute("data-theme"); else document.documentElement.setAttribute("data-theme", v);
        themeSeg.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.themeChoice === v)));
      } })));
    wrap.append(h("section", { class: "card stack" }, h("h2", { text: "Appearance" }), h("p", { class: "sub", text: "How the dashboard looks on this device." }), themeSeg));

    // name
    const name = h("input", { id: "acctName", value: S.user, maxlength: "40", autocomplete: "nickname" });
    const nameMsg = h("div", { class: "err" });
    wrap.append(h("form", { class: "card stack", onsubmit: async (e) => {
      e.preventDefault(); nameMsg.textContent = "";
      const v = name.value.trim(); if (!v) { name.classList.add("bad"); name.focus(); return; }
      const r = await sb.auth.updateUser({ data: { name: v } });
      if (r.error) { nameMsg.textContent = errText(r.error); return; }
      S.user = v; toast("Saved. Hi, " + v + "."); route();
    } }, h("h2", { text: "Your name" }), h("p", { class: "sub", text: "What the dashboard calls you. Only your team sees it." }),
      field("Name", name), nameMsg, h("div", { class: "btns" }, h("button", { class: "btn primary", type: "submit", text: "Save name" }))));

    // password
    const p1 = h("input", { id: "acctPass", type: "password", autocomplete: "new-password", minlength: "8" });
    const p2 = h("input", { id: "acctPass2", type: "password", autocomplete: "new-password" });
    const passMsg = h("div", { class: "err" });
    wrap.append(h("form", { class: "card stack", onsubmit: async (e) => {
      e.preventDefault(); passMsg.textContent = "";
      if (p1.value.length < 8) { passMsg.textContent = "Use at least 8 characters."; p1.focus(); return; }
      if (p1.value !== p2.value) { passMsg.textContent = "The two passwords don't match."; p2.focus(); return; }
      const r = await sb.auth.updateUser({ password: p1.value });
      if (r.error) { passMsg.textContent = /same|different/i.test(r.error.message) ? "That's already your password. Pick a new one." : errText(r.error); return; }
      p1.value = ""; p2.value = ""; toast("Password changed. Use it next time you log in.");
    } }, h("h2", { text: "Change password" }),
      h("div", { class: "grid" }, field("New password", p1, "c6"), field("Type it again", p2, "c6")), passMsg,
      h("div", { class: "btns" }, h("button", { class: "btn primary", type: "submit", text: "Change password" }))));

    // email
    const em = h("input", { id: "acctEmail", type: "email", value: S.email, autocomplete: "email" });
    const emMsg = h("div", { class: "err" });
    wrap.append(h("form", { class: "card stack", onsubmit: async (e) => {
      e.preventDefault(); emMsg.textContent = "";
      const v = em.value.trim().toLowerCase();
      if (v === S.email) { emMsg.textContent = "That's already your email."; return; }
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) { emMsg.textContent = "That doesn't look like an email."; return; }
      const r = await sb.auth.updateUser({ email: v });
      if (r.error) { emMsg.textContent = errText(r.error); return; }
      toast("Check " + v + " for a confirmation link. Your email changes once you click it.");
    } }, h("h2", { text: "Login email" }), h("p", { class: "sub", text: "You log in with this. Changing it sends a confirmation link to the new address, and nothing changes until you click it." }),
      field("Email", em), emMsg, h("div", { class: "btns" }, h("button", { class: "btn primary", type: "submit", text: "Change email" }))));

    // where you have access
    const access = h("section", { class: "card" }, h("h2", { text: "Where you have access" }), h("p", { class: "hint", text: "Loading…" }));
    wrap.append(access);
    try {
      const mine = await q(sb.from("admins").select("site_id, role").eq("user_id", S.uid));
      access.replaceChildren(...[h("h2", { text: "Where you have access" }),
        S.isPlatform ? h("p", { class: "sub" }, h("b", { text: S.isOwner ? "ComicTable admin. " : "ComicTable staff. " }), S.isOwner ? "You can see and manage every site on ComicTable (" + S.sites.length + "), and ComicTable itself." : "You can work on every site on ComicTable (" + S.sites.length + "). Adding staff, new sites and the front page are for admins.") : null,
        S.me ? h("p", { class: "sub" }, "Your login is linked to ", h("b", { text: S.me.name }), ". You can edit your profile and dates on every site you're on. See ", h("a", { href: "#me", text: "Me" }), ".") : null,
        mine.length ? h("div", null, mine.map((m) => h("div", { class: "switch-row" }, h("b", { text: (S.sites.find((x) => x.id === m.site_id) || {}).name || m.site_id }), h("span", { class: "pill", text: roleName(m.role || "owner") }))))
          : S.isPlatform ? null : empty("Not on any team", "Ask a site's owner to add you.")].filter(Boolean));
    } catch (e) { access.replaceChildren(h("h2", { text: "Where you have access" }), h("p", { class: "err", text: errText(e) })); }

    wrap.append(h("section", { class: "card" }, h("h2", { text: "Log out" }), h("p", { class: "sub", text: "Logs you out on this device." }),
      h("button", { class: "btn", type: "button", text: "Log out", onclick: async () => { await sb.auth.signOut(); S.site = null; showLogin(); } })));
  }

