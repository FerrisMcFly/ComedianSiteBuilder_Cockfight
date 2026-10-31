  /* ======================================================
     MODERATION
     ====================================================== */
  async function viewModeration(main) {
    main.append(head("Moderation", "House rules for your forum and chat, the ban list, and a record of every moderator action."));
    const c = C();
    const wrap = h("div", { class: "stack" }); main.append(wrap);
    const forumOpen = h("input", { type: "checkbox", role: "switch", checked: c.forum_open, "aria-label": "Forum open" });
    const reserve = h("input", { type: "checkbox", role: "switch", checked: c.reserve_names, "aria-label": "Reserve host names" });
    const linksFrom = h("select", { "aria-label": "Links from", style: "width:auto" }, [["nobody", "Nobody (safest)"], ["approved", "Approved fans only"], ["everyone", "Everyone"]].map(([v, l]) => h("option", { value: v, text: l, selected: (c.links_from || "nobody") === v })));
    const holdFirst = h("input", { type: "checkbox", role: "switch", checked: !!c.hold_first_posts, "aria-label": "Hold first posts" });
    const slow = h("select", { "aria-label": "Forum slow mode", style: "width:auto" }, [[0, "Off"], [10, "10 seconds"], [20, "20 seconds"], [30, "30 seconds"], [60, "1 minute"], [300, "5 minutes"]].map(([v, l]) => h("option", { value: v, text: l, selected: Number(c.slow_mode_seconds) === v })));
    const words = h("textarea", { value: (c.banned_words || []).join("\n"), placeholder: "One word or phrase per line", "aria-label": "Banned words", style: "min-height:110px" });
    const save = h("button", { class: "btn primary", type: "submit", text: "Save house rules" });
    wrap.append(h("form", { class: "card", onsubmit: async (e) => {
      e.preventDefault(); save.disabled = true;
      const list = [...new Set(words.value.split(/\n+/).map((w) => w.trim()).filter(Boolean))];
      try { await saveSite({ community: Object.assign(C(), { forum_open: forumOpen.checked, reserve_names: reserve.checked, slow_mode_seconds: Number(slow.value), banned_words: list, links_from: linksFrom.value, hold_first_posts: holdFirst.checked }) }, "House rules saved."); logMod("update house rules"); }
      catch (err) { toast(errText(err), { bad: true }); }
      save.disabled = false;
    } }, h("h2", { text: "House rules" }), h("div", { class: "switches" },
      h("div", { class: "switch-row" }, h("div", null, h("b", { text: "Forum open for posting" }), h("div", { class: "hint", text: "Turn off to freeze the forum. Fans can still read." })), h("label", { class: "switch" }, forumOpen, h("span"))),
      h("div", { class: "switch-row" }, h("div", null, h("b", { text: "Protect host names" }), h("div", { class: "hint", text: "Fans can't post as " + (S.hosts.map((x) => x.name.split(" ")[0]).join(", ") || "your hosts") + ", “admin” or “mod”." })), h("label", { class: "switch" }, reserve, h("span"))),
      h("div", { class: "switch-row" }, h("div", null, h("b", { text: "Forum slow mode" }), h("div", { class: "hint", text: "How long a fan waits between forum posts. Fans also get at most 20 posts and 60 chat messages an hour." })), slow),
      h("div", { class: "switch-row" }, h("div", null, h("b", { text: "Links from" }), h("div", { class: "hint", text: "Who can post links in the forum and chat. Spam is mostly links, so Nobody is the default. Approved fans are the ones whose posts you approved." })), linksFrom),
      h("div", { class: "switch-row" }, h("div", null, h("b", { text: "Hold first posts" }), h("div", { class: "hint", text: "A fan's first post waits for you to approve it below. Approve once and they post freely after that." })), h("label", { class: "switch" }, holdFirst, h("span")))),
      field("Banned words (posts containing these are blocked, in the forum and the chat)", words), h("div", { class: "btns", style: "margin-top:10px" }, save)));

    // Waiting for a moderator: first posts being held, and anything fans reported (hidden until you decide)
    const queueCard = h("section", { class: "card" }); wrap.prepend(queueCard);
    async function drawQueue() {
      let items = [], reports = [];
      try {
        const [t, p, m] = await Promise.all([
          q(sb.from("threads").select("*").eq("site_id", sid()).eq("held", true)),
          q(sb.from("posts").select("*").eq("site_id", sid()).eq("held", true)),
          q(sb.from("chat_messages").select("*").eq("site_id", sid()).eq("held", true).eq("deleted", false))]);
        items = [...t.map((x) => ({ kind: "thread", table: "threads", row: x, text: x.title, where: "New topic" })),
          ...p.map((x) => ({ kind: "post", table: "posts", row: x, text: x.body, where: "Forum reply" })),
          ...m.map((x) => ({ kind: "chat", table: "chat_messages", row: x, text: x.body, where: "Chat" }))];
        try { reports = await q(sb.from("reports").select("*").eq("site_id", sid()).eq("status", "open")); } catch (e) {}
      } catch (e) { queueCard.replaceChildren(h("h2", { text: "Waiting for you" }), h("p", { class: "hint", text: /held|column/.test(errText(e)) ? "Reports and held posts need the latest database upgrade (supabase/24_safety.sql)." : errText(e) })); return; }
      const why = (it) => reports.filter((r) => r.kind === it.kind && r.item_id === String(it.row.id));
      const decide = async (it, keep) => {
        const rep = why(it);
        try {
          if (keep) {
            await q(sb.from(it.table).update({ held: false, reviewed: rep.length > 0 }).eq("id", it.row.id));
            if (it.kind === "thread") await q(sb.from("posts").update({ held: false }).eq("thread_id", it.row.id));
            if (!rep.length) await q(sb.from("trusted").insert({ site_id: sid(), author: it.row.author, device: it.row.device || null }));  // approving a first post approves the fan
          } else if (it.kind === "chat") await q(sb.from("chat_messages").update({ deleted: true }).eq("id", it.row.id));
          else await q(sb.from(it.table).delete().eq("id", it.row.id));
          if (rep.length) await q(sb.from("reports").update({ status: keep ? "kept" : "removed" }).in("id", rep.map((r) => r.id)));
          logMod(keep ? (rep.length ? "keep reported" : "approve") : "remove", it.row.author + ": " + String(it.text).slice(0, 60));
          toast(keep ? (rep.length ? "Kept. It's back up." : "Approved. " + it.row.author + " posts freely now.") : "Removed."); drawQueue();
        } catch (e) { toast(errText(e), { bad: true }); }
      };
      queueCard.replaceChildren(h("h2", { text: "Waiting for you (" + items.length + ")" }),
        items.length ? h("div", null, items.map((it) => { const r = why(it);
          return h("div", { class: "switch-row", style: "flex-wrap:wrap" },
            h("div", { style: "min-width:0;flex:1 1 300px" }, h("div", { class: "btns" }, h("span", { class: r.length ? "pill red" : "pill", text: r.length ? "Reported" + (r.length > 1 ? " ×" + r.length : "") : "First post" }), h("span", { class: "pill", text: it.where })),
              h("div", { style: "margin-top:4px" }, h("b", { text: it.row.author }), " · ", h("span", { class: "wrap-any", text: String(it.text).slice(0, 300) })),
              r.some((x) => x.reason) ? h("div", { class: "hint", text: "Why: " + r.map((x) => x.reason).filter(Boolean).join(" · ") }) : null),
            h("div", { class: "btns" }, h("button", { class: "btn primary sm", type: "button", text: r.length ? "Keep it" : "Approve", onclick: () => decide(it, true) }),
              h("button", { class: "btn ghost sm danger", type: "button", text: "Remove", onclick: () => decide(it, false) })));
        })) : empty("All clear", "Reported posts and held first posts show up here."));
    }
    drawQueue();

    const bansCard = h("section", { class: "card" }); wrap.append(bansCard);
    async function drawBans() {
      let bans; try { bans = await q(sb.from("bans").select("*").eq("site_id", sid()).order("created_at", { ascending: false })); } catch (e) { bansCard.replaceChildren(h("p", { class: "err", text: errText(e) })); return; }
      const now = Date.now();
      const active = bans.filter((b) => !b.until || Date.parse(b.until) > now);
      const addBox = h("div");
      bansCard.replaceChildren(h("h2", { text: "Banned (" + active.length + ")" }),
        active.length ? h("div", null, active.map((b) => h("div", { class: "switch-row" },
          h("div", null, h("b", { text: b.author || "A device" }), h("div", { class: "hint", text: (b.until ? "Until " + new Date(b.until).toLocaleDateString() : "Forever") + (b.device ? " · device banned too" : "") + (b.reason ? " · " + b.reason : "") })),
          h("button", { class: "btn sm", type: "button", text: "Unban", onclick: async () => { try { await q(sb.from("bans").delete().eq("id", b.id)); logMod("unban", b.author || "device"); toast("Unbanned."); drawBans(); } catch (e) { toast(errText(e), { bad: true }); } } }))))
          : empty("Nobody's banned", "Ban someone from any forum post or chat message, or right here."),
        addBox, h("div", { class: "btns", style: "margin-top:10px" }, h("button", { class: "btn", type: "button", text: "+ Ban a username", onclick: () => addBox.replaceChildren(banForm({}, (ok) => { addBox.replaceChildren(); if (ok) drawBans(); })) })));
    }
    drawBans();

    const logCard = h("section", { class: "card" }); wrap.append(logCard);
    try {
      const log = await q(sb.from("mod_log").select("*").eq("site_id", sid()).order("created_at", { ascending: false }).limit(100));
      logCard.replaceChildren(h("h2", { text: "Moderator log" }), log.length ? h("div", null, log.map((l) => h("div", { class: "switch-row" }, h("span", null, h("b", { text: l.action }), l.detail ? " · " + l.detail : ""), h("span", { class: "hint nowrap", text: ago(l.created_at) }))))
        : empty("Nothing yet", "Every pin, lock, delete and ban shows up here."));
    } catch (e) { logCard.replaceChildren(h("p", { class: "err", text: errText(e) })); }
  }

