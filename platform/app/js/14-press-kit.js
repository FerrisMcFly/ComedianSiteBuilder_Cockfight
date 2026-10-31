  /* ======================================================
     PRESS KIT: a comic's approved photos and bios, for clubs
     (belongs to the comic, so it's the same on every site they're on)
     ====================================================== */
  /* ---------------- drag to reorder: mouse, finger or keyboard ---------------- */
  // Every list you can reorder on ComicTable works the same way: each row has data-drag="<key>" and a grip.
  // Hold the grip and slide (mouse or finger; the page scrolls near the edges), or focus it and press ↑/↓.
  // onMove(from, to) saves the new order and redraws.
  const GRIP_SVG = '<svg viewBox="0 0 16 16" aria-hidden="true"><g fill="currentColor"><circle cx="5.5" cy="3.5" r="1.4"/><circle cx="10.5" cy="3.5" r="1.4"/><circle cx="5.5" cy="8" r="1.4"/><circle cx="10.5" cy="8" r="1.4"/><circle cx="5.5" cy="12.5" r="1.4"/><circle cx="10.5" cy="12.5" r="1.4"/></g></svg>';
  function grip(label) {
    const b = h("button", { class: "drag-grip", type: "button", "aria-label": "Reorder " + label + ": drag, or press the arrow keys", title: "Drag to reorder" });
    b.innerHTML = GRIP_SVG;
    return b;
  }
  let dragFocus = null;  // after a keyboard move, put focus back on the grip of the row that moved
  function sortable(list, onMove) {
    const rows = () => [...list.children].filter((el) => el.hasAttribute("data-drag"));
    const done = async (from, to, key) => {
      if (from === to) return;
      dragFocus = key;
      try { await onMove(from, to); } catch (e) { toast(errText(e), { bad: true }); }
      setTimeout(() => { const g = dragFocus && document.querySelector('[data-drag="' + CSS.escape(dragFocus) + '"] .drag-grip'); if (g) g.focus(); dragFocus = null; }, 0);
    };
    list.addEventListener("keydown", (e) => {
      const g = e.target.closest && e.target.closest(".drag-grip"); if (!g) return;
      const row = g.closest("[data-drag]"); if (!row || row.parentElement !== list) return;
      const all = rows(), i = all.indexOf(row);
      const to = e.key === "ArrowUp" ? i - 1 : e.key === "ArrowDown" ? i + 1 : e.key === "Home" ? 0 : e.key === "End" ? all.length - 1 : null;
      if (to === null) return;
      e.preventDefault();
      if (to >= 0 && to < all.length) done(i, to, row.dataset.drag);
    });
    list.addEventListener("pointerdown", (e) => {
      const g = e.target.closest && e.target.closest(".drag-grip"); if (!g || (e.button !== undefined && e.button !== 0)) return;
      const row = g.closest("[data-drag]"); if (!row || row.parentElement !== list) return;
      e.preventDefault();
      const all = rows(), from = all.indexOf(row);
      if (all.length < 2) return;
      const boxes = all.map((el) => el.getBoundingClientRect());
      // the others slide by exactly the space the dragged row takes up (its height plus the gap between rows)
      const gap = Math.max(0, boxes[1].top - boxes[0].bottom);
      const step = boxes[from].height + gap;
      let startY = e.clientY, scrolled = 0, lastY = e.clientY, to = from, raf = null;
      try { g.setPointerCapture(e.pointerId); } catch (er) {}
      row.classList.add("dragging"); list.classList.add("is-sorting");
      const place = () => {
        const dy = lastY - startY + scrolled;
        row.style.transform = "translateY(" + dy + "px)";
        const mid = boxes[from].top + boxes[from].height / 2 + dy;
        to = 0; boxes.forEach((b, i) => { if (i !== from && b.top + b.height / 2 < mid) to++; });
        all.forEach((el, i) => {
          if (el === row) return;
          const shift = from < to && i > from && i <= to ? -step : from > to && i >= to && i < from ? step : 0;
          el.style.transform = shift ? "translateY(" + shift + "px)" : "";
        });
      };
      const edge = () => {  // scroll the page when dragging near the top or bottom of the screen
        const vh = window.innerHeight || 800, zone = 70;
        const by = lastY < zone ? -Math.ceil((zone - lastY) / 6) : lastY > vh - zone ? Math.ceil((lastY - (vh - zone)) / 6) : 0;
        if (by && window.scrollBy) { const y0 = window.scrollY; window.scrollBy(0, by); scrolled += window.scrollY - y0; place(); }
        raf = by ? requestAnimationFrame(edge) : null;
      };
      const move = (ev) => { lastY = ev.clientY; place(); if (!raf && window.requestAnimationFrame) raf = requestAnimationFrame(edge); };
      const up = () => {
        g.removeEventListener("pointermove", move); g.removeEventListener("pointerup", up); g.removeEventListener("pointercancel", up);
        if (raf && window.cancelAnimationFrame) cancelAnimationFrame(raf);
        all.forEach((el) => { el.style.transform = ""; }); row.classList.remove("dragging"); list.classList.remove("is-sorting");
        done(from, to, row.dataset.drag);
      };
      g.addEventListener("pointermove", move); g.addEventListener("pointerup", up); g.addEventListener("pointercancel", up);
    });
    return list;
  }
  // Save a new order for rows that have a "sort" column, renumbering only the ones that changed.
  async function resort(table, rows, from, to, match = (q0, r) => q0.eq("id", r.id)) {
    const next = rows.slice(); const [m] = next.splice(from, 1); next.splice(to, 0, m);
    for (let i = 0; i < next.length; i++) if (next[i].sort !== i) await q(match(sb.from(table).update({ sort: i }), next[i]));
  }
  const arrMove = (arr, from, to) => { const [m] = arr.splice(from, 1); arr.splice(to, 0, m); };

  /* ---------------- Coasters ---------------- */
  // A comic's Coaster is their card on ComicTable (the comics row): comictable.com/<id>.
  // The same editor shows on a comic's page (super admins) and on Me (the comic themselves).
  const LOOKS = [["classic", "Classic", "#F7F0DF", "#C4452E", "#1F1F1F"], ["night", "Night", "#232120", "#D9583F", "#F3EAD7"], ["redwood", "Redwood", "#F3EAD7", "#1F1F1F", "#A93A26"],
    ["mustard", "Mustard", "#1F1F1F", "#E0A21A", "#E0A21A"], ["spooky", "Spooky", "#1E1726", "#F07C1F", "#F07C1F", "Seasonal"], ["holiday", "Holiday", "#FBF3E4", "#D9443A", "#17321F", "Seasonal"]];
  // Seasonal looks show only in their season (month-day windows), unless a comic already has one on
  const SEASONS = { spooky: ["09-25", "11-05"], holiday: ["11-20", "01-06"] };
  const inSeason = (k, d = new Date()) => { const w = SEASONS[k]; if (!w) return true; const md = String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); return w[0] <= w[1] ? md >= w[0] && md <= w[1] : md >= w[0] || md <= w[1]; };
  const coasterUrl = (c) => PRESS_HOST + "/" + encodeURIComponent(c.handle || c.id);
  // The Coaster's own settings (Tape, look, what's on it, also on the bill), as pieces for a person's card to place in
  // its form. The card saves them with everything else in one go: one card, one Save, wherever a comic is edited.
  function coasterFields(c, opts = {}) {
    if (!c || !("look" in c)) return null;  // the database doesn't have 21_coasters.sql yet
    const yours = opts.me ? "your" : c.name.split(" ")[0] + "'s";
    const url = coasterUrl(c);
    let look = c.look || "classic";
    // Custom (their own colors) comes with a site on ComicTable, or Pro. The database checks this too.
    let onSite = opts.onSite;
    const canCustom = () => true;  // everything is free for now (founder, Oct 29)
    const style = { pulp: "#F4ECDC", ink: "#1F1F1F", band: "#C4452E", photo: "ink", ...((c.coaster && c.coaster.style) || {}) };
    const preview = h("div", { class: "mini-coaster", "aria-hidden": "true" });
    const colorIn = (k, label) => { const i = h("input", { type: "color", value: /^#[0-9a-f]{6}$/i.test(style[k]) ? style[k] : "#C4452E", "aria-label": label });
      i.addEventListener("input", () => { style[k] = i.value; if (k === "band") noBand.checked = false; paint(); }); return i; };
    const noBand = h("input", { type: "checkbox", checked: style.band === "none" });
    noBand.addEventListener("change", () => { style.band = noBand.checked ? "none" : bandIn.value; paint(); });
    const pulpIn = colorIn("pulp", "Board color"), inkIn = colorIn("ink", "Ink color"), bandIn = colorIn("band", "Band color");
    const photoSeg = h("div", { class: "seg", role: "group", "aria-label": "Photo" });
    const drawPhoto = () => photoSeg.replaceChildren(...[["ink", "One ink"], ["color", "Full color"]].map(([v, t]) =>
      h("button", { type: "button", "aria-pressed": String(style.photo === v), text: t, onclick: () => { style.photo = v; drawPhoto(); paint(); } })));
    drawPhoto();
    const customBox = h("div", { class: "custom-look stack", style: "gap:10px" },
      h("div", { class: "btns" }, h("label", { class: "color-pick" }, pulpIn, "Board"), h("label", { class: "color-pick" }, inkIn, "Ink"), h("label", { class: "color-pick" }, bandIn, "Band"),
        h("label", { class: "check" }, noBand, "No band")),
      h("div", { class: "btns" }, h("span", { class: "hint", text: "Photo:" }), photoSeg));
    const customNote = h("p", { class: "hint", style: "margin:0" });
    // How worn it looks: fresh, used (a glass ring or two), or well loved (rings, drips, scuffs, a nicked edge)
    let wear = (c.coaster && ["used", "loved"].includes(c.coaster.wear)) ? c.coaster.wear : "fresh";
    const wearSeg = h("div", { class: "seg", role: "group", "aria-label": "Wear" });
    const drawWear = () => wearSeg.replaceChildren(...[["fresh", "Fresh"], ["used", "Used"], ["loved", "Well loved"]].map(([v, t]) =>
      h("button", { type: "button", "aria-pressed": String(wear === v), text: t, onclick: () => { wear = v; drawWear(); paint(); } })));
    drawWear();
    const looks = h("div", { class: "looks", role: "group", "aria-label": "Look" }, [...LOOKS.filter(([k]) => inSeason(k) || k === c.look).map(([k, l, pulp, ring, print, tag]) =>
      h("button", { type: "button", "data-look": k, "aria-pressed": "false", onclick: () => { look = k; paint(); } },
        h("i", { style: `--pulp:${pulp};--ring:${ring};--print:${print}` }), h("span", { text: l }), tag ? h("small", { text: tag }) : null)),
      h("button", { type: "button", "data-look": "custom", "aria-pressed": "false", onclick: () => { if (!canCustom()) return; look = "custom"; paint(); } },
        h("i", { class: "rainbow" }), h("span", { text: "Custom" }))]);
    const paint = () => {
      const L = LOOKS.find((x) => x[0] === look);
      const [pulp, ring, print] = L ? [L[2], L[3], L[4]] : [style.pulp, style.band === "none" ? style.ink : style.band, style.ink];
      preview.style.setProperty("--pulp", pulp); preview.style.setProperty("--ring", ring); preview.style.setProperty("--print", print);
      preview.classList.toggle("color", look === "custom" && style.photo === "color");
      preview.classList.toggle("wear-used", wear === "used"); preview.classList.toggle("wear-loved", wear === "loved");
      preview.replaceChildren(c.photo_url ? h("img", { src: c.photo_url, alt: "" }) : h("b", { text: c.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase() }));
      looks.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.look === look)));
      looks.querySelector('[data-look="custom"]').disabled = !canCustom() && look !== "custom";
      customBox.hidden = look !== "custom";
      customNote.textContent = canCustom() ? "" : onSite === false ? "Custom looks (your own colors) come with a site on ComicTable." : "";
    };
    if (onSite === undefined) q(sb.from("hosts").select("id").eq("comic_id", c.id)).then((r) => { onSite = r.length > 0; paint(); }, () => {});
    // Pro isn't sold yet; ComicTable admins can switch it on by hand (saves right away)
    const proBox = S.isOwner && opts.admin ? h("div", { class: "switch-row" }, h("div", null, h("b", { text: "Pro" }), h("div", { class: "hint", text: "Not for sale yet. Switching it on gives " + c.name.split(" ")[0] + " the Custom look without a site." })),
      h("label", { class: "switch" }, h("input", { type: "checkbox", role: "switch", checked: !!c.pro, "aria-label": "Pro", onchange: async (e) => {
        try { await q(sb.from("comics").update({ pro: e.target.checked }).eq("id", c.id)); c.pro = e.target.checked; paint(); toast(c.name + (c.pro ? " has Pro." : " is back on the free Coaster.")); }
        catch (er) { e.target.checked = !e.target.checked; toast(errText(er), { bad: true }); }
      } }), h("span"))) : null;
    const tapeUrl = h("input", { type: "url", value: c.tape_url || "", placeholder: "https://www.youtube.com/watch?v=…", "aria-label": "Tape link" });
    const tapeTitle = h("input", { value: c.tape_title || "", maxlength: "120", placeholder: "Live at the Comedy Cellar, 2026", "aria-label": "Tape title" });
    const bills = h("input", { type: "checkbox", role: "switch", checked: c.on_bills !== false, "aria-label": "Show who else is on the bill" });
    const ITEMS = (window.CSB && CSB.COASTER_ITEMS) || [];
    const plan = (window.CSB && CSB.coasterPlan) ? CSB.coasterPlan(c) : {};
    // ...and in what order: arrows everywhere, drag on a computer
    const order = (window.CSB && CSB.coasterOrder) ? CSB.coasterOrder(c) : ITEMS.map((x) => x[0]);
    const planRows = h("div", { class: "plan" });
    const drawPlan = () => planRows.replaceChildren(...order.map((k, i) => {
      const it = ITEMS.find((x) => x[0] === k); if (!it) return null;
      const [, l, , d] = it;
      const seg = h("div", { class: "seg", role: "group", "aria-label": l });
      const drawSeg = () => seg.replaceChildren(...[["front", "Up front"], ["more", "Under More"], ["off", "Off"]].map(([v, t]) =>
        h("button", { type: "button", "aria-pressed": String(plan[k] === v), text: t, onclick: () => { plan[k] = v; drawSeg(); } })));
      drawSeg();
      return h("div", { class: "switch-row plan-row", "data-drag": k }, grip(l),
        h("div", { style: "flex:1;min-width:0" }, h("b", { text: l }), h("div", { class: "hint", text: d })), seg);
    }).filter(Boolean));
    sortable(planRows, (from, to) => { arrMove(order, from, to); drawPlan(); });
    // How socials show on the Coaster: logos / logo + name / names, brand colors or the Coaster's, and which ones
    const soc = { style: "icons", color: "brand", hide: [], ...((c.coaster && c.coaster.social_style) || {}) };
    const has = (window.CSB && CSB.socialsOf) ? CSB.socialsOf(c) : {};
    const socBox = h("div", { class: "stack soc-box", style: "gap:10px" });
    const drawSoc = () => {
      const seg = (label, key, opts) => h("div", { class: "seg", role: "group", "aria-label": label }, opts.map(([v, t]) =>
        h("button", { type: "button", "aria-pressed": String(soc[key] === v), text: t, onclick: () => { soc[key] = v; drawSoc(); } })));
      const nets = ((window.CSB && CSB.SOCIALS) || []).filter(([k]) => has[k] && k !== "website");
      socBox.replaceChildren(h("b", { text: "Social links on the Coaster" }),
        h("div", { class: "btns" }, seg("Socials show as", "style", [["icons", "Logos"], ["both", "Logo + name"], ["names", "Names"]]),
          soc.style !== "names" ? seg("Logo colors", "color", [["brand", "Brand colors"], ["look", "Coaster colors"]]) : null),
        nets.length ? h("div", { class: "soc-picks" }, nets.map(([k, l]) => {
          const on = !soc.hide.includes(k), ic = h("span", { "aria-hidden": "true" }); ic.innerHTML = CSB.socialIcon ? CSB.socialIcon(k, { brand: true, size: 18 }) : "";
          return h("button", { type: "button", class: "soc-pick", "aria-pressed": String(on), title: (on ? "Showing " : "Hidden: ") + l, onclick: () => { soc.hide = on ? [...soc.hide, k] : soc.hide.filter((x) => x !== k); drawSoc(); } }, ic, h("span", { text: l }));
        })) : h("p", { class: "hint", style: "margin:0", text: "Add your social links above and pick which ones show here." }));
    };
    drawSoc();
    drawPlan();
    paint();
    // The page around the coaster (founder's reference, Oct 30): background, how shows look, buttons, socials, how many shows
    const page = (window.CSB && CSB.coasterPageStyle) ? CSB.coasterPageStyle(c) : { bg: "brick", dates: "tickets", buttons: "status", tiles: "tiles", shown: "3" };
    const PG = (window.CSB && CSB.COASTER_PAGE) || {};
    const redraws = [];
    const pickBox = (label, key) => { const box = h("div", { class: "pick-row" }, h("span", { class: "pick-l", text: label }));
      const seg = h("div", { class: "chips", role: "group", "aria-label": label }); box.append(seg);
      const draw = () => seg.replaceChildren(...(PG[key] || []).map(([v, t]) => h("button", { type: "button", class: "chip", "data-page": key + ":" + v, "aria-pressed": String(page[key] === v), text: t, onclick: () => { page[key] = v; draw(); } })));
      draw(); redraws.push(draw); return box; };
    // Name lettering, shown in its own font
    const cs0 = c.coaster || {};
    let letter = cs0.letter || "block";
    const doodleSet = new Set(Array.isArray(cs0.doodles) ? cs0.doodles : []);
    let doodleColor = cs0.doodle_color || "ink";
    const LETS = (window.CSB && CSB.COASTER_LETTERING) || [], DOOS = (window.CSB && CSB.COASTER_DOODLES) || [], TPLS = (window.CSB && CSB.COASTER_TEMPLATES) || [];
    if (LETS.length && !document.getElementById("letFonts")) document.head.append(h("link", { id: "letFonts", rel: "stylesheet", href: "https://fonts.googleapis.com/css2?" + LETS.map((x) => "family=" + x[3]).join("&") + "&display=swap" }));
    const letRow = h("div", { class: "chips", role: "group", "aria-label": "Name lettering" });
    const drawLet = () => letRow.replaceChildren(...LETS.map(([k, l, font]) => h("button", { type: "button", class: "chip let-chip", "data-letter": k, "aria-pressed": String(letter === k), style: "font-family:" + font, text: l, onclick: () => { letter = k; drawLet(); } })));
    drawLet(); redraws.push(drawLet);
    const doRow = h("div", { class: "chips", role: "group", "aria-label": "Doodles" });
    const drawDo = () => doRow.replaceChildren(h("button", { type: "button", class: "chip", "data-doodle": "none", "aria-pressed": String(!doodleSet.size), text: "None", onclick: () => { doodleSet.clear(); drawDo(); } }),
      ...DOOS.map(([k, l]) => h("button", { type: "button", class: "chip doo-chip", "data-doodle": k, "aria-pressed": String(doodleSet.has(k)), text: l, onclick: () => { doodleSet.has(k) ? doodleSet.delete(k) : doodleSet.add(k); drawDo(); } })));
    drawDo(); redraws.push(drawDo);
    const doColor = h("div", { class: "chips", role: "group", "aria-label": "Doodle color" });
    const drawDoC = () => doColor.replaceChildren(...[["ink", "Ink"], ["band", "Band color"]].map(([v, t]) => h("button", { type: "button", class: "chip", "aria-pressed": String(doodleColor === v), text: t, onclick: () => { doodleColor = v; drawDoC(); } })),
      (() => { const i = h("input", { type: "color", "aria-label": "Your own doodle color", value: /^#/.test(doodleColor) ? doodleColor : "#E0A21A" }); i.addEventListener("input", () => { doodleColor = i.value; }); return h("label", { class: "chip color-chip" }, i, "Your color"); })());
    drawDoC(); redraws.push(drawDoC);
    const letterBox = h("div", { class: "pick-row" }, h("span", { class: "pick-l", text: "Name lettering" }), letRow);
    const doodleBox = h("div", { class: "pick-row" }, h("span", { class: "pick-l", text: "Doodles" }), doRow, doColor);
    // Templates: set everything at once, then change any part
    const tplRow = h("div", { class: "tpl-grid", role: "group", "aria-label": "Templates" }, TPLS.map(([k, l, t]) => {
      const L = LOOKS.find((x) => x[0] === t.look), pulp = t.style ? t.style.pulp : L ? L[2] : "#E9D6AF", ring = t.style ? t.style.band : L ? L[3] : "#C4452E";
      return h("button", { type: "button", class: "tpl", "data-template": k, onclick: () => {
        look = t.look; if (t.style) Object.assign(style, t.style); letter = t.letter || "block"; doodleSet.clear(); (t.doodles || []).forEach((x) => doodleSet.add(x));
        Object.assign(page, t.page || {}); redraws.forEach((f) => f()); drawPhoto(); paint(); toast(l + " is on. Change any part below.");
      } }, h("span", { class: "tpl-sw bg-" + ((t.page || {}).bg || "brick") }, h("i", { style: "background:" + pulp + ";box-shadow:0 0 0 3px " + ring })), h("b", { text: l }));
    }));
    const templateBox = h("div", { class: "pick-row" }, h("span", { class: "pick-l", text: "Start from a template" }), tplRow);
    // The photo on the coaster: their profile photo or one just for the coaster; move it, zoom it, etched or in color
    let cPhoto = cs0.photo || "", printMode = ["ink", "color"].includes(cs0.print) ? cs0.print : "auto";
    const photoY = h("input", { type: "range", min: "0", max: "100", value: String(cs0.photo_y >= 0 ? cs0.photo_y : 22), "aria-label": "Move the photo up or down" });
    const photoZ = h("input", { type: "range", min: "100", max: "200", value: String(cs0.photo_zoom || 100), "aria-label": "Zoom the photo" });
    const cFile = h("input", { type: "file", accept: "image/*", style: "display:none", "aria-label": "Photo just for the coaster" });
    const photoNote = h("span", { class: "hint" });
    const drawPhotoNote = () => { photoNote.textContent = cPhoto ? "Using a photo just for the coaster." : "Using your profile photo."; useProfile.hidden = !cPhoto; };
    const useProfile = h("button", { type: "button", class: "chip", text: "Use my profile photo", onclick: () => { cPhoto = ""; drawPhotoNote(); } });
    cFile.addEventListener("change", async () => {
      if (!cFile.files[0]) return;
      try { toast("Uploading…"); cPhoto = await uploadImage(cFile.files[0], c.id + "-coaster", { folder: c.id }); cFile.value = ""; drawPhotoNote(); cFile.dispatchEvent(new Event("input", { bubbles: true })); toast("On the coaster."); }
      catch (e) { toast(errText(e), { bad: true }); }
    });
    const printRow = h("div", { class: "chips", role: "group", "aria-label": "How the photo is printed" });
    const drawPrint = () => printRow.replaceChildren(...[["auto", "The look decides"], ["ink", "Etched, one ink"], ["color", "Full color photo"]].map(([v, t]) => h("button", { type: "button", class: "chip", "data-print": v, "aria-pressed": String(printMode === v), text: t, onclick: () => { printMode = v; drawPrint(); } })));
    drawPrint(); redraws.push(drawPrint); drawPhotoNote();
    const photoBox = h("div", { class: "pick-row" }, h("span", { class: "pick-l", text: "Photo on the coaster" }),
      h("div", { class: "chips" }, h("label", { class: "chip" }, "Use a different photo", cFile), useProfile), photoNote,
      h("span", { class: "hint photo-size", text: "Best: a square photo, at least 1000 × 1000 pixels, with your face in the middle and some space above your head. JPG or PNG." }),
      h("div", { class: "range-row" }, h("label", null, h("span", { text: "Up / down" }), photoY), h("label", null, h("span", { text: "Zoom" }), photoZ)), printRow);
    // The banner with their name
    const banner = { pos: "low", shape: "ribbon", tilt: "tilted", ...((cs0.banner && typeof cs0.banner === "object") ? cs0.banner : {}) };
    const bannerRow = (label, key, opts) => { const row = h("div", { class: "chips", role: "group", "aria-label": label });
      const draw = () => row.replaceChildren(...opts.map(([v, t]) => h("button", { type: "button", class: "chip", "data-banner": key + ":" + v, "aria-pressed": String(banner[key] === v), text: t, onclick: () => { banner[key] = v; draw(); } })));
      draw(); redraws.push(draw); return row; };
    // the address printed on the coaster (comictable.com/name): on or off
    const addrOn = h("input", { type: "checkbox", role: "switch", checked: cs0.addr !== false, "aria-label": "Print my address on the coaster" });
    const addrRow = h("div", { class: "switch-row" }, h("div", null, h("b", { text: "Address on the coaster" }), h("div", { class: "hint", text: "comictable.com/" + (c.handle || c.id) + " printed under your name." })), h("label", { class: "switch" }, addrOn, h("span")));
    const bannerBox = h("div", { class: "pick-row" }, h("span", { class: "pick-l", text: "Name banner" }),
      bannerRow("Where the banner sits", "pos", [["low", "Lower"], ["mid", "Middle"], ["top", "Top"], ["none", "No banner"]]),
      bannerRow("Banner style", "shape", [["ribbon", "Ribbon"], ["band", "Straight band"], ["plain", "Just the name"]]),
      bannerRow("Banner angle", "tilt", [["tilted", "Tilted"], ["straight", "Straight"]]), addrRow);
    const pageBox = h("div", { class: "stack", style: "gap:4px" }, pickBox("Background", "bg"), pickBox("Shows look like", "dates"), pickBox("Ticket buttons", "buttons"), pickBox("Socials", "tiles"));
    const shownBox = pickBox("How many shows up front", "shown");
    // Where the QR code on the back goes (default: the fan list)
    const qr = { to: "fans", link: "", ...((c.coaster && c.coaster.qr && typeof c.coaster.qr === "object") ? c.coaster.qr : {}) };
    const qrSel = h("select", { "aria-label": "QR code goes to" }, [["fans", "Join my fan list"], ["coaster", "My Coaster"], ["site", "My website"], ["tickets", "My next show's tickets"], ["link", "A link I choose"]]
      .map(([v, t]) => h("option", { value: v, text: t, selected: qr.to === v })));
    const qrLink = h("input", { type: "url", placeholder: "https://…", value: qr.link || "", "aria-label": "QR link" });
    const qrBox = h("div", { class: "stack", style: "gap:8px" }, field("The QR code on the back goes to", qrSel), qrLink);
    const qrShow = () => { qrLink.hidden = qrSel.value !== "link"; }; qrSel.addEventListener("change", qrShow); qrShow();
    // The link buttons on the Coaster (the sites they're on, and their link-in-bio): drag to order, switch any off
    const linkOrder = (c.coaster && Array.isArray(c.coaster.links)) ? [...c.coaster.links] : [];
    const linkOff = new Set((c.coaster && Array.isArray(c.coaster.links_off)) ? c.coaster.links_off : []);
    let linkList = [];
    const linkRows = h("div", { class: "plan" }, h("p", { class: "hint", style: "margin:0", text: "Loading…" }));
    const drawLinks = () => {
      linkList.sort((a, b) => { const i = linkOrder.indexOf(a.key), j = linkOrder.indexOf(b.key); return (i < 0 ? 100 + a.rank : i) - (j < 0 ? 100 + b.rank : j); });
      linkRows.replaceChildren(...(linkList.length ? linkList.map((x) => h("div", { class: "switch-row plan-row", "data-drag": x.key }, grip(x.title),
        h("div", { style: "flex:1;min-width:0" }, h("b", { text: x.title }), h("div", { class: "hint", text: x.sub })),
        h("label", { class: "switch" }, h("input", { type: "checkbox", role: "switch", checked: !linkOff.has(x.key), "aria-label": "Show " + x.title, onchange: (e) => { e.target.checked ? linkOff.delete(x.key) : linkOff.add(x.key); } }), h("span")))) 
        : [h("p", { class: "hint", style: "margin:0", text: "None yet. Sites " + (opts.me ? "you're" : "they're") + " on, and a Linktree or website under Socials, show up here." })]));
    };
    sortable(linkRows, (from, to) => { const keys = linkList.map((x) => x.key); arrMove(keys, from, to); linkOrder.splice(0, linkOrder.length, ...keys); drawLinks(); });
    (async () => {
      try {
        const hs = await q(sb.from("hosts").select("site_id,hidden").eq("comic_id", c.id));
        const ids = hs.filter((x) => !x.hidden).map((x) => x.site_id);
        const sites = ids.length ? await q(sb.from("sites").select("id,name,domain").in("id", ids)) : [];
        linkList = sites.filter((x) => x.domain).map((x) => ({ key: "site:" + x.id, rank: x.name === c.name ? 0 : 1, title: x.name === c.name ? "My website" : x.name, sub: x.domain }));
        const web = (window.CSB && CSB.socialsOf ? CSB.socialsOf(c) : {}).website;
        if (web) linkList.push({ key: "website", rank: 2, title: /linktr\.ee/i.test(web) ? "Linktree" : "Website", sub: web.replace(/^https?:\/\/(www\.)?/, "") });
      } catch (e) { linkList = []; }
      drawLinks();
    })();
    const linksBox = linkRows;
    const billsRow = h("div", { class: "switch-row" }, h("div", null, h("b", { text: "Also on the bill" }),
      h("div", { class: "hint", text: "When another comic on ComicTable has the same club on the same night, you show up on each other's dates. Nobody has to tag anyone." })),
      h("label", { class: "switch" }, bills, h("span")));
    return {
      url,
      // the pieces on their own, for the Coaster page (coasterPage) to lay out
      parts: { photo: photoBox, banner: bannerBox, templates: templateBox, letter: letterBox, doodles: doodleBox, page: pageBox, shown: shownBox, qr: qrBox, preview, looks: h("div", { class: "stack", style: "gap:10px;min-width:0" }, looks, customBox, customNote), wear: h("div", { class: "btns" }, h("span", { class: "hint", text: "Wear" }), wearSeg),
        tapeUrl, tapeTitle, linksBox, plan: h("div", { class: "stack", style: "gap:8px" }, h("b", { text: "What's on " + yours + " Coaster" }),
          h("p", { class: "hint", style: "margin:0", text: "Up front, under More, or off. Drag to change the order." }), planRows), socBox, billsRow, proBox },
      // a line under the name: the Coaster's address, with Open
      link: h("div", { class: "hint coaster-link" }, h("a", { href: url, target: "_blank", rel: "noopener", text: url.replace(/^https?:\/\//, "") + " ↗" }),
        h("button", { class: "linkish", type: "button", text: "Copy", onclick: async () => toast((await copyText(url)) ? "Coaster link copied." : "Couldn't copy. Try again.") })),
      get tape() { return h("div", { class: "grid" }, field("The Tape: " + yours + " best set right now", tapeUrl, "c8"), field("What it is", tapeTitle, "c4")); },
      get look() { return h("div", { class: "coaster-edit" }, preview, h("div", { class: "stack", style: "gap:8px;min-width:0" }, h("b", { text: "Coaster look" }), looks,
        h("div", { class: "hint", text: "Seasonal looks come and go with the time of year." }), customBox, customNote,
        h("div", { class: "btns" }, h("span", { class: "hint", text: "Wear:" }), wearSeg))); },
      get more() { return h("details", { class: "quiet coaster-more" }, h("summary", { text: "What's on " + yours + " Coaster" }),
        h("p", { class: "hint", style: "margin:8px 0 0", text: "Keep it simple: a few things up front. Fans tap More for the rest. Drag the grips to change the order." }), planRows, socBox,
        h("div", { class: "switch-row" }, h("div", null, h("b", { text: "Also on the bill" }),
          h("div", { class: "hint", text: "When another comic on ComicTable has the same club on the same night, you show up on each other's dates. Nobody has to tag anyone." })),
          h("label", { class: "switch" }, bills, h("span"))), proBox); },
      check() { const t = tapeUrl.value.trim(); if (t && !/^https:\/\//i.test(t)) { tapeUrl.focus(); return "The Tape needs a full link that starts with https://"; }
        if (qrSel.value === "link" && !/^https:\/\//i.test(qrLink.value.trim())) { qrLink.focus(); return "The QR code's link needs to start with https://"; } return ""; },
      patch() {
        const t = tapeUrl.value.trim();
        const out = { look, tape_url: t || null, tape_title: tapeTitle.value.trim() || null, on_bills: bills.checked };
        if ("coaster" in c) out.coaster = { ...plan, order: [...order], social_style: { ...soc }, wear, links: linkList.length ? linkList.map((x) => x.key) : linkOrder, links_off: [...linkOff], page: { ...page }, letter, doodles: [...doodleSet], doodle_color: doodleColor,
          banner: { ...banner }, addr: addrOn.checked, photo_y: +photoY.value, photo_zoom: +photoZ.value, ...(cPhoto ? { photo: cPhoto } : {}), ...(printMode !== "auto" ? { print: printMode } : {}), qr: { to: qrSel.value, ...(qrSel.value === "link" ? { link: qrLink.value.trim() } : {}) }, ...(look === "custom" ? { style: { ...style } } : (c.coaster && c.coaster.style ? { style: c.coaster.style } : {})) };
        return out;
      }
    };
  }
  // The Coaster page (founder, Oct 29: "messy, confusing, looks bad"): the basics in plain cards, the coaster itself
  // on the side with the Save button, and everything else folded under More options and For bookers.
  // My Coaster (style guide, Oct 29): four parts, one open at a time, next to a live phone preview of the real page.
  // Changes save by themselves a moment after you stop, with Undo; "Save Coaster" saves right away.
  function coasterPage(x, opts = {}) {
    const c = { ...x, id: x.comic_id };
    const cf = coasterFields(c, { me: opts.me, admin: opts.comic, onSite: opts.onSite });
    const P = cf ? cf.parts : null;
    const first = (c.name || "").split(" ")[0];
    const yours = opts.me ? "your" : first + "'s";
    const inp = { name: h("input", { value: c.name || "", required: true, "aria-label": "Name" }), title: h("input", { value: c.title || "", placeholder: "Comedian", "aria-label": "Title" }),
      bio: h("textarea", { value: c.bio || "", "aria-label": "Bio", placeholder: "Two or three lines about " + (opts.me ? "you" : first) + "." }) };
    inp.bio.value = c.bio || "";
    const moreSoc = (c.socials && typeof c.socials === "object") ? c.socials : {};
    const hasMore = "socials" in c;
    for (const [k, l, ph] of SOC) if (COL_SOC.includes(k) || hasMore) inp[k] = h("input", { type: "url", value: (COL_SOC.includes(k) ? c[k] : moreSoc[k]) || "", placeholder: ph, "aria-label": l });
    const socInputs = SOC.filter(([k]) => inp[k]);
    const filled = socInputs.filter(([k]) => inp[k].value), empties = socInputs.filter(([k]) => !inp[k].value);
    const socIcon = (k) => { const sp = h("span", { class: "soc-ic", "aria-hidden": "true" }); sp.innerHTML = window.CSB && CSB.socialIcon ? CSB.socialIcon(k, { brand: true, size: 20, onDark: true }) : ""; return sp; };
    const socRow = ([k, l]) => h("label", { class: "soc-row" }, socIcon(k), h("span", { class: "soc-l", text: l }), inp[k]);
    let pic = c.photo_url ? h("img", { class: "cp-photo", src: c.photo_url, alt: "" }) : h("div", { class: "cp-photo", text: (c.name || "?").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase() });
    const file = h("input", { type: "file", accept: "image/*", style: "display:none" });
    file.addEventListener("change", () => { if (file.files[0]) { const im = h("img", { class: "cp-photo", src: URL.createObjectURL(file.files[0]), alt: "" }); pic.replaceWith(im); pic = im; changed(true); } });
    const msg = h("div", { class: "err" });
    const save = h("button", { class: "btn primary big cp-save", type: "submit", form: "coasterForm", text: "Save Coaster" });
    const status = h("div", { class: "cp-status", role: "status", "aria-live": "polite" });

    // what's typed right now, as Coaster fields
    const draft = () => {
      const prof = { name: inp.name.value.trim(), title: inp.title.value.trim() || "Comedian", bio: inp.bio.value.trim(), ...(cf ? cf.patch() : {}) };
      for (const k of COL_SOC) prof[k] = inp[k].value.trim() || null;
      if (hasMore) { const more = {}; for (const [k] of SOC) if (!COL_SOC.includes(k) && inp[k] && inp[k].value.trim()) more[k] = inp[k].value.trim(); prof.socials = more; }
      return prof;
    };
    let saved = null, before = null, timer = null, busy = false;
    async function store(prof, how) {
      busy = true; status.textContent = "Saving…"; status.className = "cp-status";
      try {
        if (file.files[0]) { prof.photo_url = await uploadImage(file.files[0], c.id, { folder: opts.folder }); file.value = ""; }
        await q(sb.from("comics").update(prof).eq("id", c.id));
        if (opts.me) S.me = { ...S.me, ...prof };
        before = saved; saved = { ...saved, ...prof };
        status.replaceChildren(h("span", { class: "ok", text: "Saved" }), before && how !== "undo" ? h("button", { class: "linkish", type: "button", text: "Undo", onclick: undo }) : null);
        return true;
      } catch (err) { status.textContent = ""; msg.textContent = errText(err); return false; }
      finally { busy = false; }
    }
    async function undo() { if (!before) return; const back = before; clearTimeout(timer); if (await store({ ...back }, "undo")) { toast("Undone."); route(); } }
    // send the draft to the preview, and save a moment after they stop
    let frame = null;
    const toPreview = () => { if (frame && frame.contentWindow) try { frame.contentWindow.postMessage({ type: "ct-coaster", comic: { ...c, ...draft(), photo_url: pic.tagName === "IMG" ? pic.src : c.photo_url } }, location.origin); } catch (e) {} };
    function changed(now) {
      msg.textContent = ""; toPreview();
      clearTimeout(timer);
      timer = setTimeout(() => { const bad = cf ? cf.check() : ""; if (bad) { msg.textContent = bad; return; } if (!busy) store(draft()); }, now ? 50 : 1200);
    }

    const form = h("form", { id: "coasterForm", class: "stack cp-parts", onsubmit: async (e) => {
      e.preventDefault(); msg.textContent = ""; clearTimeout(timer);
      const bad = cf ? cf.check() : ""; if (bad) { msg.textContent = bad; return; }
      save.disabled = true;
      const prof = draft();
      if (await store(prof)) { if (S.site) await reload.hosts(); toast(prof.name + "'s Coaster is saved."); route(); }
      save.disabled = false;
    } });
    // one part open at a time
    const part = (n, title, sub, open, ...body) => {
      const d = h("details", { class: "card cp-part", open: open || null, "data-part": n },
        h("summary", null, h("span", { class: "cp-n", text: n }), h("span", { class: "cp-t" }, h("b", { text: title }), h("small", { text: sub }))), h("div", { class: "cp-body stack" }, ...body));
      d.addEventListener("toggle", () => { if (d.open) form.querySelectorAll("details.cp-part").forEach((o) => { if (o !== d) o.open = false; }); });
      return d;
    };
    form.append(
      part("1", "Basics", "Name, photo, bio, Tape and socials", !P || opts.open === "basics",
        h("div", { class: "cp-basics" }, h("div", { class: "cp-pic" }, pic, h("label", { class: "btn sm" }, "Change photo", file)),
          h("div", { class: "stack", style: "gap:10px;min-width:0;flex:1" }, h("div", { class: "grid" }, field("Name", inp.name, "c6"), field("Under your name", inp.title, "c6")), field("Bio", inp.bio), cf ? cf.link : null)),
        P ? h("div", { class: "grid" }, field("The Tape: " + yours + " best set right now", P.tapeUrl, "c8"), field("What it is", P.tapeTitle, "c4")) : null,
        h("div", { class: "stack", style: "gap:8px" }, h("b", { text: "Socials" }),
          filled.length ? h("div", { class: "soc-list" }, filled.map(socRow)) : h("p", { class: "hint", style: "margin:0", text: "Paste the link to each one you use." }),
          empties.length ? h("details", { class: "quiet", open: !filled.length || null }, h("summary", { text: filled.length ? "Add another" : "All networks" }), h("div", { class: "soc-list", style: "margin-top:10px" }, empties.map(socRow))) : null)),
      P ? part("2", "Look", "Templates, the coaster, lettering, doodles, the wall behind it", opts.open !== "basics" && opts.open !== "links" && opts.open !== "on", P.templates, P.photo, P.banner, h("div", { class: "pick-row" }, h("span", { class: "pick-l", text: "Coaster colors (Custom: design your own)" }), P.looks), P.letter, P.doodles, P.wear, P.page) : null,
      P ? part("3", "Links & QR", "Your buttons, where the QR code goes, how socials show", false, P.linksBox, P.qr, P.socBox) : null,
      P ? part("4", "What's on it", "Up front, under More or off, and in what order", false, P.plan, P.shown, P.billsRow, P.proBox) : null,
      msg);
    // anything they touch updates the preview and saves a moment later
    form.addEventListener("input", () => changed());
    form.addEventListener("change", (e) => { if (e.target !== file) changed(); });
    form.addEventListener("click", (e) => { if (e.target.closest("button") && !e.target.closest("summary") && !e.target.closest(".cp-status")) setTimeout(() => changed(), 0); });

    // the preview: the real Coaster page in a phone, when it's on this same address; otherwise the coaster itself
    const canFrame = cf && CFG.PLATFORM && cf.url.startsWith(location.origin);
    if (canFrame) { frame = h("iframe", { class: "cp-frame", title: "Live preview of " + yours + " Coaster", src: cf.url + "?preview=1", loading: "lazy" });
      window.addEventListener("message", (e) => { if (e.origin === location.origin && e.data && e.data.type === "ct-coaster-ready" && frame && e.source === frame.contentWindow) toPreview(); }); }
    const side = h("aside", { class: "cp-side" },
      canFrame ? h("div", { class: "cp-phone" }, frame) : P ? h("div", { class: "cp-stage" }, P.preview) : null,
      canFrame ? null : h("b", { class: "cp-name", text: c.name }),
      h("div", { class: "cp-actions" }, status, cf ? h("a", { class: "btn sm", href: cf.url, target: "_blank", rel: "noopener", text: "Open ↗" }) : null), save);
    saved = draft();
    const main = h("div", { class: "cp-main stack" }, form,
      opts.bookers === false ? null : (() => { const d = h("details", { class: "card cp-fold" }, h("summary", { text: "For bookers: press kit" }));
        d.addEventListener("toggle", () => { if (d.open && d.children.length === 1) d.append(pressKitEditor(c.id)); }); return d; })());
    return h("div", { class: "cp" }, main, side);
  }
  // A site asks before adding a comic who has their own login. They answer on Me.
  async function askForComic(c, siteId) {
    await q(sb.from("coaster_requests").insert({ comic_id: c.id, site_id: siteId, requested_by: S.uid }));
    toast("Asked " + c.name.split(" ")[0] + ". They'll be added when they say yes.");
  }
  const needsAsk = (c) => !!c.user_id && c.user_id !== S.uid && !S.isOwner;
  async function requestsCard(me) {
    let reqs = [];
    try { reqs = await q(sb.from("coaster_requests").select("*").eq("comic_id", me.id).eq("status", "pending").order("created_at", { ascending: true })); } catch (e) { return null; }
    if (!reqs.length) return null;
    const names = {};
    try { (await q(sb.from("sites").select("id, name, domain").in("id", reqs.map((r) => r.site_id)))).forEach((x) => (names[x.id] = x)); } catch (e) {}
    return h("section", { class: "card stack attention" }, h("h2", { style: "margin:0", text: reqs.length === 1 ? "A site wants to add you" : reqs.length + " sites want to add you" }),
      h("p", { class: "sub", style: "margin:0", text: "Say yes and your Coaster (photo, bio, socials, dates and videos) shows on their site. You can ask them to take you off any time." }),
      h("div", null, reqs.map((r) => { const st = names[r.site_id] || { name: r.site_id };
        return h("div", { class: "switch-row" }, h("div", null, h("b", { text: st.name }), h("div", { class: "hint", text: st.domain || "No web address yet" })),
          h("div", { class: "btns" }, ...[["Say yes", true, "btn primary sm"], ["No thanks", false, "btn ghost sm"]].map(([l, yes, cls]) => h("button", { class: cls, type: "button", text: l, onclick: async (e) => {
            e.currentTarget.disabled = true;
            try { await q(sb.rpc("answer_coaster_request", { p_id: r.id, p_yes: yes })); toast(yes ? "You're on " + st.name + " now." : "Said no to " + st.name + "."); route(); }
            catch (er) { toast(errText(er), { bad: true }); e.currentTarget.disabled = false; }
          } }))));
      })));
  }

  const PRESS_HOST = CFG.PLATFORM && /^https:/.test(location.origin) ? location.origin : "https://comictable.com";
  const pressLink = (comicId) => PRESS_HOST + "/press/" + encodeURIComponent(comicId);
  const words = (s) => (String(s || "").trim().match(/\S+/g) || []).length;
  function imageSize(file) {
    return new Promise((resolve) => { const img = new Image(), url = URL.createObjectURL(file);
      img.onload = () => { resolve({ width: img.naturalWidth, height: img.naturalHeight }); URL.revokeObjectURL(url); };
      img.onerror = () => { resolve({ width: null, height: null }); URL.revokeObjectURL(url); }; img.src = url; });
  }
  const orientationOf = (d) => !d.width || !d.height ? null : Math.abs(d.width - d.height) / Math.max(d.width, d.height) < 0.06 ? "square" : d.width > d.height ? "landscape" : "portrait";
  const pressPath = (url) => { const m = String(url || "").match(/\/storage\/v1\/object\/public\/press\/(.+?)(?:\?|$)/); return m ? decodeURIComponent(m[1]) : null; };

  // The editor. Mounted on a site's Press kit page, on a comic's Me page, and on a comic's page in Comics.
  function pressKitEditor(comicId) {
    const box = h("div", { class: "stack" }, h("section", { class: "card" }, h("p", { class: "hint", text: "Loading press kit…" })));
    let C = null, P = [];
    const reload = async () => {
      C = (await q(sb.from("comics").select("*").eq("id", comicId)))[0];
      P = await q(sb.from("press_photos").select("*").eq("comic_id", comicId).order("sort", { ascending: true }));
      P.sort((a, b) => (b.is_primary - a.is_primary) || (a.sort - b.sort) || String(a.created_at || "").localeCompare(String(b.created_at || "")));
    };
    async function upload(files) {
      const list = [...files].filter((f) => /^image\/(jpeg|png|webp)$/.test(f.type));
      if (!list.length) return toast("Pick JPG, PNG or WebP photos.", { bad: true });
      const big = list.find((f) => f.size > 25 * 1024 * 1024);
      if (big) return toast(big.name + " is over 25 MB. Export a smaller copy and try again.", { bad: true });
      let n = 0;
      for (const f of list) {
        try {
          toast("Uploading " + (++n) + " of " + list.length + "…");
          const dims = await imageSize(f), stamp = Date.now() + "-" + n, ext = f.type === "image/png" ? "png" : f.type === "image/webp" ? "webp" : "jpg";
          const full = comicId + "/" + stamp + "." + ext, small = comicId + "/" + stamp + "-web.jpg";
          let up = await sb.storage.from("press").upload(full, f, { contentType: f.type, upsert: false });
          if (up.error) throw up.error;
          up = await sb.storage.from("press").upload(small, await squareJpeg(f, 1600, true), { contentType: "image/jpeg", upsert: false });
          if (up.error) throw up.error;
          const url = sb.storage.from("press").getPublicUrl(full).data.publicUrl, web_url = sb.storage.from("press").getPublicUrl(small).data.publicUrl;
          await q(sb.from("press_photos").insert({ comic_id: comicId, url, web_url, width: dims.width, height: dims.height, orientation: orientationOf(dims),
            is_primary: !P.some((p) => p.is_primary), sort: P.reduce((m, p) => Math.max(m, p.sort), -1) + 1 }));
          await reload();
        } catch (e) {
          return toast(/bucket|not found/i.test(errText(e)) ? "Press kits need the latest database upgrade (supabase/UPGRADE_V3_ALL.sql)." : errText(e), { bad: true });
        }
      }
      draw(); toast(list.length === 1 ? "Photo added." : list.length + " photos added.");
    }
    async function makePrimary(p) {
      try { await q(sb.from("press_photos").update({ is_primary: false }).eq("comic_id", comicId).eq("is_primary", true));
        await q(sb.from("press_photos").update({ is_primary: true }).eq("id", p.id)); await reload(); draw(); toast("That's the primary photo now."); }
      catch (e) { toast(errText(e), { bad: true }); }
    }
    async function move(i, j) {
      const a = P[i], b = P[j]; if (!a || !b) return;
      try { await q(sb.from("press_photos").update({ sort: b.sort }).eq("id", a.id)); await q(sb.from("press_photos").update({ sort: a.sort === b.sort ? a.sort + (j > i ? 1 : -1) : a.sort }).eq("id", b.id)); await reload(); draw(); }
      catch (e) { toast(errText(e), { bad: true }); }
    }
    async function remove(p) {
      try {
        await q(sb.from("press_photos").delete().eq("id", p.id));
        const paths = [pressPath(p.url), pressPath(p.web_url)].filter(Boolean);
        if (paths.length) await sb.storage.from("press").remove(paths);
        // keep one primary
        await reload(); if (P.length && !P.some((x) => x.is_primary)) { await q(sb.from("press_photos").update({ is_primary: true }).eq("id", P[0].id)); await reload(); }
        draw(); toast("Photo removed.");
      } catch (e) { toast(errText(e), { bad: true }); }
    }
    function photosCard() {
      const file = h("input", { type: "file", accept: "image/jpeg,image/png,image/webp", multiple: true, "aria-label": "Upload press photos" });
      file.addEventListener("change", () => { if (file.files.length) upload(file.files); });
      const tile = (p, i) => {
        const credit = h("input", { maxlength: "120", placeholder: "Photo: name of photographer", value: p.credit || "", "aria-label": "Photo credit" });
        credit.addEventListener("change", async () => { try { await q(sb.from("press_photos").update({ credit: credit.value.trim() || null }).eq("id", p.id)); p.credit = credit.value.trim(); toast("Credit saved."); } catch (e) { toast(errText(e), { bad: true }); } });
        return h("div", { class: "press-tile" + (p.is_primary ? " primary" : "") },
          h("img", { src: p.web_url || p.url, alt: "" }),
          h("div", { class: "press-meta" },
            h("div", { class: "btns" }, p.is_primary ? h("span", { class: "pill red", text: "Primary" }) : h("button", { class: "btn sm", type: "button", text: "Make primary", onclick: () => makePrimary(p) }),
              p.width ? h("span", { class: "hint", text: p.width + " × " + p.height }) : null),
            credit,
            h("div", { class: "btns" },
              h("button", { class: "btn ghost sm", type: "button", "aria-label": "Move earlier", text: "←", disabled: i === 0, onclick: () => move(i, i - 1) }),
              h("button", { class: "btn ghost sm", type: "button", "aria-label": "Move later", text: "→", disabled: i === P.length - 1, onclick: () => move(i, i + 1) }),
              h("a", { class: "btn ghost sm", href: p.url, target: "_blank", rel: "noopener", text: "Full size ↗" }),
              h("button", { class: "btn ghost sm danger", type: "button", text: "Remove", onclick: () => remove(p) }))));
      };
      return h("section", { class: "card" },
        h("div", { class: "toolbar" }, h("div", null, h("h2", { style: "margin:0", text: "Approved photos" }), h("p", { class: "sub", text: "Full size, the way the photographer sent them. Clubs download these. The primary one is the one to use if they only take one." })),
          h("label", { class: "btn primary file-btn" }, "Upload photos", file)),
        P.length ? h("div", { class: "press-grid" }, P.map(tile))
          : empty("No press photos yet", C && C.photo_url ? "Until you add some, clubs get your profile photo." : "Upload the photos clubs should use."));
    }
    function biosCard() {
      const short = h("textarea", { rows: "3", maxlength: "600", placeholder: "One or two sentences clubs can paste into a listing. About 50 words.", "aria-label": "Short bio" }); short.value = C.short_bio || "";
      const long = h("textarea", { rows: "7", maxlength: "5000", placeholder: "The full version, for programs, press and podcasts.", "aria-label": "Long bio" }); long.value = C.long_bio || "";
      const credits = h("textarea", { rows: "4", maxlength: "2000", placeholder: "One per line, e.g.\nComedy Central\nJust for Laughs New Faces 2025", "aria-label": "Credits" }); credits.value = C.credits || "";
      const booking = h("input", { maxlength: "300", placeholder: "Agent name, booking@…", value: C.booking_contact || "", "aria-label": "Booking contact" });
      const count = (ta, target) => { const n = h("span", { class: "hint" }); const f = () => { const w = words(ta.value); n.textContent = w + " words" + (target && w > target * 1.4 ? " · long for a listing" : ""); }; ta.addEventListener("input", f); f(); return n; };
      const fromBio = C.bio && !C.short_bio && !C.long_bio ? h("button", { class: "btn sm ghost", type: "button", text: "Start from profile bio", onclick: () => {
        const w = C.bio.trim().split(/\s+/); short.value = w.slice(0, 50).join(" ") + (w.length > 50 ? "…" : ""); long.value = C.bio.trim(); short.dispatchEvent(new Event("input")); long.dispatchEvent(new Event("input")); } }) : null;
      return h("form", { class: "card stack", onsubmit: async (e) => {
        e.preventDefault();
        try { await q(sb.from("comics").update({ short_bio: short.value.trim() || null, long_bio: long.value.trim() || null, credits: credits.value.trim() || null, booking_contact: booking.value.trim() || null }).eq("id", comicId));
          await reload(); toast("Saved. It's on the press page now."); }
        catch (err) { toast(/short_bio|column/i.test(errText(err)) ? "Press kits need the latest database upgrade (supabase/UPGRADE_V3_ALL.sql)." : errText(err), { bad: true }); }
      } },
        h("div", { class: "toolbar" }, h("h2", { style: "margin:0", text: "Bio and details" }), fromBio),
        h("div", { class: "grid" },
          h("label", { class: "field c12" }, h("span", { text: "Short bio" }), short, count(short, 50)),
          h("label", { class: "field c12" }, h("span", { text: "Long bio" }), long, count(long)),
          field("Credits", credits, "c6"), h("div", { class: "field c6" }, field("Booking contact", booking), h("p", { class: "hint", text: "Shown on the press page so clubs know who to talk to." }))),
        h("div", { class: "btns" }, h("button", { class: "btn primary", type: "submit", text: "Save" })));
    }
    function draw() {
      const link = pressLink(comicId);
      box.replaceChildren(
        h("section", { class: "card press-share" },
          h("div", null, h("h2", { style: "margin:0", text: "Send this to clubs" }), h("p", { class: "sub", text: "One link with " + (C.name.split(" ")[0]) + "'s approved photos to download, bios to copy, credits and booking contact." }),
            h("code", { class: "press-link", text: link })),
          h("div", { class: "btns" },
            h("button", { class: "btn primary", type: "button", text: "Copy link", onclick: () => (navigator.clipboard ? navigator.clipboard.writeText(link) : Promise.reject()).then(() => toast("Link copied. Paste it into your email to the club."), () => toast("Couldn't copy. Select the link instead.", { bad: true })) }),
            h("a", { class: "btn ghost", href: link, target: "_blank", rel: "noopener", text: "Open ↗" }))),
        photosCard(), biosCard());
    }
    (async () => {
      try { await reload(); if (!C) return box.replaceChildren(empty("Comic not found", "")); draw(); }
      catch (e) { box.replaceChildren(h("section", { class: "card" }, h("p", { class: "err", text: /press_photos/i.test(errText(e)) ? "Press kits need the latest database upgrade: run supabase/UPGRADE_V3_ALL.sql in Supabase." : errText(e) }))); }
    })();
    return box;
  }

  // Site page: the press kit for each comic on this site
  let PRESSFOR = null;
  function viewPress(main) {
    const people = S.hosts.filter((x) => x.comic_id);
    main.append(head("Press kit", "Approved photos and bios for clubs, per comic. A comic's press kit is the same on every site they're on."));
    if (!people.length) { main.append(h("section", { class: "card" }, empty("No comics on this site yet", "Add someone in Lineup first."))); return; }
    if (!people.some((x) => x.id === PRESSFOR)) PRESSFOR = (people.find((x) => S.me && x.comic_id === S.me.id) || people[0]).id;
    const cur = people.find((x) => x.id === PRESSFOR);
    if (people.length > 1) main.append(h("div", { class: "seg", role: "group", "aria-label": "Comic", style: "margin-bottom:16px" },
      people.map((x) => h("button", { type: "button", "aria-pressed": String(x.id === PRESSFOR), text: x.name, onclick: () => { PRESSFOR = x.id; route(); } }))));
    main.append(pressKitEditor(cur.comic_id));
  }

