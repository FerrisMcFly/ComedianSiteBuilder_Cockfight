  /* ======================================================
     FORUM
     ====================================================== */
  const FORUM = { tab: "topics", board: "all", q: "", open: null, boards: [] };
  async function viewForum(main) {
    main.append(head("Forum", "Run your message boards: pin and lock topics, move them, edit or delete posts, and ban trolls."));
    const top = h("div", { class: "toolbar" }); const body = h("div", { class: "stack" });
    main.append(top, body);
    const loadBoards = async () => { FORUM.boards = await q(sb.from("boards").select("*").eq("site_id", sid()).order("sort", { ascending: true })); };
    try { await loadBoards(); } catch (e) { body.append(h("p", { class: "err", text: errText(e) })); return; }
    const c = C();
    const drawTop = () => top.replaceChildren(tabs([["topics", "Topics"], ["boards", "Boards"]], FORUM.tab, (t) => { FORUM.tab = t; drawTop(); draw(); }),
      h("span", { class: c.forum_open ? "pill ok" : "pill red", text: c.forum_open ? "Open for posting" : "Closed for posting" }));
    drawTop();
    const boardName = (id) => (FORUM.boards.find((b) => b.id === id) || {}).name || id;
    async function draw() { body.replaceChildren(h("p", { class: "hint", text: "Loading…" })); FORUM.tab === "boards" ? drawBoards() : drawTopics(); }

    async function drawTopics() {
      let threads;
      try { threads = await q(sb.from("threads").select("*").eq("site_id", sid()).order("last_at", { ascending: false }).limit(300)); } catch (e) { body.replaceChildren(h("p", { class: "err", text: errText(e) })); return; }
      const filter = h("select", { "aria-label": "Board", style: "width:auto", onchange: (e) => { FORUM.board = e.target.value; drawTopics(); } },
        h("option", { value: "all", text: "All boards" }), FORUM.boards.map((b) => h("option", { value: b.id, text: b.name, selected: FORUM.board === b.id })));
      const search = h("input", { type: "search", class: "search", placeholder: "Search topics or names", value: FORUM.q, "aria-label": "Search topics" });
      const listBox = h("div");
      const drawList = () => {
        const s = FORUM.q.toLowerCase();
        const rows = threads.filter((t) => (FORUM.board === "all" || t.board === FORUM.board) && (!s || (t.title + " " + t.author).toLowerCase().includes(s)))
          .sort((a, b) => (!!b.pinned - !!a.pinned) || (Number(b.last_at) - Number(a.last_at)));
        listBox.replaceChildren(...(rows.length ? rows.map(topicRow) : [empty(threads.length ? "Nothing matches" : "No topics yet", threads.length ? "" : "Start one below, or wait for fans to.")]));
      };
      search.addEventListener("input", () => { FORUM.q = search.value; drawList(); });
      drawList();
      body.replaceChildren(h("section", { class: "card" }, h("div", { class: "toolbar" }, h("div", { class: "btns" }, filter, search), h("span", { class: "hint", text: threads.length + " topics" })), listBox), hostTopicForm());
    }

    function topicRow(t) {
      const move = h("select", { "aria-label": "Move to board", style: "width:auto;min-height:32px;padding:4px 8px;font-size:13px", onchange: async (e) => {
        try { await q(sb.from("threads").update({ board: e.target.value }).eq("id", t.id)); logMod("move topic", "“" + t.title + "” to " + boardName(e.target.value)); toast("Moved to " + boardName(e.target.value) + "."); t.board = e.target.value; }
        catch (err) { toast(errText(err), { bad: true }); }
      } }, FORUM.boards.map((b) => h("option", { value: b.id, text: "Move: " + b.name, selected: b.id === t.board })));
      const postsBox = h("div", { class: "stack", style: "gap:8px;margin-top:8px", hidden: FORUM.open !== t.id });
      const flip = (field, onMsg, offMsg) => async () => {
        try { await q(sb.from("threads").update({ [field]: !t[field] }).eq("id", t.id)); t[field] = !t[field]; logMod((t[field] ? "" : "un") + (field === "pinned" ? "pin" : "lock"), "“" + t.title + "”"); toast(t[field] ? onMsg : offMsg); drawTopics(); }
        catch (e) { toast(errText(e), { bad: true }); }
      };
      const row = h("div", { class: "thread" },
        h("div", { class: "thread-head", style: "flex-wrap:wrap" },
          h("div", { style: "min-width:0;flex:1 1 280px" },
            h("div", { class: "btns", style: "gap:6px" }, t.pinned ? h("span", { class: "pill red", text: "Pinned" }) : null, t.locked ? h("span", { class: "pill", text: "Locked" }) : null, t.is_mod ? h("span", { class: "pill ok", text: "Host" }) : null,
              h("b", { class: "wrap-any", text: t.title })),
            h("div", { class: "hint", text: boardName(t.board) + " · by " + t.author + " · " + (t.replies || 0) + " repl" + (t.replies === 1 ? "y" : "ies") + " · last post " + ago(t.last_at) + (t.last_by ? " by " + t.last_by : "") })),
          h("div", { class: "btns" },
            h("button", { class: "btn ghost sm", type: "button", text: FORUM.open === t.id ? "Hide posts" : "Posts", onclick: () => { FORUM.open = FORUM.open === t.id ? null : t.id; drawTopics(); } }),
            h("button", { class: "btn ghost sm", type: "button", text: t.pinned ? "Unpin" : "Pin", onclick: flip("pinned", "Pinned to the top.", "Unpinned.") }),
            h("button", { class: "btn ghost sm", type: "button", text: t.locked ? "Unlock" : "Lock", onclick: flip("locked", "Locked. No new replies.", "Unlocked.") }),
            move,
            sure("Delete", async () => { try { await q(sb.from("threads").delete().eq("id", t.id)); logMod("delete topic", "“" + t.title + "” by " + t.author); toast("Topic deleted."); drawTopics(); } catch (e) { toast(errText(e), { bad: true }); } }))),
        postsBox);
      if (FORUM.open === t.id) loadPosts(t, postsBox);
      return row;
    }

    async function loadPosts(t, box) {
      box.replaceChildren(h("span", { class: "hint", text: "Loading posts…" }));
      let ps; try { ps = await q(sb.from("posts").select("*").eq("thread_id", t.id).order("created_at", { ascending: true })); } catch (e) { box.replaceChildren(h("p", { class: "err", text: errText(e) })); return; }
      box.replaceChildren(...ps.map((p) => {
        const card = h("div", { class: "post", style: "flex-wrap:wrap" });
        const show = () => card.replaceChildren(
          h("div", { style: "min-width:0;flex:1 1 300px" }, h("b", { text: p.author }), p.is_mod ? h("span", { class: "pill ok", style: "margin-left:6px", text: "Host" }) : null,
            h("span", { class: "hint", text: " · " + ago(p.created_at) + (p.edited_at ? " · edited" : "") }), h("p", { text: p.body })),
          h("div", { class: "btns" },
            h("button", { class: "btn ghost sm", type: "button", text: "Edit", onclick: edit }),
            p.is_mod ? null : h("button", { class: "btn ghost sm", type: "button", text: "Ban", onclick: () => card.replaceChildren(banForm({ author: p.author, device: p.device }, () => show())) }),
            sure("Delete", async () => { try { await q(sb.from("posts").delete().eq("id", p.id)); logMod("delete post", "by " + p.author + " in “" + t.title + "”"); toast("Post deleted."); loadPosts(t, box); } catch (e) { toast(errText(e), { bad: true }); } })));
        const edit = () => {
          const ta = h("textarea", { value: p.body, "aria-label": "Post text" });
          card.replaceChildren(h("div", { class: "stack", style: "flex:1 1 100%;gap:8px" }, ta, h("div", { class: "btns" },
            h("button", { class: "btn primary sm", type: "button", text: "Save edit", onclick: async () => {
              const v = ta.value.trim(); if (!v) { ta.classList.add("bad"); return; }
              try { await q(sb.from("posts").update({ body: v, edited_at: new Date().toISOString() }).eq("id", p.id)); logMod("edit post", "by " + p.author + " in “" + t.title + "”"); p.body = v; p.edited_at = new Date().toISOString(); show(); toast("Edited."); }
              catch (e) { toast(errText(e), { bad: true }); }
            } }), h("button", { class: "btn ghost sm", type: "button", text: "Cancel", onclick: show }))));
          ta.focus();
        };
        show(); return card;
      }), replyAsHost(t, box));
    }

    function hostPicker() {
      return h("select", { "aria-label": "Post as", style: "width:auto" }, S.hosts.map((x) => h("option", { value: x.name, text: x.name })), h("option", { value: S.site.name, text: S.site.name + " (the show)" }));
    }
    function replyAsHost(t, box) {
      const who = hostPicker(), ta = h("textarea", { placeholder: "Reply as a host. It gets a Host badge.", "aria-label": "Host reply", style: "min-height:70px" });
      return h("div", { class: "newclub stack", style: "gap:8px" }, h("div", { class: "btns" }, h("b", { text: "Reply as" }), who), ta,
        h("div", { class: "btns" }, h("button", { class: "btn primary sm", type: "button", text: "Post reply", onclick: async () => {
          const v = ta.value.trim(); if (!v) { ta.classList.add("bad"); return; }
          try { await q(sb.from("posts").insert({ site_id: sid(), thread_id: t.id, author: who.value, body: v, created_at: Date.now(), is_mod: true })); toast("Replied as " + who.value + "."); loadPosts(t, box); }
          catch (e) { toast(errText(e), { bad: true }); }
        } })));
    }
    function hostTopicForm() {
      const who = hostPicker();
      const board = h("select", { "aria-label": "Board", style: "width:auto" }, FORUM.boards.map((b) => h("option", { value: b.id, text: b.name })));
      const title = h("input", { placeholder: "Topic title", maxlength: "90", "aria-label": "Topic title" }), ta = h("textarea", { placeholder: "First post", "aria-label": "First post" });
      const pin = h("input", { type: "checkbox", checked: true });
      return h("details", { class: "card" }, h("summary", { style: "cursor:pointer;font-weight:700;font-family:var(--display);font-size:18px", text: "Start a topic as a host" }),
        h("div", { class: "stack", style: "margin-top:12px" }, h("div", { class: "btns" }, field("Post as", who), field("Board", board)), field("Title", title), field("Post", ta),
          h("label", { class: "check" }, pin, "Pin it to the top"),
          h("div", { class: "btns" }, h("button", { class: "btn primary", type: "button", text: "Post topic", onclick: async () => {
            if (!title.value.trim()) { title.classList.add("bad"); title.focus(); return; }
            if (!ta.value.trim()) { ta.classList.add("bad"); ta.focus(); return; }
            const now = Date.now();
            try {
              const th = await q(sb.from("threads").insert({ site_id: sid(), board: board.value, title: title.value.trim(), author: who.value, created_at: now, last_at: now, last_by: who.value, replies: 0, pinned: pin.checked, is_mod: true }).select().single());
              await q(sb.from("posts").insert({ site_id: sid(), thread_id: th.id, author: who.value, body: ta.value.trim(), created_at: now, is_mod: true }));
              toast("Topic posted."); FORUM.open = th.id; drawTopics();
            } catch (e) { toast(errText(e), { bad: true }); }
          } }))));
    }

    function drawBoards() {
      const B = FORUM.boards;
      const rows = B.map((b, i) => {
        const nm = h("input", { value: b.name, "aria-label": "Board name" }), ds = h("input", { value: b.description || "", placeholder: "What goes here", "aria-label": "Board description" });
        return h("div", { class: "switch-row", style: "flex-wrap:wrap;align-items:start", "data-drag": b.id }, grip(b.name),
          h("div", { class: "grid", style: "flex:1 1 360px" }, field("Name", nm, "c5"), field("Description", ds, "c7")),
          h("div", { class: "btns", style: "padding-top:22px" },
            h("button", { class: "btn ghost sm", type: "button", text: b.locked ? "Locked" : "Lock", title: "Locked boards: only hosts can start topics", onclick: () => upd(b, { locked: !b.locked }, b.locked ? "Unlocked " + b.name + "." : "Locked " + b.name + ". Only hosts can start topics there.") }),
            h("button", { class: "btn ghost sm", type: "button", text: b.hidden ? "Hidden" : "Hide", onclick: () => upd(b, { hidden: !b.hidden }, b.hidden ? b.name + " is visible again." : b.name + " is hidden from fans.") }),
            h("button", { class: "btn sm", type: "button", text: "Save", onclick: () => { if (!nm.value.trim()) { nm.classList.add("bad"); return; } upd(b, { name: nm.value.trim(), description: ds.value.trim() || null }, "Saved."); } }),
            B.length > 1 ? h("button", { class: "btn ghost sm danger", type: "button", text: "Delete", onclick: (e) => deleteBoard(b, e.currentTarget.closest(".switch-row")) }) : null));
      });
      const nm = h("input", { placeholder: "Merch Talk", "aria-label": "New board name" }), ds = h("input", { placeholder: "Show off your gear", "aria-label": "New board description" });
      body.replaceChildren(h("section", { class: "card" }, h("h2", { text: "Boards" }), h("p", { class: "sub", text: "Boards appear on your forum in this order. Drag to change it." }),
          sortable(h("div", null, rows), async (from, to) => { await resort("boards", FORUM.boards, from, to, (q0, r) => q0.eq("site_id", sid()).eq("id", r.id)); await loadBoards(); drawBoards(); })),
        h("section", { class: "card stack" }, h("h2", { text: "Add a board" }), h("div", { class: "grid" }, field("Name", nm, "c5"), field("Description", ds, "c7")),
          h("div", { class: "btns" }, h("button", { class: "btn primary", type: "button", text: "Add board", onclick: async () => {
            if (!nm.value.trim()) { nm.classList.add("bad"); nm.focus(); return; }
            let id = slug(nm.value); while (B.some((b) => b.id === id)) id += "-2";
            try { await q(sb.from("boards").insert({ site_id: sid(), id, name: nm.value.trim(), description: ds.value.trim() || null, sort: B.length })); logMod("add board", nm.value.trim()); await loadBoards(); drawBoards(); toast("Board added."); }
            catch (e) { toast(errText(e), { bad: true }); }
          } }))));
    }
    async function upd(b, patch, msg) { try { await q(sb.from("boards").update(patch).eq("site_id", sid()).eq("id", b.id)); logMod("edit board", b.name); await loadBoards(); drawBoards(); toast(msg); } catch (e) { toast(errText(e), { bad: true }); } }
    async function deleteBoard(b, rowEl) {
      let count = 0;
      try { count = (await q(sb.from("threads").select("id").eq("site_id", sid()).eq("board", b.id))).length; } catch (e) {}
      const others = FORUM.boards.filter((x) => x.id !== b.id);
      const dest = h("select", { "aria-label": "Move topics to", style: "width:auto" }, others.map((x) => h("option", { value: x.id, text: x.name })));
      rowEl.replaceWith(h("div", { class: "newclub stack", style: "gap:8px;margin:8px 0" }, h("b", { text: "Delete “" + b.name + "”?" }),
        count ? h("div", { class: "btns" }, h("span", { text: "Move its " + count + " topic" + (count > 1 ? "s" : "") + " to" }), dest) : h("span", { class: "hint", text: "It has no topics." }),
        h("div", { class: "btns" }, h("button", { class: "btn primary sm", type: "button", text: "Delete board", onclick: async () => {
          try { if (count) await q(sb.from("threads").update({ board: dest.value }).eq("site_id", sid()).eq("board", b.id));
            await q(sb.from("boards").delete().eq("site_id", sid()).eq("id", b.id)); logMod("delete board", b.name + (count ? " (topics moved)" : "")); await loadBoards(); drawBoards(); toast("Board deleted."); }
          catch (e) { toast(errText(e), { bad: true }); }
        } }), h("button", { class: "btn ghost sm", type: "button", text: "Cancel", onclick: drawBoards }))));
    }
    draw();
  }

