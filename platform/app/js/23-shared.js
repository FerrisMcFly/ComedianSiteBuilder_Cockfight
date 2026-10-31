  /* ======================================================
     SHARED BITS FOR SITE + COMMUNITY SECTIONS
     ====================================================== */
  const C = () => Object.assign({ forum_open: true, chat_open: true, slow_mode_seconds: 20, chat_slow_seconds: 3, banned_words: [], reserve_names: true }, S.site.community || {});
  async function saveSite(patch, msg) {
    await q(sb.from("sites").update(patch).eq("id", sid()));
    Object.assign(S.site, patch);
    if (msg) toast(msg);
  }
  function logMod(action, detail) { sb.from("mod_log").insert({ site_id: sid(), action, detail: detail || null }).then(() => {}, () => {}); }
  function ago(t) {
    const ms = typeof t === "number" || /^\d+$/.test(String(t)) ? Number(t) : Date.parse(t);
    const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
    if (s < 60) return "just now"; if (s < 3600) return Math.floor(s / 60) + "m ago"; if (s < 86400) return Math.floor(s / 3600) + "h ago";
    const d = new Date(ms); return MON[d.getMonth()] + " " + d.getDate();
  }
  const sure = (label, fn, cls) => { const b = h("button", { class: "btn sm " + (cls || "ghost danger"), type: "button", text: label, onclick: () => { if (b.dataset.sure) { delete b.dataset.sure; b.textContent = label; return fn(b); } b.dataset.sure = "1"; b.textContent = "Sure?"; setTimeout(() => { if (b.dataset.sure) { delete b.dataset.sure; b.textContent = label; } }, 3000); } }); return b; };
  const tabs = (items, cur, onPick) => h("div", { class: "seg", role: "tablist" }, items.map(([id, label]) => h("button", { type: "button", role: "tab", "aria-pressed": String(cur === id), "aria-selected": String(cur === id), text: label, onclick: () => onPick(id) })));
  const slug = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "board";
  let THEME = null, THEME_FOR = null;
  async function loadTheme() {
    if (THEME !== null && THEME_FOR === sid()) return THEME;
    THEME_FOR = sid();
    // The dashboard (comictable.com) keeps every site's theme.json in themes/
    // a site on a template uses that template's settings (sites/<template>/theme.json); a custom site has its own
    const th = (S.site && S.site.theme) || {};
    const tries = [th.design, th.way === "template" ? th.template : null, sid()].filter((x) => x && /^[a-z0-9][a-z0-9_-]*$/.test(x)).map((x) => "themes/" + x + ".json");
    THEME = false;
    for (const u of tries) { try { const r = await fetch(u, { cache: "no-store" }); if (r.ok) { THEME = await r.json(); break; } } catch (e) {} }
    return THEME;
  }
  // Ban form used from forum posts, chat messages and the moderation page
  function banForm(prefill, onDone) {
    const nameIn = h("input", { value: prefill.author || "", placeholder: "Username", "aria-label": "Username to ban" });
    const byDevice = h("input", { type: "checkbox", checked: !!prefill.device, disabled: !prefill.device });
    const len = h("select", { "aria-label": "How long" }, [["1", "1 day"], ["7", "1 week"], ["30", "30 days"], ["0", "Forever"]].map(([v, l]) => h("option", { value: v, text: l, selected: v === "7" })));
    const reason = h("input", { placeholder: "Reason (only admins see this)", "aria-label": "Reason" });
    const msg = h("div", { class: "err" });
    return h("div", { class: "newclub stack", style: "gap:10px" }, h("b", { text: "Ban " + (prefill.author || "someone") }),
      h("div", { class: "grid" }, field("Username", nameIn, "c4"), field("For", len, "c3"), field("Reason", reason, "c5")),
      prefill.device ? h("label", { class: "check" }, byDevice, "Also ban their device, so a new username won't get around it") : null,
      msg, h("div", { class: "btns" },
        h("button", { class: "btn primary sm", type: "button", text: "Ban", onclick: async () => {
          const author = nameIn.value.trim(); if (!author && !(byDevice.checked && prefill.device)) { nameIn.classList.add("bad"); return; }
          const days = Number(len.value);
          const row = { site_id: sid(), author: author || null, device: byDevice.checked ? prefill.device : null, reason: reason.value.trim() || null, until: days ? new Date(Date.now() + days * 864e5).toISOString() : null };
          try { await q(sb.from("bans").insert(row)); logMod("ban", (author || "device") + (days ? " for " + len.selectedOptions[0].text : " forever")); toast("Banned " + (author || "that device") + "."); onDone && onDone(true); }
          catch (e) { msg.textContent = errText(e); }
        } }),
        h("button", { class: "btn ghost sm", type: "button", text: "Cancel", onclick: () => onDone && onDone(false) })));
  }

