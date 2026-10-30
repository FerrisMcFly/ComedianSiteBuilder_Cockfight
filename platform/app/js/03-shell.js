  /* ============ shell ============ */
  // Simple line icons for the menu (24px grid, drawn with strokes)
  const ICONS = {
    home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
    overview: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
    me: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
    mysites: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/>',
    sites: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M8 4v5"/>',
    comics: '<path d="M12 3a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3z"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
    clubs: '<path d="M3 21h18M5 21V9l7-5 7 5v12M9 21v-6h6v6"/>',
    account: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    shows: '<path d="M4 7a2 2 0 0 0 2-2h12a2 2 0 0 0 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 0-2 2H6a2 2 0 0 0-2-2v-3a2 2 0 0 0 0-4z"/><path d="M14 5v14" stroke-dasharray="2 2"/>',
    podcast: '<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="3" y="14" width="4" height="7" rx="1.5"/><rect x="17" y="14" width="4" height="7" rx="1.5"/>',
    videos: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m10 9 5 3-5 3z"/>',
    merch: '<path d="M8 3 3 6l2 4 3-1v12h8V9l3 1 2-4-5-3a4 4 0 0 1-8 0z"/>',
    blog: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
    people: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c1-3.5 3.5-5 6.5-5s5.5 1.5 6.5 5"/><circle cx="17" cy="9" r="2.5"/><path d="M17 14c2.2 0 3.8 1.2 4.5 4"/>',
    fans: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
    forum: '<path d="M4 5h16v11H9l-5 4z"/>',
    chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.8A8 8 0 1 1 21 12z"/>',
    moderation: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/>',
    announce: '<path d="M3 10v4h3l7 4V6L6 10zM16 9a4 4 0 0 1 0 6"/>',
    links: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    theme: '<path d="M12 3a9 9 0 1 0 0 18c1 0 1.5-.7 1.5-1.5 0-1.3-1-1.5-1-2.8 0-.9.7-1.7 1.7-1.7H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="15" cy="7" r="1"/>',
    profile: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2.2"/><path d="M5.5 16.5c.7-1.6 2-2.5 3.5-2.5s2.8.9 3.5 2.5M15 10h3M15 13h3"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7.5 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 1.8 14H1.7a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 3.3 7.5a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H7.6A1.6 1.6 0 0 0 9 1.9V1.7a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V7.6A1.6 1.6 0 0 0 20.1 9h.2a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" transform="scale(.9) translate(1.3 1.3)"/>'
  };
  ICONS.picks = '<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>';
  ICONS.me = '<circle cx="12" cy="12" r="8.5"/><path d="M6.5 15.5h11"/><circle cx="12" cy="10" r="2.6"/>';
  ICONS.dates = '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/>';
  ICONS.press = '<rect x="3" y="6" width="18" height="14" rx="2"/><path d="M8 6l1.5-2.5h5L16 6"/><circle cx="12" cy="13" r="3.5"/>';
  function navIcon(s) {
    const span = h("span", { class: "ico", "aria-hidden": "true" });
    if (ICONS[s.id]) span.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + ICONS[s.id] + "</svg>";
    else span.textContent = s.ico;
    return span;
  }
  // A site's menu, grouped by job: what's on, what you post, who's listening, how the site looks. Settings sits at the bottom.
  // A site's menu. Most-used on top, and named after what visitors see:
  // Booking (dates and what clubs need), Content (what you post), Fans, Website (how it looks). Lineup and Settings sit at the bottom.
  // A site's menu: only what the site uses. The comic's own info (bio, photo, socials, press kit) lives on their Coaster,
  // so a site's dashboard is just the site: dates, what you post, fans, and how the website looks.
  const SECTIONS = [
    { id: "home", label: "Overview", ico: "🏠", render: viewHome },
    { id: "shows", group: "Booking", label: "Shows", ico: "🎟️", feat: "shows", count: () => S.shows.filter((s) => s.date >= today()).length, render: viewShows },
    { id: "podcast", group: "Content", get label() { return F("podcast") && F("videos") ? "Podcast / YouTube" : F("podcast") ? "Podcast" : "YouTube"; }, ico: "🎧", feat: ["podcast", "videos"],
      render: tabbed("podcast", "Podcast / YouTube", "", [{ id: "episodes", label: "Podcast", show: () => F("podcast"), render: viewPodcast }, { id: "videos", label: "YouTube", show: () => F("videos"), render: viewVideos }]) },
    { id: "posts", group: "Content", label: "Posts", ico: "✍️", render: tabbed("posts", "Posts", "News on your home screen, your links, and your blog.", [
      { id: "news", label: "News & home screen", render: viewPicks }, { id: "blog", label: "Blog", show: () => F("blog"), render: viewBlog }]) },
    { id: "merch", group: "Content", label: "Merch", ico: "👕", feat: "merch", count: () => S.merch.filter((m) => !m.hidden).length, render: viewMerch },
    { id: "fans", group: "Fans", label: "Fan list", ico: "💌", feat: "fans", render: viewFans },
    { id: "community", group: "Fans", label: "Community", ico: "💬", feat: ["forum", "chat"], render: tabbed("community", "Community", "Your forum and chat room, and the house rules for both.", [
      { id: "forum", label: "Forum", show: () => F("forum"), render: viewForum },
      { id: "chat", label: "Chat room", show: () => F("chat"), render: viewChat },
      { id: "rules", label: "Moderation", render: viewModeration }]) },
    { id: "website", label: "Website", ico: "🎨", bottom: true, render: tabbed("website", "Website", "Your site's about info and its look. News and links are under Posts.", [
      { id: "about", label: "About", render: viewProfile },
      { id: "look", label: "Look", render: viewTheme }]) },
    { id: "people", label: "Lineup", ico: "🎤", bottom: true, render: viewPeople },
    { id: "settings", label: "Settings", ico: "⚙️", bottom: true, render: viewSettings },
    // not in the menu: a comic's press kit, opened from their Lineup card (it belongs to their Coaster)
    { id: "press", label: "Press kit", nav: false, render: viewPress },
  ];
  // Old page names still work in links and bookmarks: they open the page they became.
  const ALIAS = { theme: ["website", "look"], picks: ["posts", "news"], blog: ["posts", "blog"], profile: ["website", "about"], forum: ["community", "forum"], chat: ["community", "chat"],
    moderation: ["community", "rules"], live: ["home"], videos: ["podcast", "videos"] };
  const hashParts = () => { let [id, tab] = location.hash.slice(1).split("/"); if (ALIAS[id]) { tab = ALIAS[id][1] || tab; id = ALIAS[id][0]; } return [id || "", tab || ""]; };
  // A page made of tabs (Website, Community). The tab is in the address: #website/about.
  function tabbed(id, title, sub, tabs) {
    return (main) => {
      const list = tabs.filter((t) => !t.show || t.show());
      let cur = hashParts()[1]; if (!list.some((t) => t.id === cur)) cur = list[0].id;
      main.append(head(title, sub));
      if (list.length > 1) main.append(h("div", { class: "tabs page-tabs", role: "tablist", "aria-label": title }, list.map((t) =>
        h("button", { type: "button", role: "tab", "data-tab": t.id, "aria-selected": String(t.id === cur), tabIndex: t.id === cur ? 0 : -1, text: t.label, onclick: () => go(id + "/" + t.id) }))));
      const panel = h("div", { class: "tab-panel" }); main.append(panel);
      list.find((t) => t.id === cur).render(panel);
    };
  }
  // The ComicTable level: above any one site. Super admins get the whole platform; comics get their own home.
  const CT_SECTIONS = [
    { id: "overview", label: "Overview", ico: "🏠", platform: true, render: viewOverview },
    // Every comic gets a dashboard. What's in the sidebar grows with them: a Coaster, then (with a site) their sites.
    { id: "home", label: "Dashboard", meOnly: true, render: viewMyHome },
    { id: "me", label: "My Coaster", ico: "🎤", meOnly: true, render: viewMe },
    { id: "dates", label: "Shows", ico: "📅", meOnly: true, render: viewMyDates },
    { id: "fans", label: "Fans", meOnly: true, render: viewMyFans },
    { id: "press", label: "Press kit", ico: "📷", meOnly: true, render: (main) => { main.append(head("Your press kit", "Approved photos and bios for clubs. It's the same on every site you're on.")); main.append(pressKitEditor(S.me.id)); } },
    { id: "helping", label: "Coasters you help with", ico: "🤝", helping: true, render: viewHelping },
    { id: "mysites", label: "Your sites", ico: "🧩", notPlatform: true, needsSite: true, render: viewMySites },
    { id: "sites", group: "Platform", label: "Sites", ico: "🧩", platform: true, count: () => S.sites.length, render: viewSites },
    { id: "comics", group: "Platform", label: "Coasters", ico: "🎤", platform: true, render: viewComics },
    { id: "clubs", group: "Platform", label: "Club database", ico: "🏛️", platform: true, render: viewClubs },
    { id: "account", label: "Account", ico: "🔐", bottom: true, render: viewAccount }
  ];
  const ctVisible = () => CT_SECTIONS.filter((x) => (!x.platform || S.isPlatform) && (!x.notPlatform || !S.isPlatform) && (!x.meOnly || S.me) && (!x.needsSite || S.sites.length) && (!x.helping || (S.helping && S.helping.length)));
  const atCT = () => location.hash.startsWith("#ct/");
  const goCT = (id) => { const h0 = "#ct/" + id; if (location.hash === h0) route(); else location.hash = h0; };
  // A site's team roles. "shows" and "moderator" see only their part of the dashboard.
  const SITE_ROLES = [["owner", "Owner", "Everything, including the team"], ["editor", "Editor", "Everything but the team"],
    ["shows", "Shows only", "Dates, ticket links, clubs and the show finder"], ["moderator", "Moderator", "Forum, chat and bans"]];
  const roleName = (r) => (SITE_ROLES.find((x) => x[0] === r) || [r, "Editor"])[1];
  const myRole = () => (S.isPlatform ? "owner" : (S.roles && S.roles[sid()]) || "owner");
  const ROLE_SECTIONS = { shows: ["shows"], moderator: ["community"] };
  ICONS.community = ICONS.chat; ICONS.website = ICONS.theme; ICONS.posts = ICONS.blog;
  const roleAllows = (id) => { const only = ROLE_SECTIONS[myRole()]; return !only || only.includes(id); };
  const visible = () => SECTIONS.filter((s) => roleAllows(s.id) && (!s.feat || (Array.isArray(s.feat) ? s.feat.some(F) : F(s.feat))));
  const current = () => { const id = hashParts()[0]; return visible().find((s) => s.id === id) || visible()[0]; };
  window.addEventListener("hashchange", () => { if (S.site || S.me) route(); });
  const go = (id) => { if (location.hash.slice(1) === id) route(); else location.hash = id; };

  function navList(list, cur, onGo) {
    let lastGroup = null;
    return list.flatMap((s) => {
      const out = [];
      if (s.bottom) { if (lastGroup !== "__bottom") out.push(h("div", { class: "nav-spacer" })); lastGroup = "__bottom"; }
      else if (s.group !== lastGroup) { if (s.group) out.push(h("div", { class: "nav-group", text: s.group })); else if (lastGroup) out.push(h("div", { class: "nav-group nav-sep" })); lastGroup = s.group; }
      out.push(h("button", { class: "nav-btn", type: "button", "data-sec": s.id, "aria-current": s === cur ? "page" : null, onclick: () => onGo(s.id) },
        navIcon(s), h("span", { text: s.label }), s.count ? h("span", { class: "cnt", text: s.count() }) : null));
      return out;
    });
  }
  // The sidebar (page map, Oct 29): Dashboard, then the comic's Coaster (their stuff), then Websites (each site's own
  // pages, the open one unfolded), ComicTable's staff pages, and Account at the bottom. Pages a site doesn't use never show.
  const SITE_NAV = { home: "Overview", posts: "Home & News", website: "Design", podcast: null, community: "Forum & chat", people: "Lineup", fans: "Fan list" };
  const ORDER = ["home", "posts", "website", "shows", "podcast", "community", "fans", "blog", "merch", "people", "settings"];
  function menuItems() {
    const items = [], siteSecs = S.site ? visible().filter((x) => x.nav !== false) : [];
    const ct = (id) => CT_SECTIONS.find((x) => x.id === id);
    // Dashboard: the comic's own, ComicTable's for staff, else the open site's
    if (S.isPlatform) items.push({ key: "ct/overview", id: "home", label: "Dashboard", onGo: () => goCT("overview") });
    else if (S.me) items.push({ key: "ct/home", id: "home", label: "Dashboard", onGo: () => goCT("home") });
    else if (S.site && siteSecs.some((x) => x.id === "home")) items.push({ key: "home", id: "home", label: "Dashboard", onGo: () => go("home") });
    // Coaster: everything that's the comic's, wherever it shows. Shows are always theirs, added right there.
    if (S.me) {
      items.push({ key: "ct/me", id: "me", label: "My Coaster", group: "Coaster", onGo: () => goCT("me") });
      items.push({ key: "ct/dates", id: "shows", label: "Shows", onGo: () => goCT("dates") });
      items.push({ key: "ct/fans", id: "fans", label: "Fans", onGo: () => goCT("fans") });
      items.push({ key: "ct/press", id: "press", label: "Press kit", onGo: () => goCT("press") });
    }
    if (S.helping && S.helping.length) items.push({ key: "ct/helping", id: "helping", label: S.helping.length === 1 ? S.helping[0].name + "'s Coaster" : "Coasters you help with", group: S.me ? null : "Coaster", onGo: () => goCT("helping") });
    // ComicTable's own pages, for staff
    if (S.isPlatform) ["sites", "comics", "clubs"].forEach((id, i) => items.push({ key: "ct/" + id, id, label: ct(id).label, group: i === 0 ? "ComicTable" : null, onGo: () => goCT(id) }));
    // Websites: the open site unfolds into its pages; the others are one tap away
    const siteList = S.isPlatform ? (S.site ? [S.site] : []) : S.sites.slice().sort((a, b) => a.name.localeCompare(b.name));
    const solo = S.hosts && S.hosts.length <= 1;
    // someone on one site's team (no Coaster, not staff) just gets that site's pages, no site row
    const flat = !S.isPlatform && !S.me && siteList.length === 1;
    siteList.forEach((st, i) => {
      const open = S.site && st.id === S.site.id;
      if (flat) { siteSecs.filter((x) => x.id !== "home").sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id)).forEach((x) => items.push({ key: x.id, id: x.id, label: SITE_NAV[x.id] || x.label, count: x.count, onGo: () => go(x.id) })); return; }
      items.push({ key: "site:" + st.id, site: st, label: st.name, group: i === 0 ? "Websites" : null, open, onGo: () => (open && S.level === "site" ? go("home") : switchSite(st.id, "home")) });
      if (!open) return;
      siteSecs.filter((x) => !(S.me && x.id === "shows" && solo)).sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id)).forEach((x) => items.push({ key: x.id, id: x.id, sub: true,
        label: S.me && x.id === "shows" ? "Live shows" : SITE_NAV[x.id] || x.label, count: x.count, onGo: () => go(x.id) }));
    });
    if (S.isPlatform && S.sites.length > 1) items.push({ key: "pick", id: "sites", label: S.site ? "Open another site…" : "Open a site…", sub: !!S.site, onGo: openSitePicker });
    items.push({ key: "ct/account", id: "account", label: "Account", bottom: true, onGo: () => goCT("account") });
    return items;
  }
  function sideMenu(curKey) {
    const out = [];
    let bottom = false;
    for (const it of menuItems()) {
      if (it.bottom && !bottom) { out.push(h("div", { class: "nav-spacer" })); bottom = true; }
      if (it.group) out.push(h("div", { class: "nav-group", text: it.group }));
      const cur = it.key === curKey || (it.site && it.open && curKey === "home" && S.level === "site");
      out.push(h("button", { id: it.key === "pick" ? "sitePick" : null, class: "nav-btn" + (it.sub ? " sub" : "") + (it.site ? " site" + (it.open ? " open" : "") : ""), type: "button", "data-sec": it.site ? "site-" + it.site.id : it.key.replace(/^ct\//, ""),
        "aria-current": cur ? "page" : null, "aria-expanded": it.site ? String(!!it.open) : null, onclick: it.onGo },
        it.site ? h("span", { class: "nav-av", "aria-hidden": "true", text: it.site.name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase() }) : it.sub ? null : navIcon(it),
        h("span", { class: "nav-label", text: it.label }), it.count ? h("span", { class: "cnt", text: it.count() }) : null,
        it.site ? h("span", { class: "nav-chev", "aria-hidden": "true", text: it.open ? "▾" : "▸" }) : null));
    }
    // on a phone the menu folds behind one button
    const nav = h("nav", { class: "side-nav", id: "sideNav", "aria-label": "Menu" }, out);
    const cur = menuItems().find((it) => it.key === curKey);
    const toggle = h("button", { class: "menu-toggle", type: "button", "aria-controls": "sideNav", "aria-expanded": "false",
      onclick: (e) => { const open = e.currentTarget.getAttribute("aria-expanded") !== "true"; e.currentTarget.setAttribute("aria-expanded", String(open)); nav.classList.toggle("open", open); } },
      h("span", { text: cur ? cur.label : "Menu" }), h("span", { class: "mt-ico", "aria-hidden": "true", text: "☰" }));
    return [toggle, nav];
  }
  // The site switcher, top left: which site you're working on. With one site it's just the name.
  function siteSwitch() {
    if (!S.sites.length) return S.me ? h("div", { class: "switch-pill static" }, h("span", { class: "sw-txt" }, h("b", { text: S.me.name }), h("span", { text: coasterUrl(S.me).replace(/^https?:\/\//, "") }))) : null;
    const st = S.site || S.sites[0];
    const many = S.sites.length > 1;
    return h(many ? "button" : "div", { class: "switch-pill" + (many ? "" : " static"), type: many ? "button" : null, id: many ? "sitePick" : null, title: many ? "Switch site (⌘K)" : null, "aria-haspopup": many ? "dialog" : null, onclick: many ? openSitePicker : null },
      h("span", { class: "sw-av", "aria-hidden": "true", text: (st.name || "?").split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase() }),
      h("span", { class: "sw-txt" }, h("b", { text: st.name }), h("span", { text: st.domain || "No web address yet" })),
      many ? h("span", { class: "sw-arrow", "aria-hidden": "true", text: "⌄" }) : null);
  }
  // Top bar: where you are, and your account. (The site finder is ⌘K anywhere, or the site name in the menu.)
  const ctHome = () => "#ct/" + (S.isPlatform ? "overview" : S.me ? "home" : S.helping && S.helping.length && !S.sites.length ? "helping" : "mysites");
  const logOut = async () => { await sb.auth.signOut(); S.site = null; showLogin(); };
  function acctMenu() {
    const initials = String(S.user || "?").split(/[\s._@-]+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
    const menu = h("details", { class: "acct" },
      h("summary", { "aria-label": "Your account" }, S.me && S.me.photo_url ? h("img", { class: "acct-av", src: S.me.photo_url, alt: "" }) : h("span", { class: "acct-av", "aria-hidden": "true", text: initials }), h("span", { class: "acct-name", text: S.me ? S.me.name : S.user })),
      h("div", { class: "acct-pop", role: "menu" },
        h("div", { class: "acct-who" }, h("b", { text: S.user }), h("span", { class: "hint", text: S.email || "" }), S.isPlatform ? h("span", { class: "pill", text: "Super admin" }) : null),
        h("a", { role: "menuitem", href: "#ct/account", class: "acct-link", text: "Your account" }),
        h("button", { role: "menuitem", type: "button", text: "Log out", onclick: logOut })));
    document.addEventListener("click", (e) => { if (menu.open && !menu.contains(e.target)) menu.open = false; });
    return menu;
  }
  function topBar(crumbs) {
    const trail = [];
    crumbs.filter(Boolean).forEach((c, i) => { if (i) trail.push(h("span", { class: "crumb-sep", "aria-hidden": "true", text: "/" })); trail.push(c); });
    return h("header", { class: "topbar" },
      h("div", { class: "top-left" }, h("nav", { class: "crumbs", "aria-label": "You are here" }, trail)),
      h("div", { class: "top-actions" },
        // the one red button: a comic's next show from anywhere in their own pages; on a site, a new post
        S.me && S.level === "ct" ? h("button", { class: "btn primary", type: "button", id: "topAddShow", text: "+ Add a show", onclick: () => { goCT("dates"); setTimeout(() => { const b = [...document.querySelectorAll("main button")].find((x) => /Add a date/.test(x.textContent)); if (b) b.click(); }, 60); } })
          : S.site && S.level === "site" && roleAllows("posts") ? h("button", { class: "btn primary", type: "button", id: "topNewPost", text: "+ New post", onclick: () => go("posts/news") }) : null,
        S.level === "site" && (S.site.domain || !CFG.PLATFORM) ? h("a", { class: "btn ghost sm", href: S.site.domain ? "https://" + S.site.domain : "./", target: "_blank", rel: "noopener", text: "View site ↗" }) : null,
        acctMenu()));
  }
  // Who gets the ComicTable level: super admins, comics with their own login, and anyone on more than one site.
  const hasCT = () => S.isPlatform || !!S.me || S.sites.length > 1 || !!(S.helping && S.helping.length);

  function routeCT() {
    S.level = "ct";
    setPath("dashboard"); document.title = "ComicTable";
    const id = location.hash.slice(4), list = ctVisible();
    const cur = list.find((x) => x.id === id) || list[0];
    const main = h("main", { id: "main" });
    root.replaceChildren(h("div", { class: "app" },
      h("aside", { class: "side" }, h("a", { class: "ct-brand", href: ctHome(), "aria-label": "ComicTable" }, wordmark("")), sideMenu(cur.id === "dates" && !S.site ? "ct/dates" : "ct/" + cur.id)),
      h("div", { class: "col" }, topBar([h("a", { class: "crumb", href: ctHome(), text: "ComicTable" }), h("span", { class: "crumb now", text: cur.label })]), main)));
    cur.render(main);
    window.scrollTo && window.scrollTo(0, 0);
  }

  function route() {
    if (!S.site) { if (!atCT() && history.replaceState) history.replaceState(null, "", location.pathname + ctHome()); return routeCT(); }  // a Coaster with no site
    if (atCT() && hasCT()) return routeCT();
    if (atCT()) { history.replaceState && history.replaceState(null, "", location.pathname + "#home"); }
    S.level = "site";
    setPath("dashboard"); document.title = S.site.name + " · ComicTable";
    const cur = current();
    const main = h("main", { id: "main" });
    root.replaceChildren(h("div", { class: "app" },
      h("aside", { class: "side" }, h("a", { class: "ct-brand", href: "#home", "aria-label": "ComicTable" }, wordmark("")), sideMenu(cur.nav === false ? "people" : cur.id)),
      h("div", { class: "col" }, topBar([hasCT() ? h("a", { class: "crumb back-ct", href: ctHome(), text: "ComicTable" }) : null,
        h("a", { class: "crumb", href: "#home", text: S.site.name }), cur.id !== "home" ? h("span", { class: "crumb now", text: cur.label }) : null]), main)));
    cur.render(main);
    window.scrollTo && window.scrollTo(0, 0);
  }
  /* ---------- site finder: type a few letters, Enter. Recent sites first. ---------- */
  const recentSites = () => { try { return JSON.parse(store.get("csb_recent_sites") || "[]"); } catch (e) { return []; } };
  function openSitePicker() {
    if ($("sitePicker") || !S.sites.length) return;
    if (S.sites.length === 1) { switchSite(S.sites[0].id); return; }
    const back = document.activeElement;
    const input = h("input", { type: "search", id: "sitePickerSearch", placeholder: "Find a site: name or web address", autocomplete: "off", "aria-label": "Find a site", role: "combobox", "aria-controls": "sitePickerList", "aria-expanded": "true" });
    const list = h("div", { class: "sp-list", id: "sitePickerList", role: "listbox", "aria-label": "Sites" });
    let items = [], active = 0;
    const close = () => { wrap.remove(); if (back && back.focus) back.focus(); };
    const pick = (st) => { close(); if (st.id !== sid() || atCT()) switchSite(st.id); };
    const draw = () => {
      const t = input.value.trim().toLowerCase();
      const byName = S.sites.slice().sort((a, b) => a.name.localeCompare(b.name));
      const recent = recentSites().map((id) => S.sites.find((x) => x.id === id)).filter((x) => x && x.id !== sid()).slice(0, 5);
      const match = (st) => !t || st.name.toLowerCase().includes(t) || String(st.domain || "").includes(t) || st.id.includes(t);
      const groups = t ? [["Matches", byName.filter(match)]]
        : [["Recent", recent], ["All sites (" + S.sites.length + ")", byName.filter((x) => !recent.includes(x))]];
      items = []; list.replaceChildren();
      for (const [label, sites] of groups) {
        if (!sites.length) continue;
        list.append(h("div", { class: "sp-group", text: label }));
        for (const st of sites) {
          const i = items.length; items.push(st);
          list.append(h("button", { type: "button", role: "option", class: "sp-item", id: "sp-" + i, "aria-selected": String(i === active), onclick: () => pick(st), onmousemove: () => { if (active !== i) { active = i; mark(); } } },
            h("b", { text: st.name }), st.id === sid() ? h("span", { class: "pill", text: "Open now" }) : null, h("span", { class: "hint", text: st.domain || st.id })));
        }
      }
      if (!items.length) list.append(h("div", { class: "empty", style: "padding:18px" }, h("b", { text: "No site matches “" + input.value.trim() + "”" }), S.isPlatform ? h("button", { class: "btn sm", type: "button", style: "margin-top:10px", text: "Start a new site", onclick: () => { close(); go("sites"); } }) : null));
      mark();
    };
    const mark = () => { items.forEach((_, i) => { const b = $("sp-" + i); if (b) b.setAttribute("aria-selected", String(i === active)); }); const cur = $("sp-" + active); if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: "nearest" }); input.setAttribute("aria-activedescendant", items.length ? "sp-" + active : ""); };
    input.addEventListener("input", () => { active = 0; draw(); });
    input.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") { e.preventDefault(); active = Math.min(items.length - 1, active + 1); mark(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); active = Math.max(0, active - 1); mark(); }
      else if (e.key === "Enter") { e.preventDefault(); if (items[active]) pick(items[active]); }
      else if (e.key === "Escape") { e.preventDefault(); close(); }
    });
    const wrap = h("div", { class: "sp-wrap", id: "sitePicker", onmousedown: (e) => { if (e.target === wrap) close(); } },
      h("div", { class: "sp-box", role: "dialog", "aria-modal": "true", "aria-label": "Switch site" }, input, list,
        h("div", { class: "sp-foot hint", text: "↑ ↓ to move · Enter to open · Esc to close" })));
    document.body.append(wrap);
    draw(); input.focus();
  }
  document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k" && S.site && (S.sites.length > 1 || atCT())) { e.preventDefault(); openSitePicker(); }
  });

  async function switchSite(id, sec) {
    store.set("csb_site", id); S.site = S.sites.find((s) => s.id === id);
    store.set("csb_recent_sites", JSON.stringify([id].concat(recentSites().filter((x) => x !== id)).slice(0, 8)));
    await loadAll(); await loadTheme();
    if (!sec && atCT()) sec = "home";
    if (sec && location.hash.slice(1) !== sec) location.hash = sec; else route();
  }
  function refreshNav() { document.querySelectorAll(".nav-btn").forEach((b) => { const s = SECTIONS.find((x) => x.id === b.dataset.sec); const c = b.querySelector(".cnt"); if (c && s && s.count) c.textContent = s.count(); }); }
  
  const head = (title, sub, right) => h("div", { class: "page-head" }, h("div", null, h("h1", { text: title }), sub ? h("p", { class: "sub", text: sub }) : null), right || null);
  const empty = (title, line) => h("div", { class: "empty" }, h("b", { text: title }), line || "");

