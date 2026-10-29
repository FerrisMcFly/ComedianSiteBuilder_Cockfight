  /* ======================================================
     PEOPLE
     ====================================================== */
  // Photos get cropped square (people, merch); keepShape just shrinks big ones (blog covers).
  function squareJpeg(file, max, keepShape) {
    return new Promise((resolve, reject) => {
      const img = new Image(), url = URL.createObjectURL(file);
      img.onload = () => {
        const c = document.createElement("canvas");
        if (keepShape) {
          const k = Math.min(1, (max || 1600) / Math.max(img.naturalWidth, img.naturalHeight));
          c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
          c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        } else {
          const m = Math.min(img.naturalWidth, img.naturalHeight), size = Math.min(max || 640, m);
          c.width = c.height = size;
          c.getContext("2d").drawImage(img, (img.naturalWidth - m) / 2, (img.naturalHeight - m) / 2, m, m, 0, 0, size, size);
        }
        URL.revokeObjectURL(url);
        c.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't read that image."))), "image/jpeg", 0.86);
      };
      img.onerror = () => reject(new Error("That file isn't an image the browser can open. Try a JPG or PNG."));
      img.src = url;
    });
  }
  // Every social a comic can add (the list lives in the data kit so sites and dashboard agree).
  // The first five have their own columns; the rest are saved in the socials JSON (19_more_socials.sql).
  const SOC = (window.CSB && CSB.SOCIALS ? CSB.SOCIALS : [["instagram", "Instagram", "", "https://www.instagram.com/…"], ["youtube", "YouTube", "", "https://www.youtube.com/@…"], ["tiktok", "TikTok", "", "https://www.tiktok.com/@…"], ["twitter", "X", "", "https://x.com/…"], ["website", "Website", "", "https://linktr.ee/…"]])
    .map(([k, l, , ph]) => [k, k === "twitter" ? "X / Twitter" : k === "website" ? "Linktree or website" : l, ph]);
  const COL_SOC = ["instagram", "youtube", "tiktok", "twitter", "website"];
  let OPEN_SOCIALS = null;  // a person id whose Social links should open (from "Edit your socials")
  // Comics live on ComicTable, not on one site. A site's People are its lineup: each card edits the comic's
  // shared profile (seen on every site they're on), and a site can keep its own title and bio for them.
  // comictable.com/<id> is the comic's Coaster, so these stay ComicTable's own addresses (same list as 21_coasters.sql)
  const RESERVED_IDS = ["login", "dashboard", "admin", "press", "join", "brand", "fonts", "themes", "embed", "sdk", "api", "app", "about", "pricing", "help", "privacy", "terms", "coaster", "coasters", "c", "u", "www", "index"];
  async function newComicId(name) {
    let base = slug(name) || "comic";
    if (RESERVED_IDS.includes(base)) base += "-comic";
    const taken = new Set((await q(sb.from("comics").select("id").like("id", base + "%"))).map((r) => r.id));
    let id = base, n = 2; while (taken.has(id)) id = base + "-" + n++;
    return id;
  }
  async function addToSite(comic) {
    let id = sid() + "-" + (slug(comic.name.split(" ")[0]) || "person");
    while (S.hosts.some((x) => x.id === id)) id = id + "-" + Math.floor(Math.random() * 900 + 100);
    await q(sb.from("hosts").insert({ id, site_id: sid(), comic_id: comic.id, name: comic.name, sort: S.hosts.length }));
    await reload.hosts(); await reload.shows(); await reload.sources(); await reload.videos();
  }
  function viewPeople(main) {
    const addBox = h("div");
    const addBtn = h("button", { class: "btn primary", type: "button", text: "+ Add a person", onclick: () => {
      const name = h("input", { id: "newPersonName", placeholder: "Start typing their name", maxlength: "60", autocomplete: "off" });
      const results = h("div", { class: "stack", style: "gap:6px" });
      const msg = h("div", { class: "err" });
      let seq = 0;
      const search = async () => {
        const n = name.value.trim(), my = ++seq; msg.textContent = "";
        if (n.length < 2) { results.replaceChildren(); return; }
        let found = [];
        try { found = await q(sb.from("comics").select("*").ilike("name", "%" + n.replace(/[%_,()]/g, "") + "%").limit(6)); } catch (e) {}
        if (my !== seq) return;
        const here = new Set(S.hosts.map((x) => x.comic_id));
        found = found.filter((c) => !here.has(c.id));
        let where = {};
        if (found.length) {
          try {
            const rows = await q(sb.from("hosts").select("comic_id, site_id").in("comic_id", found.map((c) => c.id)));
            const names = Object.fromEntries((await q(sb.from("sites").select("id, name").in("id", [...new Set(rows.map((r) => r.site_id))]))).map((x) => [x.id, x.name]));
            rows.forEach((r) => (where[r.comic_id] = where[r.comic_id] || []).push(names[r.site_id] || r.site_id));
          } catch (e) {}
        }
        if (my !== seq) return;
        results.replaceChildren(
          ...found.map((c) => h("div", { class: "switch-row" },
            h("div", { class: "person-top", style: "margin:0" }, c.photo_url ? h("img", { class: "avatar", style: "width:44px;height:44px", src: c.photo_url, alt: "" }) : null,
              h("div", null, h("b", { text: c.name }), h("div", { class: "hint", text: (where[c.id] ? "Already on ComicTable: " + where[c.id].join(", ") : "Has a Coaster") + (needsAsk(c) ? " · has their own login, so they say yes first" : "") }))),
            needsAsk(c) ? h("button", { class: "btn primary sm", type: "button", text: "Ask to add", title: c.name + " has their own login, so they say yes first", onclick: async (e) => {
              const b = e.currentTarget; b.disabled = true;
              try { await askForComic(c, sid()); b.textContent = "Asked"; }
              catch (er) { if (/duplicate|unique/i.test(errText(er))) b.textContent = "Already asked"; else { msg.textContent = errText(er); b.disabled = false; } }
            } })
            : h("button", { class: "btn primary sm", type: "button", text: "Add to " + S.site.name, onclick: async (e) => {
              e.currentTarget.disabled = true;
              try { await addToSite(c); route(); toast(c.name + " is on " + S.site.name + " now. Their dates, videos and profile came with them."); }
              catch (er) { msg.textContent = errText(er); e.currentTarget.disabled = false; }
            } }))),
          h("div", { class: "switch-row" }, h("div", null, h("b", { text: found.length ? "Someone else called " + n : n }), h("div", { class: "hint", text: "New to ComicTable. You'll fill in their photo, bio and socials next." })),
            h("button", { class: found.length ? "btn sm" : "btn primary sm", type: "button", id: "createPerson", text: "Add as new", onclick: async (e) => {
              e.currentTarget.disabled = true;
              try {
                const comic = { id: await newComicId(n), name: n, title: "Comedian", bio: "" };
                await q(sb.from("comics").insert(comic)); await addToSite(comic); route(); toast(n + " added. Fill in their bio and photo below.");
              } catch (er) { msg.textContent = errText(er); e.currentTarget.disabled = false; }
            } })));
      };
      name.addEventListener("input", search);
      addBox.replaceChildren(h("section", { class: "card stack" }, h("h2", { text: "Add a person" }),
        h("p", { class: "sub", text: "Comics, co-hosts, producers: anyone you want on the site with their own page and show dates. If they're already on ComicTable, pick them and their dates and videos come along." }),
        field("Name", name), results, msg, h("div", { class: "btns" }, h("button", { class: "btn ghost", type: "button", text: "Cancel", onclick: () => addBox.replaceChildren() }))));
      name.focus();
    } });
    main.append(head("Lineup", "Everyone on " + S.site.name + ". Each person gets their own page, bio, photo, socials and show dates.", addBtn), addBox);
    const grid = sortable(h("div", { class: "people" }), async (from, to) => { await resort("hosts", S.hosts, from, to); await reload.hosts(); route(); }); main.append(grid);
    if (!S.hosts.length) grid.append(h("section", { class: "card" }, empty("No one here yet", "Add the first person above.")));
    // which other sites each person is on, so it's clear what a shared change affects
    const elsewhere = {};
    (async () => {
      const ids = S.hosts.map((x) => x.comic_id).filter(Boolean);
      if (!ids.length) return;
      try {
        const rows = (await q(sb.from("hosts").select("comic_id, site_id").in("comic_id", ids))).filter((r) => r.site_id !== sid());
        if (!rows.length) return;
        const names = Object.fromEntries((await q(sb.from("sites").select("id, name").in("id", [...new Set(rows.map((r) => r.site_id))]))).map((x) => [x.id, x.name]));
        rows.forEach((r) => (elsewhere[r.comic_id] = elsewhere[r.comic_id] || []).push(names[r.site_id] || r.site_id));
        grid.querySelectorAll("[data-also]").forEach((el) => { const l = elsewhere[el.dataset.also]; if (l) { el.textContent = "Also on " + l.join(", ") + ". Name, photo, socials and the shared bio show there too."; el.hidden = false; } });
      } catch (e) {}
    })();
    S.hosts.forEach((x, idx) => {
      grid.append(personCard(x, idx));
    });
  }
