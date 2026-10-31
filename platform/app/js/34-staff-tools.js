  /* ======================================================
     STAFF TOOLS: view as a comic, and the health check (Step 2)
     ====================================================== */
  // See exactly what a comic sees: their sidebar, Dashboard, Coaster and sites. A bar on top says so, with the way back.
  async function startViewAs(c) {
    let mine = [];
    try { if (c.user_id) mine = await q(sb.from("admins").select("site_id,role").eq("user_id", c.user_id)); } catch (e) {}
    const sites = S.sites.filter((x) => mine.some((m) => m.site_id === x.id));
    S.viewSaved = { me: S.me, isPlatform: S.isPlatform, isOwner: S.isOwner, platformRole: S.platformRole, sites: S.sites, site: S.site, roles: S.roles, helping: S.helping };
    Object.assign(S, { viewAs: c, me: c, isPlatform: false, isOwner: false, platformRole: null, sites, roles: Object.fromEntries(mine.map((m) => [m.site_id, m.role || "owner"])), helping: [] });
    S.site = sites[0] || null;
    if (S.site) await loadAll();
    goCT("home");
  }
  async function stopViewAs() {
    const back = S.viewSaved; if (!back) return;
    const who = S.viewAs;
    Object.assign(S, back, { viewAs: null, viewSaved: null });
    if (S.site) await loadAll();
    comicOpen = who ? who.id : null;
    goCT("comics");
  }
  const viewAsBar = () => S.viewAs ? h("div", { class: "viewas-bar", role: "status" }, h("span", null, "Viewing as ", h("b", { text: S.viewAs.name }), ". This is what they see. Changes you make are real."),
    h("button", { class: "btn sm", type: "button", text: "Back to ComicTable", onclick: stopViewAs })) : null;

  // Everything broken across all sites and Coasters, in one place, with a fix where there is one.
  async function viewHealth(main) {
    main.append(head("Health check", "Imports, missing ticket links, duplicate shows and Coasters that need a hand, across every site and Coaster."));
    const box = h("div", { class: "stack" }, h("section", { class: "card" }, h("p", { class: "hint", text: "Checking…" })));
    main.append(box);
    let sources = [], shows = [], comics = [], sites = [];
    try {
      [sources, shows, comics, sites] = await Promise.all([
        q(sb.from("sources").select("id,kind,url,label,site_id,comic_id,enabled,last_run_at,last_status")),
        q(sb.from("shows").select("id,comic_id,site_id,venue,venue_id,city,date,time,url,status").gte("date", today()).order("date", { ascending: true }).limit(5000)),
        q(sb.from("comics").select("id,name,handle,photo_url,bio,user_id")),
        q(sb.from("sites").select("id,name,domain"))]);
    } catch (e) { box.replaceChildren(h("section", { class: "card" }, h("p", { class: "err", text: errText(e) }))); return; }
    const siteName = (id) => (sites.find((x) => x.id === id) || { name: id }).name, comicName = (id) => (comics.find((x) => x.id === id) || { name: id }).name;
    const owner = (r) => [r.comic_id ? comicName(r.comic_id) : null, r.site_id ? siteName(r.site_id) : null].filter(Boolean).join(" · ");
    const section = (title, n, good, rows) => h("section", { class: "card" }, h("div", { class: "card-head" }, h("h2", { text: title }), h("span", { class: "spill " + (n ? "soon" : "live") }, h("i"), n ? n + " to look at" : good)), n ? h("div", { class: "drows" }, rows) : null);
    // imports: errors, and ones that haven't run in a while (the hourly job)
    const stale = (r) => r.enabled !== false && (!r.last_run_at || Date.now() - Date.parse(r.last_run_at) > 3 * 3600 * 1000);
    const broken = sources.filter((r) => /^Error/.test(r.last_status || "") || stale(r));
    // the same show added twice (same comic, club and night): keep the one with tickets, remove the other
    const groups = new Map();
    shows.filter((s) => s.comic_id).forEach((s) => { const k = [s.comic_id, s.venue_id || String(s.venue || "").toLowerCase().trim(), s.date, to24(s.time)].join("|"); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(s); });
    const dupes = [...groups.values()].filter((g) => g.length > 1);
    const noLink = shows.filter((s) => !s.url && s.status !== "cancelled" && s.status !== "free");
    const byComic = new Map(); noLink.forEach((s) => { const k = s.comic_id || "site:" + s.site_id; byComic.set(k, (byComic.get(k) || 0) + 1); });
    const thin = comics.filter((c) => c.user_id && (!c.photo_url || !String(c.bio || "").trim()));
    box.replaceChildren(
      section("Imports", broken.length, "All running", broken.map((r) => h("div", { class: "drow" }, h("i", { class: "tdot " + (/^Error/.test(r.last_status || "") ? "hot" : "soon") }),
        h("span", { class: "drow-main" }, h("b", { text: (r.label || r.url) + " (" + r.kind + ")" }), h("span", { text: [owner(r), /^Error/.test(r.last_status || "") ? r.last_status : r.last_run_at ? "Last ran " + ago(r.last_run_at) : "Hasn't run yet"].filter(Boolean).join(" · ") }))))),
      section("Duplicate shows", dupes.length, "None", dupes.map((g) => { const keep = g.slice().sort((a, b) => (!!b.url - !!a.url))[0], drop = g.filter((s) => s !== keep);
        return h("div", { class: "drow" }, dateTile(keep.date), h("span", { class: "drow-main" }, h("b", { text: (keep.venue || "Show") + " · " + comicName(keep.comic_id) }), h("span", { text: g.length + " copies, added on " + g.map((s) => s.site_id ? siteName(s.site_id) : "their Coaster").join(", ") })),
          h("button", { class: "btn sm", type: "button", text: "Merge into one", onclick: async (e) => { e.currentTarget.disabled = true; try { await q(sb.from("shows").delete().in("id", drop.map((s) => s.id))); toast("Merged. One show left, the one with tickets."); route(); } catch (er) { toast(errText(er), { bad: true }); e.currentTarget.disabled = false; } } })); })),
      section("Shows with no ticket link", noLink.length, "Every show has one", [...byComic].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([k, n]) => h("div", { class: "drow" }, h("i", { class: "tdot soon" }),
        h("span", { class: "drow-main" }, h("b", { text: k.startsWith("site:") ? siteName(k.slice(5)) + " live shows" : comicName(k) }), h("span", { text: n + " upcoming without a ticket link" }))))),
      section("Coasters that need a hand", thin.length, "Everyone's set up", thin.slice(0, 40).map((c) => h("div", { class: "drow" }, h("i", { class: "tdot" }),
        h("span", { class: "drow-main" }, h("b", { text: c.name }), h("span", { text: [!c.photo_url ? "no photo" : "", !String(c.bio || "").trim() ? "no bio" : ""].filter(Boolean).join(", ") })),
        h("button", { class: "btn sm ghost", type: "button", text: "View as " + c.name.split(" ")[0], onclick: () => startViewAs(c) })))));
  }

  // An invite link to text a comic (Step 3): one tap, they pick a username and password, and their Coaster is theirs.
  // With a site, they also join its team (Editor unless you pick another role).
  function inviteCard(c, siteId) {
    const box = h("section", { class: "card invite-card stack" }, h("p", { class: "hint", text: "Making a link…" }));
    (async () => {
      let inv;
      try { inv = (await q(sb.from("invites").insert({ comic_id: c.id, site_id: siteId || null, site_role: siteId ? "editor" : null, created_by: S.uid }).select("token")))[0]; }
      catch (e) { box.replaceChildren(h("p", { class: "err", text: /invites/.test(errText(e)) ? "Invite links need the latest database upgrade (UPGRADE_V3_ALL.sql)." : /row-level|policy/i.test(errText(e)) ? c.name.split(" ")[0] + " already has a login, or you can't invite them." : errText(e) })); return; }
      const link = PRESS_HOST + "/invite/" + inv.token, first = c.name.split(" ")[0];
      const text = "Hey " + first + "! Your Coaster on ComicTable is ready. Tap to set it up: " + link;
      box.replaceChildren(h("div", { class: "card-head" }, h("h2", { text: "Invite " + first }), h("span", { class: "hint", text: "Works once · 7 days" })),
        h("p", { class: "hint", style: "margin:0", text: "Text this to " + first + ". They tap it, pick a username and password, and their Coaster is theirs." + (siteId ? " They'll be an Editor on " + (S.site ? S.site.name : "this site") + "." : "") }),
        h("code", { class: "press-link", text: link }),
        h("div", { class: "btns" },
          h("a", { class: "btn primary", href: "sms:?&body=" + encodeURIComponent(text), text: "Text it" }),
          h("button", { class: "btn", type: "button", text: "Copy link", onclick: async () => toast((await copyText(link)) ? "Link copied." : link) }),
          h("button", { class: "btn ghost", type: "button", text: "Copy the message", onclick: async () => toast((await copyText(text)) ? "Message copied. Paste it in a text." : text) })));
    })();
    return box;
  }
