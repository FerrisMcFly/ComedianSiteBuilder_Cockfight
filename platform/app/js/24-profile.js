  /* ======================================================
     PROFILE
     ====================================================== */
  // Going live: one button puts a LIVE banner on the site and the stream on its Live page (and a LIVE badge on the
  // Coasters of everyone on the site). End takes it all down; it also stops by itself after 12 hours.
  function viewLive(main) {
    const p = S.site.profile || {}, live = S.site.live;
    const ready = "live" in S.site;  // the database has 23_media.sql
    main.append(h("p", { class: "hint", style: "margin:0", text: "Streaming on Twitch or YouTube? Go live and your site shows a LIVE banner and the stream." }));
    if (!ready) { main.append(h("section", { class: "card" }, h("p", { class: "hint", text: "Going live needs the latest database upgrade (supabase/23_media.sql, in UPGRADE_V3_ALL.sql)." }))); return; }
    const isLive = live && live.url && (!live.started_at || Date.now() - Date.parse(live.started_at) < 12 * 3600 * 1000);
    if (isLive) {
      main.append(h("section", { class: "card stack attention" }, h("div", { class: "toolbar" }, h("h2", { style: "margin:0", text: "🔴 You're live" }),
          h("span", { class: "hint", text: live.started_at ? "Since " + new Date(live.started_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "" })),
        live.title ? h("b", { text: live.title }) : null, h("a", { class: "hint wrap-any", href: live.url, target: "_blank", rel: "noopener", text: live.url }),
        h("div", { class: "btns" }, h("button", { class: "btn primary", type: "button", text: "End stream", onclick: async () => {
          try { await saveSite({ live: null }, "Stream ended. The LIVE banner is gone."); route(); } catch (e) { toast(errText(e), { bad: true }); } } }),
          S.site.domain ? h("a", { class: "btn ghost", href: "https://" + S.site.domain, target: "_blank", rel: "noopener", text: "See your site ↗" }) : null)));
    }
    const url = h("input", { type: "url", value: p.stream_url || "", placeholder: "https://twitch.tv/yourname or a YouTube live link", "aria-label": "Stream link" });
    const title = h("input", { maxlength: "100", placeholder: "Late-night crowd work, no rules", "aria-label": "What's on" });
    const sched = h("textarea", { maxlength: "300", placeholder: "Tuesdays and Thursdays, 10pm ET", "aria-label": "Schedule", style: "min-height:60px" }); sched.value = p.stream_schedule || "";
    const msg = h("div", { class: "err" });
    main.append(h("form", { class: "card stack", onsubmit: async (e) => {
      e.preventDefault(); msg.textContent = "";
      const u = url.value.trim();
      if (!/^https:\/\/(www\.)?(twitch\.tv|youtube\.com|youtu\.be|kick\.com)\//i.test(u)) { msg.textContent = "Paste your Twitch, YouTube or Kick link (it starts with https://)."; url.focus(); return; }
      try {
        await saveSite({ live: { url: u, title: title.value.trim() || null, started_at: new Date().toISOString() }, profile: { ...(S.site.profile || {}), stream_url: u, stream_schedule: sched.value.trim() } }, "You're live. Your site shows it now.");
        route();
      } catch (er) { msg.textContent = errText(er); }
    } }, h("h2", { text: isLive ? "Switch streams" : "Go live" }),
      h("div", { class: "grid" }, field("Stream link", url, "c7"), field("What's on (optional)", title, "c5"), field("When you usually stream (shows on the Live page when you're not live)", sched, "c12")), msg,
      h("div", { class: "btns" }, h("button", { class: "btn primary", type: "submit", text: isLive ? "Switch" : "🔴 Go live" }),
        h("span", { class: "hint", text: "Twitch and YouTube play right on your site. Others get a Watch button." }))));
  }

  function viewProfile(main) {
    const p = S.site.profile || {};
    const f = {
      tagline: h("input", { value: p.tagline || "", placeholder: "One line that sums you up" }),
      about: h("textarea", { value: p.about || "", placeholder: "Tell fans what you're about", style: "min-height:140px" }),
      contact_email: h("input", { type: "email", value: p.contact_email || "", placeholder: "hello@…" }),
      booking_email: h("input", { type: "email", value: p.booking_email || "", placeholder: "booking@…" }),
      support_url: h("input", { type: "url", value: p.support_url || "", placeholder: "https://www.patreon.com/…" }),
      support_label: h("input", { value: p.support_label || "", placeholder: "Patreon" }),
      apple_url: h("input", { type: "url", value: p.apple_url || "", placeholder: "https://podcasts.apple.com/…" }),
      spotify_url: h("input", { type: "url", value: p.spotify_url || "", placeholder: "https://open.spotify.com/show/…" }),
      share_title: h("input", { maxlength: "70", value: p.share_title || "" }),
      share_text: h("textarea", { maxlength: "200", value: p.share_text || "", style: "min-height:70px" })
    };
    // ---- link preview: the card Discord, iMessage, Instagram and the rest show when someone shares the site ----
    let shareImage = p.share_image || "";
    const firstPhoto = () => ((S.hosts || []).find((x) => !x.hidden && x.photo_url) || {}).photo_url || "";
    const dflt = () => {
      const lead = f.tagline.value.trim(), line = (f.about.value.trim().split(/\n+/)[0] || "").slice(0, 160);
      return { title: S.site.name + (lead ? " · " + lead.slice(0, 60) : ""), text: [lead && line && !line.startsWith(lead) ? lead : "", line].filter(Boolean).join(". ") || S.site.name + " on ComicTable" };
    };
    const card = h("div", { class: "share-card", "aria-label": "How the link looks when shared" });
    const imgFile = h("input", { type: "file", accept: "image/*", style: "display:none" });
    const imgBtns = h("div", { class: "btns" });
    function drawCard() {
      const d = dflt(), img = shareImage || firstPhoto();
      f.share_title.placeholder = d.title; f.share_text.placeholder = d.text;
      card.replaceChildren(h("div", { class: "share-host", text: S.site.domain || "your site" }),
        h("b", { class: "share-title", text: f.share_title.value.trim() || d.title }),
        h("div", { class: "share-text", text: f.share_text.value.trim() || d.text }),
        img ? h("img", { class: "share-img", src: img, alt: "" }) : h("div", { class: "share-img none", text: "No picture yet: add one below, or a photo in Lineup" }));
      imgBtns.replaceChildren(h("label", { class: "btn sm" }, shareImage ? "Change picture" : "Use a different picture", imgFile),
        shareImage ? h("button", { class: "btn ghost sm", type: "button", text: "Use my People photo instead", onclick: () => { shareImage = ""; drawCard(); } }) : null);
    }
    imgFile.addEventListener("change", async () => {
      if (!imgFile.files[0]) return;
      try { toast("Uploading…"); shareImage = await uploadImage(imgFile.files[0], "share", { square: false }); drawCard(); toast("Picture added. Save to keep it."); } catch (e) { toast(errText(e), { bad: true }); }
    });
    ["tagline", "about", "share_title", "share_text"].forEach((k) => f[k].addEventListener("input", drawCard));
    drawCard();
    const save = h("button", { class: "btn primary", type: "submit", text: "Save profile" });
    main.append(head("About & contact", "The basics about you or your show. Your theme decides where each piece appears."),
      h("form", { class: "card stack", onsubmit: async (e) => {
        e.preventDefault(); save.disabled = true;
        const profile = Object.assign({}, p); for (const k in f) profile[k] = f[k].value.trim();
        profile.share_image = shareImage;
        try { await saveSite({ profile }, "Profile saved. It's live."); } catch (err) { toast(errText(err), { bad: true }); }
        save.disabled = false;
      } },
        h("div", { class: "grid" }, field("Tagline", f.tagline, "c12"), field("About", f.about, "c12"),
          field("Contact email", f.contact_email, "c6"), field("Booking email", f.booking_email, "c6"),
          field("Support link (Patreon, Ko-fi, Substack…)", f.support_url, "c8"), field("Support button says", f.support_label, "c4"),
          F("podcast") ? field("Podcast on Apple", f.apple_url, "c6") : null, F("podcast") ? field("Podcast on Spotify (the show's link)", f.spotify_url, "c6") : null),
        h("div", { class: "stack", style: "gap:10px;border-top:1px solid var(--line);padding-top:16px" },
          h("h2", { style: "margin:0", text: "Link preview" }),
          h("p", { class: "hint", style: "margin:0", text: "The card people see when your site's link is shared in a text, Discord, Instagram and so on. Leave a box empty to use your tagline and About. Apps keep old previews for a while, so a change can take a day to show everywhere." }),
          h("div", { class: "share-wrap" }, h("div", { class: "grid", style: "align-content:start" }, field("Title", f.share_title, "c12"), field("Text", f.share_text, "c12"), h("div", { class: "c12" }, imgBtns)), card)),
        h("div", { class: "btns" }, save)));
  }

