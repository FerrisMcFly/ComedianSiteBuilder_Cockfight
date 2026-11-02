  /* ============ login ============ */
  function showLogin(msg) {
    setPath("login"); document.title = "Log in · ComicTable";
    const user = h("input", { id: "lgUser", autocomplete: "username", autocapitalize: "none", spellcheck: "false", required: true });
    const pass = h("input", { id: "lgPass", type: "password", autocomplete: "current-password", required: true });
    const btn = h("button", { class: "btn primary big", type: "submit", text: "Log in" });
    const form = h("form", { class: "card login stack", onsubmit: async (e) => {
      e.preventDefault(); btn.disabled = true;
      // A plain username is tried as user@comictable.com, then at older login domains (Cockfight's).
      const typed = user.value.trim();
      const tries = typed.includes("@") ? [typed] : LOGIN_DOMAINS.map((d) => typed.toLowerCase() + "@" + d);
      let r = { error: true };
      for (const email of tries) { r = await sb.auth.signInWithPassword({ email, password: pass.value }); if (!r.error) break; }
      btn.disabled = false;
      if (r.error) return showLogin(loginProblem(r.error));
      boot();
    } },
      wordmark("ct-mark login-mark"), h("h1", { text: "Log in to update your site." }),
      field("Username or email", user), field("Password", pass), msg ? h("div", { class: "err", role: "alert", text: msg }) : null, btn,
      h("button", { class: "linkish", type: "button", text: "Forgot password?", onclick: () => showForgot(user.value.trim()) }));
    root.replaceChildren(h("div", { class: "login-wrap brand-screen" }, h("div", { class: "stack", style: "width:100%;max-width:380px;justify-items:center" }, form,
      CFG.PLATFORM ? h("a", { class: "hint", href: "/", text: "Back to comictable.com" }) : null)));
    user.focus();
  }

  // What went wrong logging in, in plain words (Supabase locks sign-ins for a few minutes after many tries)
  function loginProblem(err) {
    const m = String((err && err.message) || ""), st = err && err.status;
    if (st === 429 || /rate limit|too many/i.test(m)) return "Too many tries. Wait about 5 minutes, then log in with your full email.";
    if (/not confirmed/i.test(m)) return "This login's email isn't confirmed yet. Ask whoever set it up to confirm it in Supabase.";
    if (/fetch|network/i.test(m)) return "Couldn't reach ComicTable. Check your connection and try again.";
    return "Wrong username or password.";
  }
  // Forgot password: email a link that comes back here to set a new one
  function showForgot(typed) {
    setPath("login"); document.title = "Reset password · ComicTable";
    const email = h("input", { id: "fpEmail", type: "email", autocomplete: "email", required: true, value: typed && typed.includes("@") ? typed : "" });
    const msg = h("div", { class: "err", role: "status" });
    const btn = h("button", { class: "btn primary big", type: "submit", text: "Email me a reset link" });
    const form = h("form", { class: "card login stack", onsubmit: async (e) => {
      e.preventDefault(); msg.textContent = "";
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.value.trim())) { msg.textContent = "Type the email you log in with."; return; }
      btn.disabled = true;
      const r = await sb.auth.resetPasswordForEmail(email.value.trim(), { redirectTo: location.origin + "/login" });
      btn.disabled = false;
      if (r.error) { msg.textContent = loginProblem(r.error) === "Wrong username or password." ? r.error.message : loginProblem(r.error); return; }
      form.replaceChildren(wordmark("ct-mark login-mark"), h("h1", { text: "Check your email." }),
        h("p", { class: "sub", style: "text-align:center", text: "If " + email.value.trim() + " has a ComicTable login, a reset link is on its way. Open it on this device. It works once, for an hour." }),
        h("button", { class: "linkish", type: "button", text: "Back to log in", onclick: () => showLogin() }));
    } },
      wordmark("ct-mark login-mark"), h("h1", { text: "Reset your password." }), field("Email", email), msg, btn,
      h("button", { class: "linkish", type: "button", text: "Back to log in", onclick: () => showLogin() }));
    root.replaceChildren(h("div", { class: "login-wrap brand-screen" }, h("div", { class: "stack", style: "width:100%;max-width:380px;justify-items:center" }, form)));
    email.focus();
  }
  // Arrived from a reset email: set the new password
  function showNewPassword(msg) {
    setPath("login"); document.title = "New password · ComicTable";
    const p1 = h("input", { id: "npPass", type: "password", autocomplete: "new-password", minlength: "8", required: true });
    const p2 = h("input", { id: "npPass2", type: "password", autocomplete: "new-password", minlength: "8", required: true });
    const err = h("div", { class: "err", role: "alert", text: msg || "" });
    const btn = h("button", { class: "btn primary big", type: "submit", text: "Save new password" });
    const form = h("form", { class: "card login stack", onsubmit: async (e) => {
      e.preventDefault(); err.textContent = "";
      if (p1.value.length < 8) { err.textContent = "Use at least 8 characters."; return; }
      if (p1.value !== p2.value) { err.textContent = "Those don't match."; return; }
      btn.disabled = true;
      const r = await sb.auth.updateUser({ password: p1.value });
      btn.disabled = false;
      if (r.error) { err.textContent = r.error.message; return; }
      history.replaceState && history.replaceState(null, "", location.pathname);
      toast("New password saved. You're logged in."); boot();
    } }, wordmark("ct-mark login-mark"), h("h1", { text: "Choose a new password." }), field("New password", p1), field("Type it again", p2), err, btn);
    root.replaceChildren(h("div", { class: "login-wrap brand-screen" }, h("div", { class: "stack", style: "width:100%;max-width:380px;justify-items:center" }, form)));
    p1.focus();
  }

  // The ComicTable wordmark (production vector from the brand kit; "Comic" follows the text color, "Table" is redwood)
  const WORDMARK = "<svg class=\"wm\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"3.9 35.4 937 184\" role=\"img\" aria-label=\"ComicTable\"><title>ComicTable</title><path fill=\"currentColor\" d=\"M84.7 217Q46.2 217 26.0 196.9Q5.9 176.9 5.9 133.8Q5.9 91.9 27.0 70.8Q48.1 49.8 87.1 49.8Q103.6 49.8 117.4 53.1L117.4 89.1Q102.8 86.1 91.0 86.1Q77.3 86.1 68.5 90.6Q59.8 95.2 55.4 105.6Q51.0 116.0 51.0 133.4Q51.0 151.4 55.2 161.7Q59.5 172.0 68.2 176.3Q76.8 180.7 91.0 180.7Q101.2 180.7 117.4 175.6L117.4 211.7Q111.3 214.1 102.3 215.5Q93.3 217 84.7 217 M154.6 202.2Q130.5 202.2 117.8 188.2Q105.2 174.2 105.2 145.8Q105.2 116.7 117.8 102.4Q130.5 88.2 154.6 88.2Q178.5 88.2 191.2 102.7Q204.0 117.2 204.0 145.4Q204.0 174 191.3 188.1Q178.7 202.2 154.6 202.2M154.6 173.8Q158.3 173.8 160.4 171.7Q162.5 169.6 163.5 163.5Q164.6 157.5 164.6 145.8Q164.6 133.8 163.4 127.4Q162.3 121.1 160.2 118.8Q158.1 116.6 154.6 116.6Q151.1 116.6 149.0 118.8Q146.9 121.1 145.7 127.3Q144.6 133.6 144.6 145.4Q144.6 157.3 145.6 163.4Q146.7 169.6 148.8 171.7Q150.9 173.8 154.6 173.8 M324.8 88.2Q339.7 88.2 348.5 98.0Q357.4 107.9 357.4 129.6L357.4 200L318.8 200L318.8 131.8Q318.8 122.4 311.0 122.4Q309.0 122.4 306.7 123.1Q304.4 123.9 302.6 125.2L302.6 127.2L302.6 200L264.8 200L264.8 131.8Q264.8 126.7 262.9 124.5Q261.0 122.4 257.4 122.4Q255.0 122.4 252.4 123.5Q249.9 124.6 248.4 126.4L248.4 200L209.8 200L209.8 90L241.8 90L244.6 101.2L246.2 101.2Q251.2 94.7 257.7 91.4Q264.3 88.2 273.0 88.2Q280.7 88.2 286.9 91.4Q293.2 94.7 297.1 101.5Q302.1 95.1 309.3 91.6Q316.6 88.2 324.8 88.2 M405.4 200L366.6 200L366.6 90L405.4 90L405.4 200M386.0 79Q374.1 79 368.3 73.6Q362.6 68.2 362.6 58.2Q362.6 48.2 368.3 42.8Q374.1 37.4 386.0 37.4Q397.9 37.4 403.6 42.8Q409.4 48.2 409.4 58.2Q409.4 68.2 403.6 73.6Q397.9 79 386.0 79 M463.8 202.2Q438.1 202.2 424.6 188.1Q411.2 174 411.2 145.2Q411.2 116 426.0 102.1Q440.8 88.2 467.4 88.2Q478.2 88.2 487.8 90L487.8 121.2Q481.1 120.2 475.0 120.2Q462.5 120.2 456.9 125.8Q451.4 131.5 451.4 144.6Q451.4 154.3 453.7 159.9Q456.0 165.5 460.6 167.8Q465.2 170.2 472.6 170.2Q479.1 170.2 487.8 167.4L487.8 198.6Q482.4 200.4 476.1 201.3Q469.8 202.2 463.8 202.2\"/><path fill=\"var(--brand-red, #C4452E)\" d=\"M560.6 200L521.2 200L521.2 86.6L482.0 86.6L482.0 52L599.8 52L599.8 86.6L560.6 86.6 M639.4 88.2Q656.7 88.2 667.1 92.7Q677.6 97.3 682.6 107.6Q687.6 117.9 687.6 135.4L687.6 200L656.4 200L653.6 188.8L652.0 188.8Q645.7 202.2 628.6 202.2Q619.4 202.2 612.2 198.1Q605.1 194.1 601.1 186.6Q597.2 179.2 597.2 169.4Q597.2 152.6 607.5 143.5Q617.8 134.5 640.8 133L650.2 132.4Q650.0 127.3 648.3 124.4Q646.6 121.5 642.6 120.1Q638.7 118.8 631.6 118.8Q625.6 118.8 618.7 119.7Q611.9 120.6 605.8 122.4L605.8 92Q613.2 90.2 622.2 89.2Q631.2 88.2 639.4 88.2M642.8 174Q647.0 174 650.2 171.6L650.2 154.1L645.6 154.4Q640.2 154.7 637.4 157.4Q634.6 160.2 634.6 165Q634.6 169.4 636.8 171.7Q639.1 174 642.8 174 M737.6 202Q727.0 202 716.2 200.3Q705.4 198.7 696.8 195.4L696.8 38.4L735.4 38.4L735.4 101.2L737.2 101.2Q740.4 94.9 745.9 91.5Q751.5 88.2 759.0 88.2Q769.1 88.2 777.3 94.2Q785.6 100.2 790.5 112.6Q795.4 125.1 795.4 143.4Q795.4 172.2 781.4 187.1Q767.5 202 737.6 202M740.2 172.8Q745.7 172.8 749.1 170.5Q752.5 168.2 754.2 162.5Q756.0 156.9 756.0 146.8Q756.0 136.3 754.4 130.6Q752.8 124.9 749.7 122.7Q746.7 120.6 741.8 120.6Q738.1 120.6 735.4 121.8L735.4 172.2Q737.8 172.8 740.2 172.8 M839.8 200L801.2 200L801.2 38.4L839.8 38.4 M938.4 145.6L938.4 156.6L884.7 156.6Q885.2 162.4 887.4 165.6Q889.7 168.8 894.5 170.2Q899.4 171.6 908.0 171.6Q918.7 171.6 933.0 168.2L933.0 198.6Q924.6 200.5 917.6 201.3Q910.6 202.2 903.0 202.2Q882.5 202.2 869.9 196.2Q857.3 190.2 851.4 177.5Q845.6 164.9 845.6 144.4Q845.6 126.7 851.1 114.1Q856.7 101.5 867.5 94.8Q878.4 88.2 894.0 88.2Q916.0 88.2 927.2 103Q938.4 117.8 938.4 145.6M893.8 113Q890.4 113 888.5 114.7Q886.6 116.4 885.6 120.9Q884.7 125.4 884.6 133.8L902.6 133.8Q902.6 125.4 901.7 120.9Q900.8 116.4 898.9 114.7Q897.1 113 893.8 113\"/></svg>\n";
  const wordmark = (cls) => { const el = h("span", { class: cls }); el.innerHTML = WORDMARK; return el; };

  async function boot() {
    // Coming back from a reset email: a dead link explains itself; a good one asks for the new password
    const hp = new URLSearchParams(location.hash.replace(/^#/, ""));
    if (hp.get("error_code")) { history.replaceState && history.replaceState(null, "", location.pathname); return showLogin(/expired/i.test(hp.get("error_code") + hp.get("error_description")) ? "That reset link has expired or was already used. Ask for a new one below." : "That link didn't work. Ask for a new one below."); }
    const recovering = hp.get("type") === "recovery";
    const { data } = await sb.auth.getSession();
    const session = data && data.session;
    if (session && recovering) return showNewPassword();
    if (!session) return showLogin();
    S.token = session.access_token;
    S.email = session.user.email;
    S.user = (session.user.user_metadata && session.user.user_metadata.name) || session.user.email.split("@")[0];
    try {
      const [mine, plat] = await Promise.all([
        q(sb.from("admins").select("*").eq("user_id", session.user.id)),
        q(sb.from("platform_admins").select("*").eq("user_id", session.user.id))]);
      S.isPlatform = plat.length > 0;
      // ComicTable role: admin (everything) or staff (every site, not ComicTable itself). A site's team role per site.
      S.platformRole = S.isPlatform ? (plat[0].role || "admin") : null;
      S.isOwner = S.platformRole === "admin";
      S.roles = Object.fromEntries(mine.map((m) => [m.site_id, m.role || "owner"]));
      // Is this login a comic? Then they get a "Me" page with their profile and dates on every site.
      try { S.me = (await q(sb.from("comics").select("*").eq("user_id", session.user.id)))[0] || null; } catch (e) { S.me = null; }
      S.uid = session.user.id;
      // Coasters this login helps with (a manager, agent or assistant on a comic's own team). Before 25_foundation.sql: none.
      try { S.helping = (await q(sb.from("comic_team").select("role, comic:comics(*)").eq("user_id", session.user.id))).filter((r) => r.comic).map((r) => ({ ...r.comic, teamRole: r.role })); } catch (e) { S.helping = []; }
      // A comic with a Coaster but no site still gets in: they land on Me and edit their Coaster. So does someone on a comic's team.
      if (!mine.length && !S.isPlatform && !S.me && !S.helping.length) { await sb.auth.signOut(); return showLogin("This login isn't an admin of any site yet."); }
      // Super admins get every site; everyone else gets only the sites they're on the team of.
      S.sites = S.isPlatform ? await q(sb.from("sites").select("*").order("name", { ascending: true }))
        : await q(sb.from("sites").select("*").in("id", mine.map((m) => m.site_id)));
      const pick = store.get("csb_site");
      // On a comic's own /admin, open that comic's site; on the ComicTable admin, the last one used.
      S.site = (CFG.SITE_ID && S.sites.find((s) => s.id === CFG.SITE_ID)) || S.sites.find((s) => s.id === pick) || S.sites[0] || null;
      if (S.site) await loadAll();
      else Object.assign(S, { hosts: [], shows: [], episodes: [], videos: [], merch: [], venues: [], sources: [], logins: {}, coasters: {} });
    } catch (e) {
      root.replaceChildren(h("div", { class: "login-wrap" }, h("div", { class: "card login stack" }, h("h1", { text: "Couldn't load your site" }), h("p", { class: "err", text: errText(e) }),
        h("p", { class: "hint", text: "If you just set up the database, make sure 04_platform.sql has been run in Supabase." }),
        h("button", { class: "btn", type: "button", text: "Log out", onclick: async () => { await sb.auth.signOut(); showLogin(); } }))));
      return;
    }
    sb.auth.onAuthStateChange((ev, s) => { if (s) S.token = s.access_token; if (ev === "PASSWORD_RECOVERY") showNewPassword(); });
    await loadTheme();
    // Where you land: super admins and comics start at the ComicTable level; a one-site team member goes straight to their site.
    const h0 = location.hash.slice(1);
    if ((!h0 || h0 === "ct") && hasCT() && history.replaceState) history.replaceState(null, "", location.pathname + ctHome());
    route();
  }

