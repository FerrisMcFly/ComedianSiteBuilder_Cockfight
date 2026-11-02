  /* ======================================================
     CHAT
     ====================================================== */
  let chatSub = null;
  window.addEventListener("hashchange", () => { if (chatSub && location.hash.slice(1) !== "chat") { chatSub(); chatSub = null; } });
  async function viewChat(main) {
    const c = C();
    main.append(head("Chat room", "A live chat for your fans. Watch it here, jump in as a host, and clean up anything that shouldn't be there."));
    const openBox = h("input", { type: "checkbox", role: "switch", checked: c.chat_open, "aria-label": "Chat open" });
    openBox.addEventListener("change", async () => {
      try { await saveSite({ community: Object.assign(C(), { chat_open: openBox.checked }) }, openBox.checked ? "The chat is open." : "The chat is closed. Fans can read it but not post."); logMod(openBox.checked ? "open chat" : "close chat"); }
      catch (e) { openBox.checked = !openBox.checked; toast(errText(e), { bad: true }); }
    });
    const slow = h("select", { "aria-label": "Slow mode", style: "width:auto", onchange: async (e) => {
      try { await saveSite({ community: Object.assign(C(), { chat_slow_seconds: Number(e.target.value) }) }, Number(e.target.value) ? "Slow mode: one message every " + e.target.value + " seconds." : "Slow mode off."); } catch (err) { toast(errText(err), { bad: true }); }
    } }, [[0, "Off"], [3, "3 seconds"], [5, "5 seconds"], [10, "10 seconds"], [30, "30 seconds"], [60, "1 minute"]].map(([v, l]) => h("option", { value: v, text: l, selected: Number(c.chat_slow_seconds) === v })));
    const feed = h("div", { class: "chatfeed", "aria-live": "polite" });
    const who = h("select", { "aria-label": "Chat as", style: "width:auto" }, S.hosts.map((x) => h("option", { value: x.name, text: x.name })), h("option", { value: S.site.name, text: S.site.name }));
    const say = h("input", { maxlength: "500", placeholder: "Say something as a host…", "aria-label": "Message" });
    const sendForm = h("form", { class: "btns", style: "margin-top:10px", onsubmit: async (e) => {
      e.preventDefault(); const v = say.value.trim(); if (!v) return;
      try { await q(sb.from("chat_messages").insert({ site_id: sid(), author: who.value, body: v, is_mod: true })); say.value = ""; refresh(); } catch (err) { toast(errText(err), { bad: true }); }
    } }, who, h("div", { style: "flex:1 1 220px" }, say), h("button", { class: "btn primary", type: "submit", text: "Send" }));
    main.append(h("div", { class: "stack" },
      h("section", { class: "card" }, h("div", { class: "switches" },
        h("div", { class: "switch-row" }, h("div", null, h("b", { text: "Chat is open" }), h("div", { class: "hint", text: "When it's closed, fans can still read but can't post." })), h("label", { class: "switch" }, openBox, h("span"))),
        h("div", { class: "switch-row" }, h("div", null, h("b", { text: "Slow mode" }), h("div", { class: "hint", text: "How long each fan has to wait between messages." })), slow),
        h("div", { class: "switch-row" }, h("div", null, h("b", { text: "Clear the chat" }), h("div", { class: "hint", text: "Hides every message currently in the room." })),
          sure("Clear chat", async () => { try { await q(sb.from("chat_messages").update({ deleted: true }).eq("site_id", sid()).eq("deleted", false)); logMod("clear chat"); toast("Chat cleared."); refresh(); } catch (e) { toast(errText(e), { bad: true }); } }, "danger")))),
      h("section", { class: "card" }, h("h2", { text: "Live" }), feed, sendForm)));
    let msgs = [];
    function render() {
      const atBottom = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 40;
      feed.replaceChildren(...(msgs.length ? msgs.map((m) => {
        const row = h("div", { class: "chatline" + (m.deleted ? " gone" : "") },
          h("div", { style: "min-width:0" }, h("b", { text: m.author }), m.is_mod ? h("span", { class: "pill ok", style: "margin-left:6px", text: "Host" }) : null, h("span", { class: "hint", text: "  " + ago(m.created_at) + (m.deleted ? " · deleted" : "") }), h("div", { class: "wrap-any", text: m.body })),
          m.deleted ? null : h("div", { class: "btns" },
            m.is_mod ? null : h("button", { class: "btn ghost sm", type: "button", text: "Ban", onclick: () => row.replaceWith(banForm({ author: m.author, device: m.device }, () => render())) }),
            h("button", { class: "btn ghost sm danger", type: "button", text: "Delete", onclick: async () => { try { await q(sb.from("chat_messages").update({ deleted: true }).eq("id", m.id)); logMod("delete chat message", "by " + m.author); m.deleted = true; render(); } catch (e) { toast(errText(e), { bad: true }); } } })));
        return row;
      }) : [empty("It's quiet in here", "Messages show up live as fans post.")]));
      if (atBottom) feed.scrollTop = feed.scrollHeight;
    }
    async function refresh() {
      try { msgs = (await q(sb.from("chat_messages").select("*").eq("site_id", sid()).order("created_at", { ascending: false }).limit(150))).reverse(); render(); }
      catch (e) { feed.replaceChildren(h("p", { class: "err", text: errText(e) })); }
    }
    await refresh(); feed.scrollTop = feed.scrollHeight;
    if (chatSub) chatSub();
    let channel = null, timer = setInterval(refresh, 8000);
    try { channel = sb.channel && sb.channel("admin-chat-" + sid()).on("postgres_changes", { event: "*", schema: "public", table: "chat_messages", filter: "site_id=eq." + sid() }, () => refresh()).subscribe(); } catch (e) {}
    chatSub = () => { clearInterval(timer); try { channel && channel.unsubscribe(); } catch (e) {} };
  }

