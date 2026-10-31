  /* ======================================================
     FAN LIST
     ====================================================== */
  async function copyText(t) {
    try { await navigator.clipboard.writeText(t); return true; }
    catch (e) { const ta = h("textarea", { style: "position:fixed;opacity:0" }); ta.value = t; document.body.append(ta); ta.select(); let ok = false; try { ok = document.execCommand("copy"); } catch (er) {} ta.remove(); return ok; }
  }
  async function viewFans(main) {
    main.append(head("Fan list", "Fans who signed up on your site to hear when you're playing near them. The list is yours: only your team can see it."));
    const wrap = h("div", { class: "stack" }, h("section", { class: "card" }, h("p", { class: "hint", text: "Loading…" }))); main.append(wrap, optionsFold(["signup_style"], "The sign-up on your site"));
    let fans, near;
    try {
      [fans, near] = await Promise.all([
        q(sb.from("fans").select("*").eq("site_id", sid()).order("created_at", { ascending: false })),
        q(sb.rpc("fans_near_shows", { p_site: sid() }))
      ]);
    } catch (e) {
      wrap.replaceChildren(h("section", { class: "card" }, h("p", { class: "err", text: /fans|function/i.test(errText(e)) ? "The fan list needs its database upgrade first (09_places.sql and 10_fans.sql)." : errText(e) })));
      return;
    }
    const counts = Object.fromEntries(near.map((r) => [r.show_id, r.fans]));
    const week = fans.filter((f) => Date.now() - new Date(f.created_at) < 7 * 864e5).length;
    const up = S.shows.filter((s) => s.date >= today() && s.status !== "cancelled" && !s.hidden_here).sort((a, b) => (a.date + to24(a.time)).localeCompare(b.date + to24(b.time)));

    const stats = h("div", { class: "stats" },
      h("div", { class: "stat" }, h("div", { class: "n", text: fans.length }), h("div", { class: "l", text: fans.length === 1 ? "fan on your list" : "fans on your list" })),
      h("div", { class: "stat" }, h("div", { class: "n", text: week }), h("div", { class: "l", text: "joined this week" })));

    // QR code: print it for the merch table, put it on a slide, flash it from the stage
    const qrCard = h("section", { class: "card stack" }, h("h2", { style: "margin:0", text: "Sign-up QR code" }),
      h("p", { class: "sub", style: "margin:0", text: "Fans scan it and land on a one-screen sign-up: email, city, and (if they want) where they met you. Print it for the merch table or put it on screen after your set. Each show below has its own code too, which fills in where you met." }),
      F("fans") ? qrBox(joinUrl(), sid() + "-fan-list-qr", null) : h("p", { class: "err", text: "Turn on Fan list in Settings first, or the page won't take sign-ups." }));

    // shows, and who's nearby
    const showsCard = h("section", { class: "card" }, h("h2", { text: "Who's near your shows" }),
      h("p", { class: "sub", text: "Fans count as near a show when it's within the distance they picked. Copy their emails and paste them into the BCC line of an email, so fans don't see each other's addresses." }),
      up.length ? h("div", null, up.map((s) => {
        const n = counts[s.id] || 0;
        return h("div", { class: "switch-row" },
          h("div", null, h("b", { text: (s.venue || s.city || "Show") + (S.hosts.length > 1 ? " · " + first(s.host) : "") }), h("div", { class: "hint", text: shortDate(s.date) + (s.time ? " at " + s.time : "") + (s.city ? " · " + s.city : "") + (s.venue_id ? "" : " · club not from the club list, so distance can't be measured") })),
          h("div", { class: "btns" }, h("span", { class: "pill" + (n ? "" : " warn"), text: n + (n === 1 ? " fan nearby" : " fans nearby") }),
            h("button", { class: "btn sm ghost", type: "button", text: "QR for this show", onclick: (e) => {
              const row = e.currentTarget.closest(".switch-row"), next = row.nextElementSibling;
              if (next && next.classList.contains("qr-inline")) { next.remove(); return; }
              row.after(h("div", { class: "qr-inline" }, qrBox(joinUrl(s.id), sid() + "-" + s.date + "-qr", (s.venue || s.city || "Show") + " · " + shortDate(s.date))));
            } }),
            n ? h("button", { class: "btn sm", type: "button", text: "Copy emails", onclick: async () => {
              try { const list = await q(sb.rpc("fans_near_show", { p_show: s.id, p_site: sid() })); const ok = await copyText(list.map((f) => f.email).join(", ")); toast(ok ? "Copied " + list.length + " email" + (list.length === 1 ? "" : "s") + "." : "Couldn't copy. Try again.", { bad: !ok }); }
              catch (e) { toast(errText(e), { bad: true }); }
            } }) : null));
      })) : empty("No upcoming shows", "Add shows and you'll see how many fans live near each one."));

    // where fans are
    const byCity = {};
    fans.forEach((f) => { const k = f.city ? f.city + (f.state ? ", " + f.state : "") : "Unknown"; byCity[k] = (byCity[k] || 0) + 1; });
    const top = Object.entries(byCity).sort((a, b) => b[1] - a[1]).slice(0, 12);
    const whereCard = h("section", { class: "card" }, h("h2", { text: "Where your fans are" }),
      top.length ? h("div", { class: "btns", style: "gap:6px" }, top.map(([c, n]) => h("span", { class: "pill", text: c + " · " + n }))) : empty("Nobody yet", "Once fans sign up, you'll see which cities they're in. That's handy when you're booking a tour."));

    // everyone
    const search = h("input", { type: "search", placeholder: "Search by email, city or where you met", "aria-label": "Search fans", style: "max-width:320px" });
    const listBox = h("div");
    const drawList = () => {
      const t = search.value.trim().toLowerCase();
      const rows = fans.filter((f) => !t || f.email.includes(t) || String(f.city || "").toLowerCase().includes(t) || String(f.met_at || "").toLowerCase().includes(t));
      listBox.replaceChildren(rows.length ? h("div", null, rows.slice(0, 300).map((f) => h("div", { class: "switch-row" },
        h("div", { style: "min-width:0" }, h("b", { class: "wrap-any", text: f.email }), f.source === "qr" ? h("span", { class: "pill", style: "margin-left:6px", text: "QR" }) : null,
          h("div", { class: "hint", text: (f.city ? f.city + (f.state ? ", " + f.state : "") : "No city") + " · within " + f.radius_mi + " miles · joined " + ago(f.created_at) }),
          f.met_at ? h("div", { class: "hint wrap-any", text: "Met at: " + f.met_at }) : null),
        sure("Remove", async () => { try { await q(sb.from("fans").delete().eq("id", f.id)); fans.splice(fans.indexOf(f), 1); drawList(); toast("Removed from your list."); } catch (e) { toast(errText(e), { bad: true }); } }))),
        rows.length > 300 ? h("p", { class: "hint", text: "Showing the newest 300. Search to find someone, or download the full list." }) : null)
        : empty(fans.length ? "No matches" : "No fans yet", fans.length ? "Try another search." : "Fans join from your site's sign-up box or your QR code. Share either and they'll start showing up here."));
    };
    search.addEventListener("input", drawList);
    const csv = () => {
      const cell = (v) => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
      const lines = [["email", "city", "state", "within_miles", "met_at", "joined_from", "joined"].join(",")].concat(fans.map((f) => [f.email, f.city, f.state, f.radius_mi, f.met_at, f.source || "site", String(f.created_at).slice(0, 10)].map(cell).join(",")));
      const a = h("a", { href: URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" })), download: sid() + "-fans.csv" });
      document.body.append(a); a.click(); a.remove();
    };
    const allCard = h("section", { class: "card" },
      h("div", { class: "toolbar" }, h("h2", { style: "margin:0", text: "Everyone (" + fans.length + ")" }),
        h("div", { class: "btns" }, search, fans.length ? h("button", { class: "btn sm", type: "button", text: "Download list", onclick: csv }) : null)),
      listBox);
    drawList();
    wrap.replaceChildren(stats, qrCard, showsCard, whereCard, allCard);
  }

