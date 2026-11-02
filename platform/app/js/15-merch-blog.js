  /* ======================================================
     MERCH
     ====================================================== */
  async function uploadImage(file, prefix, opts = {}) {
    const blob = await squareJpeg(file, opts.square === false ? 1600 : 900, opts.square === false);
    // a site's photos go in its folder; a Coaster's (no site open, or a Coaster you help with) in the comic's
    const path = (opts.folder || sid() || (S.me && S.me.id) || "misc") + "/" + prefix + "-" + Date.now() + ".jpg";
    // Every upload gets a new name, so it never needs to overwrite (overwriting needs extra database permissions).
    const up = await sb.storage.from("photos").upload(path, blob, { contentType: "image/jpeg", upsert: false });
    if (up.error) throw /row-level security|permission|unauthorized|403/i.test(up.error.message || "")
      ? new Error("Couldn't save the photo: this login isn't allowed to upload pictures yet. Run supabase/16_photo_uploads.sql in Supabase.") : up.error;
    return sb.storage.from("photos").getPublicUrl(path).data.publicUrl;
  }
  /* ======================================================
     BLOG
     ====================================================== */
  let editingPost = null;
  async function loadPosts() { try { S.posts = await q(sb.from("blog_posts").select("*").eq("site_id", sid()).order("created_at", { ascending: false })); } catch (e) { S.posts = null; } }
  async function viewBlog(main) {
    const addBtn = h("button", { class: "btn primary", type: "button", id: "newPost", text: "+ New blog post", onclick: () => { editingPost = "new"; draw(); } });
    main.append(head("Blog", "Write for your fans. Drafts are only visible to your team until you publish.", addBtn));
    const wrap = h("div", { class: "stack" }); main.append(wrap);
    await loadPosts();
    const draw = () => {
      refreshNav();
      if (S.posts === null) { wrap.replaceChildren(h("section", { class: "card" }, h("p", { class: "err", text: "The blog needs its database upgrade first (14_blog.sql)." }))); return; }
      if (editingPost) { wrap.replaceChildren(postEditor(editingPost === "new" ? null : S.posts.find((p) => p.id === editingPost), draw)); return; }
      wrap.replaceChildren(h("section", { class: "card" }, S.posts.length ? h("div", null, S.posts.map((p) => h("div", { class: "switch-row" },
        h("div", { class: "person-top", style: "margin:0;min-width:0" }, p.cover_url ? h("img", { src: p.cover_url, alt: "", style: "width:72px;height:48px;object-fit:cover;border-radius:6px" }) : null,
          h("div", { style: "min-width:0" }, h("b", { class: "wrap-any", text: p.title }),
            h("div", { class: "hint", text: p.published ? "Published " + niceDate(String(p.published_at).slice(0, 10)) : "Draft · last saved " + ago(p.updated_at) }))),
        h("div", { class: "btns" }, h("span", { class: "pill" + (p.published ? " ok" : ""), text: p.published ? "Live" : "Draft" }),
          h("button", { class: "btn sm", type: "button", text: "Edit", onclick: () => { editingPost = p.id; draw(); } })))))
        : empty("No posts yet", "Write your first one. Stories from the road, a bit that didn't make the set, what's coming up.")));
    };
    draw();
  }
  function postEditor(p, done) {
    p = p || { title: "", slug: "", body: "", excerpt: "", cover_url: null, published: false };
    const title = h("input", { id: "postTitle", value: p.title, placeholder: "Give it a title", maxlength: "200" });
    const slugIn = h("input", { id: "postSlug", value: p.slug, placeholder: "the-web-address-of-the-post", autocapitalize: "none", spellcheck: "false" });
    let slugTouched = !!p.slug;
    title.addEventListener("input", () => { if (!slugTouched) slugIn.value = slug(title.value).slice(0, 80); });
    slugIn.addEventListener("input", () => { slugTouched = true; });
    const body = h("textarea", { id: "postBody", value: p.body, style: "min-height:340px;font-size:16px;line-height:1.55", placeholder: "Start writing…" });
    const excerpt = h("textarea", { value: p.excerpt || "", placeholder: "Optional. A line or two for the post list. Left empty, the start of the post is used.", style: "min-height:60px" });
    let cover = p.cover_url;
    const coverBox = h("div");
    const file = h("input", { type: "file", accept: "image/*", style: "display:none" });
    const drawCover = () => coverBox.replaceChildren(cover ? h("img", { src: cover, alt: "", style: "max-width:100%;max-height:220px;border-radius:10px;display:block" }) : h("div", { class: "hint", text: "No cover photo" }),
      h("div", { class: "btns", style: "margin-top:6px" }, h("label", { class: "btn sm" }, cover ? "Change cover photo" : "Add a cover photo", file), cover ? h("button", { class: "btn ghost sm", type: "button", text: "Remove", onclick: () => { cover = null; drawCover(); } }) : null));
    file.addEventListener("change", async () => {
      if (!file.files[0]) return;
      try { toast("Uploading…"); cover = await uploadImage(file.files[0], "blog", { square: false }); drawCover(); toast("Cover photo added. Save to keep it."); } catch (e) { toast(errText(e), { bad: true }); }
    });
    drawCover();
    const preview = h("div", { class: "post-preview", hidden: true });
    const msg = h("div", { class: "err" });
    const save = async (publish) => {
      msg.textContent = "";
      if (!title.value.trim()) { title.classList.add("bad"); title.focus(); msg.textContent = "Every post needs a title."; return; }
      const sl = slug(slugIn.value || title.value).slice(0, 80);
      if (!sl) { msg.textContent = "Give the post a web address."; return; }
      const row = { site_id: sid(), title: title.value.trim(), slug: sl, body: body.value, excerpt: excerpt.value.trim() || null, cover_url: cover || null, published: publish };
      try {
        if (p.id) await q(sb.from("blog_posts").update(row).eq("id", p.id));
        else { const made = await q(sb.from("blog_posts").insert(row).select().single()); p.id = made && made.id; }
        await loadPosts();
        toast(publish && !p.published ? "Published! It's on your site now." : publish ? "Updated on your site." : p.published ? "Unpublished. It's a draft again." : "Draft saved.");
        if (publish && !p.published) confetti();
        editingPost = null; done();
      } catch (e) { msg.textContent = /duplicate|unique/i.test(errText(e)) ? "Another post already uses that web address. Change it under Settings for this post." : errText(e); }
    };
    return h("section", { class: "card stack" },
      h("div", { class: "toolbar" }, h("h2", { style: "margin:0", text: p.id ? "Edit post" : "New post" }), h("span", { class: "pill" + (p.published ? " ok" : ""), text: p.published ? "Live" : "Draft" })),
      field("Title", title), coverBox,
      h("div", { class: "toolbar", style: "margin:0" }, h("b", { text: "Post" }), h("button", { class: "btn ghost sm", type: "button", text: "Preview", onclick: (e) => {
        const on = preview.hidden; preview.hidden = !on; body.hidden = on; e.currentTarget.textContent = on ? "Keep writing" : "Preview";
        if (on) preview.innerHTML = window.CSB && CSB.markdown ? CSB.markdown(body.value) : "";
        if (on && !(window.CSB && CSB.markdown)) preview.textContent = body.value;
      } })),
      body, preview,
      h("details", { class: "quiet" }, h("summary", { text: "How to format" }), h("div", { class: "hint", style: "line-height:1.8;margin-top:6px" },
        "Leave a blank line between paragraphs. ", h("b", { text: "## Heading" }), " · ", h("b", { text: "**bold**" }), " · ", h("i", { text: "*italic*" }), " · [link text](https://…) · ![photo caption](https://…) · start lines with - for a list, or > for a quote. A YouTube link on its own line becomes a video.")),
      h("details", { class: "quiet" }, h("summary", { text: "Settings for this post" }), h("div", { class: "grid", style: "margin-top:8px" }, field("Web address", slugIn, "c12"), field("Short summary", excerpt, "c12"))),
      msg,
      h("div", { class: "btns" },
        h("button", { class: "btn primary", type: "button", id: "publishPost", text: p.published ? "Update" : "Publish", onclick: () => save(true) }),
        h("button", { class: "btn", type: "button", id: "saveDraft", text: p.published ? "Unpublish" : "Save draft", onclick: () => save(false) }),
        h("button", { class: "btn ghost", type: "button", text: "Cancel", onclick: () => { editingPost = null; done(); } }),
        p.id ? sure("Delete post", async () => { try { await q(sb.from("blog_posts").delete().eq("id", p.id)); await loadPosts(); editingPost = null; done(); toast("Post deleted."); } catch (e) { toast(errText(e), { bad: true }); } }) : null));
  }

  function viewMerch(main) {
    const wrap = h("div", { class: "stack" });
    main.append(head("Merch", "List what you sell and link each item to your store (Shopify, Fourthwall, Bandcamp, anywhere)."), wrap);
    const redraw = () => {
      const name = h("input", { placeholder: "Rooster Tee" }), price = h("input", { placeholder: "$30" }), url = h("input", { type: "url", placeholder: "https://yourstore.com/…" });
      const file = h("input", { type: "file", accept: "image/*" });
      const msg = h("div", { class: "err" });
      const add = h("section", { class: "card" }, h("h2", { text: "Add an item" }),
        h("div", { class: "stack", style: "margin-top:10px" }, h("div", { class: "grid" }, field("Name", name, "c5"), field("Price", price, "c2"), field("Buy link", url, "c5"), field("Photo", file, "c12")), msg,
          h("div", { class: "btns" }, h("button", { class: "btn primary", type: "button", text: "Add item", onclick: async (e) => {
            msg.textContent = "";
            if (!name.value.trim()) { name.classList.add("bad"); name.focus(); return; }
            const b = e.currentTarget; b.disabled = true;
            try {
              const image_url = file.files[0] ? await uploadImage(file.files[0], "merch") : null;
              await q(sb.from("merch").insert({ site_id: sid(), name: name.value.trim(), price: price.value.trim() || null, url: url.value.trim() || null, image_url, sort: S.merch.length }));
              await reload.merch(); toast("Added " + name.value.trim() + "."); redraw();
            } catch (err) { msg.textContent = errText(err); b.disabled = false; }
          } }))));
      const listCard = h("section", { class: "card" }, h("h2", { text: "Your merch" }), S.merch.length ? sortable(h("div", null, S.merch.map((m, i) => h("div", { class: "merch-row", "data-drag": m.id }, grip(m.name),
        m.image_url ? h("img", { src: m.image_url, alt: "" }) : h("div", { class: "ph" }),
        h("div", { style: "min-width:0" }, h("b", { text: m.name }), h("div", { class: "hint wrap-any", text: [m.price, m.hidden ? "Hidden" : "", m.url ? "" : "No buy link"].filter(Boolean).join(" · ") })),
        h("div", { class: "btns" },
          h("button", { class: "btn ghost sm", type: "button", text: m.hidden ? "Show" : "Hide", onclick: async () => { try { await q(sb.from("merch").update({ hidden: !m.hidden }).eq("id", m.id)); m.hidden = !m.hidden; redraw(); } catch (e) { toast(errText(e), { bad: true }); } } }),
          h("button", { class: "btn ghost sm danger", type: "button", text: "Delete", onclick: async () => { try { await q(sb.from("merch").delete().eq("id", m.id)); await reload.merch(); redraw(); toast("Deleted " + m.name + "."); } catch (e) { toast(errText(e), { bad: true }); } } }))))), async (from, to) => { await resort("merch", S.merch, from, to); await reload.merch(); redraw(); })
        : empty("Nothing for sale yet", "Add your first item above."));
      wrap.replaceChildren(add, listCard); refreshNav();
    };
    redraw();
  }

