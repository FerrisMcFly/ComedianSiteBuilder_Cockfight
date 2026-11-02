  /* ======================================================
     VIDEOS
     ====================================================== */
  let VIDF = "all", VIDREMOVED = false;
  function ytId(u) { const m = String(u).match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([\w-]{11})/); return m ? m[1] : null; }
  function viewVideos(main) {
    const wrap = h("div", { class: "stack" });
    main.append(head("Videos", "New uploads come in on their own. Star the ones you want up top, hide the ones you don't."), wrap, optionsFold(["lineup_videos"], "Comics' own channels on this site"));
    const redraw = () => {
      const add = (() => {
        const u = h("input", { type: "url", placeholder: "https://www.youtube.com/watch?v=…", "aria-label": "YouTube link" });
        const t = h("input", { placeholder: "Title", "aria-label": "Video title" });
        const msg = h("div", { class: "err" });
        return h("details", { class: "card" }, h("summary", { style: "cursor:pointer;font-weight:700;font-family:var(--display);font-size:18px", text: "Add a video by hand" }),
          h("div", { class: "stack", style: "margin-top:12px" }, h("div", { class: "grid" }, field("YouTube link", u, "c7"), field("Title", t, "c5")), msg,
            h("div", { class: "btns" }, h("button", { class: "btn primary", type: "button", text: "Add video", onclick: async () => {
              const id = ytId(u.value); msg.textContent = "";
              if (!id) { u.classList.add("bad"); msg.textContent = "That doesn't look like a YouTube video link."; return; }
              if (!t.value.trim()) { t.classList.add("bad"); t.focus(); return; }
              try { await q(sb.from("videos").insert({ site_id: sid(), youtube_id: id, title: t.value.trim(), published: today(), thumbnail_url: "https://i.ytimg.com/vi/" + id + "/hqdefault.jpg", url: "https://www.youtube.com/watch?v=" + id }));
                await reload.videos(); toast("Added."); redraw(); } catch (e) { msg.textContent = errText(e); }
            } }))));
      })();
      const live = S.videos.filter((v) => !v.hidden), removed = S.videos.filter((v) => v.hidden);
      if (VIDREMOVED && !removed.length) VIDREMOVED = false;
      const pool = VIDREMOVED ? removed : live;
      const channels = [...new Set(pool.map((v) => v.channel || "").filter(Boolean))];
      if (VIDF !== "all" && !channels.includes(VIDF)) VIDF = "all";
      const shown = pool.filter((v) => VIDF === "all" || v.channel === VIDF);
      const setHidden = async (v, hidden) => {
        // Videos added through this site are hidden on the video itself; a comic's video from their other site is hidden here only.
        if (!v.site_id || v.site_id === sid()) await q(sb.from("videos").update({ hidden }).eq("id", v.id));
        else if (hidden) await q(sb.from("site_hidden").insert({ site_id: sid(), kind: "video", item_id: v.id }));
        else await q(sb.from("site_hidden").delete().eq("site_id", sid()).eq("kind", "video").eq("item_id", v.id));
        v.hidden = hidden; redraw(); refreshNav();
      };
      const chipsRow = channels.length > 1 ? h("div", { class: "seg", role: "group", "aria-label": "Filter by channel" },
        h("button", { type: "button", "aria-pressed": String(VIDF === "all"), text: "All (" + pool.length + ")", onclick: () => { VIDF = "all"; redraw(); } }),
        channels.map((c) => h("button", { type: "button", "aria-pressed": String(VIDF === c), text: c + " (" + pool.filter((v) => v.channel === c).length + ")", onclick: () => { VIDF = c; redraw(); } }))) : h("span");
      const removedToggle = removed.length ? h("button", { class: "btn sm ghost", type: "button", text: VIDREMOVED ? "← Back to your videos" : "Removed (" + removed.length + ")", onclick: () => { VIDREMOVED = !VIDREMOVED; VIDF = "all"; redraw(); } }) : null;
      const card = (v) => h("div", { class: "vid" },
        h("a", { href: v.url, target: "_blank", rel: "noopener" }, h("img", { src: v.thumbnail_url || "", alt: "", loading: "lazy" })),
        h("div", { class: "body" }, h("b", { class: "wrap-any", text: v.title }),
          h("span", { class: "hint", text: [v.published ? shortDate(v.published) : "", v.channel || "", v.host ? first(v.host) + "'s page" : "", v.featured && !v.hidden ? "Featured" : ""].filter(Boolean).join(" · ") }),
          VIDREMOVED
            ? h("div", { class: "btns" }, h("button", { class: "btn sm", type: "button", text: "Put back", onclick: async () => { try { await setHidden(v, false); toast("Back on your site."); } catch (e) { toast(errText(e), { bad: true }); } } }))
            : h("div", { class: "btns" },
                h("button", { class: "btn sm ghost", type: "button", text: "Pin to Home", onclick: () => pinToHome({ kind: "video", headline: String(v.title || "New video").slice(0, 90), button_label: "Watch", link: v.url || null, image_url: v.thumbnail_url || null }) }),
                h("button", { class: "btn sm", type: "button", text: v.featured ? "Unstar" : "Star", onclick: async () => { try { await q(sb.from("videos").update({ featured: !v.featured }).eq("id", v.id)); v.featured = !v.featured; redraw(); } catch (e) { toast(errText(e), { bad: true }); } } }),
                h("button", { class: "btn sm ghost danger", type: "button", text: "Remove", onclick: async () => {
                  try { await setHidden(v, true); toast("Removed “" + v.title + "” from your site.", { action: { label: "Undo", run: async () => { try { await setHidden(v, false); } catch (e) { toast(errText(e), { bad: true }); } } } }); }
                  catch (e) { toast(errText(e), { bad: true }); }
                } }))));
      const grid = S.videos.length ? h("section", { class: "card" },
          h("div", { class: "toolbar" }, h("h2", { style: "margin:0", text: VIDREMOVED ? "Removed videos" : "Your videos" }), h("div", { class: "btns" }, chipsRow, removedToggle)),
          VIDREMOVED ? h("p", { class: "sub", text: "These stay off your site, and new imports won't bring them back. Put one back any time." }) : null,
          shown.length ? h("div", { class: "vids" }, shown.map(card)) : empty(VIDREMOVED ? "Nothing removed" : "No videos showing", VIDREMOVED ? "" : "Everything here has been removed. See Removed to put some back."))
        : h("section", { class: "card" }, empty("No videos yet", "Connect a channel above."));
      wrap.replaceChildren(sourceCard("youtube", redraw), add, grid); refreshNav();
    };
    redraw();
  }

