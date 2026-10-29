  /* ======================================================
     ALL SITES (platform admins only)
     ====================================================== */
  const cleanDomain = (d) => String(d || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  const siteSlug = (s) => String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  // comictable.com's own front page: which site "See a site running on it" opens, and which sites it lists
  function showcaseCard() {
    const card = h("section", { class: "card stack" }, h("h2", { text: "On comictable.com" }), h("p", { class: "hint", text: "Loading…" }));
    (async () => {
      let st;
      try { st = (await q(sb.from("platform_settings").select("*").eq("id", 1)))[0] || { featured_site: null, showcase: [] }; }
      catch (e) { card.replaceChildren(h("h2", { text: "On comictable.com" }), h("p", { class: "err", text: /platform_settings/i.test(errText(e)) ? "This needs a database upgrade: run supabase/UPGRADE_V3_ALL.sql in Supabase." : errText(e) })); return; }
      const live = S.sites.filter((x) => x.domain);
      const list = Array.isArray(st.showcase) ? st.showcase.filter((x) => x && x.site) : [];
      const featured = h("select", { id: "scFeatured", "aria-label": "See a site running on it" },
        h("option", { value: "", text: "Pick a site…" }), live.map((x) => h("option", { value: x.id, text: x.name + " · " + x.domain, selected: st.featured_site === x.id })));
      const rows = live.map((x) => {
        const on = list.find((y) => y.site === x.id);
        const box = h("input", { type: "checkbox", checked: !!on, "aria-label": "List " + x.name });
        const blurb = h("input", { maxlength: "80", placeholder: "One line, e.g. A comedy podcast.", value: on ? on.blurb || "" : "", "aria-label": "Line about " + x.name });
        return { id: x.id, box, blurb, el: h("div", { class: "switch-row" }, h("label", { class: "check", style: "min-width:200px" }, box, h("span", null, h("b", { text: x.name }), h("span", { class: "hint", text: " " + x.domain }))), blurb) };
      });
      // listed ones first, in their saved order
      rows.sort((a, b) => { const i = list.findIndex((y) => y.site === a.id), j = list.findIndex((y) => y.site === b.id); return (i < 0 ? 999 : i) - (j < 0 ? 999 : j); });
      const save = h("button", { class: "btn primary", type: "button", text: "Save", onclick: async () => {
        const showcase = rows.filter((r) => r.box.checked).map((r) => ({ site: r.id, blurb: r.blurb.value.trim() }));
        try { await q(sb.from("platform_settings").upsert({ id: 1, featured_site: featured.value || null, showcase, updated_at: new Date().toISOString() }));
          toast("Saved. comictable.com shows it now."); }
        catch (e) { toast(errText(e), { bad: true }); }
      } });
      card.replaceChildren(h("h2", { text: "On comictable.com" }),
        h("p", { class: "sub", text: "What ComicTable's front page shows off. Only sites with a web address can be picked." }),
        live.length ? h("div", { class: "stack" },
          field("“See a site running on it” opens", featured),
          h("div", null, h("b", { text: "Listed under “Running on ComicTable”" }), h("div", { class: "hint", text: "Tick the ones to list, in this order. The line shows next to the name." })),
          h("div", null, rows.map((r) => r.el)),
          h("div", { class: "btns" }, save, h("a", { class: "btn ghost", href: "/", target: "_blank", rel: "noopener", text: "View comictable.com ↗" })))
          : empty("No sites with a web address yet", "Add one to a site first."));
    })();
    return card;
  }
  async function viewSites(main) {
    main.append(head("All sites", "Every comic running on ComicTable. Start a new one here, then build their front end and launch it."));
    const wrap = h("div", { class: "stack" }); main.append(wrap);

    // ---- new site form ----
    const name = h("input", { id: "nsName", placeholder: "Comic or show name", autocomplete: "off" });
    const id = h("input", { id: "nsId", placeholder: "short-name", autocapitalize: "none", spellcheck: "false" });
    const dom = h("input", { id: "nsDomain", placeholder: "theirname.com (optional, add later)", autocapitalize: "none", spellcheck: "false" });
    const kinds = [["shows", "Stand-up shows", true], ["podcast", "Podcast", true], ["videos", "YouTube", true], ["merch", "Merch", false], ["forum", "Forum", false], ["chat", "Chat room", false]];
    const boxes = Object.fromEntries(kinds.map(([k, , on]) => [k, h("input", { type: "checkbox", checked: on, id: "nsF_" + k })]));
    let idTouched = false;
    name.addEventListener("input", () => { if (!idTouched) id.value = siteSlug(name.value); });
    id.addEventListener("input", () => { idTouched = true; });
    const msg = h("div", { class: "err" });
    const btn = h("button", { class: "btn primary", type: "submit", text: "Create site" });
    const form = h("form", { class: "card stack", onsubmit: async (e) => {
      e.preventDefault(); msg.textContent = "";
      const nm = name.value.trim(), sl = siteSlug(id.value || nm);
      if (!nm) { name.classList.add("bad"); name.focus(); return; }
      if (sl.length < 2) { msg.textContent = "Give the site a short id, like their-name."; id.focus(); return; }
      btn.disabled = true;
      try {
        const r = await sb.rpc("create_site", { p_id: sl, p_name: nm, p_domain: cleanDomain(dom.value) || null });
        if (r.error) throw r.error;
        const features = Object.fromEntries(kinds.map(([k]) => [k, boxes[k].checked]));
        await q(sb.from("sites").update({ features }).eq("id", sl));
        S.sites = await q(sb.from("sites").select("*").order("name", { ascending: true }));
        toast(nm + " is set up. Add the comics next.");
        await switchSite(sl, "people");
      } catch (er) {
        msg.textContent = /create_site/.test(errText(er)) && /function|schema cache/i.test(errText(er)) ? "The database needs 08_create_sites.sql first. Paste it into the Supabase SQL Editor and run it." : errText(er);
        btn.disabled = false;
      }
    } },
      h("h2", { text: "Start a new site" }),
      h("p", { class: "sub", text: "Makes the comic's space on ComicTable: their shows, podcast, videos and fans, kept separate from everyone else's. Then add the comic in that site's Lineup, and give them a login there. As a super admin you can manage every site without being on its team." }),
      h("div", { class: "grid" }, field("Comic or show name", name, "c6"), field("Site id (used in the launch settings)", id, "c6"), field("Their web address", dom, "c12")),
      h("div", null, h("b", { text: "What's on their site" }), h("div", { class: "btns", style: "margin-top:8px" }, kinds.map(([k, l]) => h("label", { class: "pill", style: "cursor:pointer;gap:6px;display:inline-flex;align-items:center" }, boxes[k], l)))),
      h("div", { class: "hint", text: "You can change any of this later in that site's Settings." }), msg, h("div", { class: "btns" }, btn));

    // ---- list of sites with a launch checklist ----
    const listCard = h("section", { class: "card" }, h("h2", { text: "Sites" }), h("p", { class: "hint", text: "Loading…" }));
    // ---- "Get your site" requests from comictable.com ----
    const reqCard = h("section", { class: "card" });
    async function drawRequests() {
      let reqs;
      try { reqs = await q(sb.from("site_requests").select("*").eq("handled", false).order("created_at", { ascending: false })); }
      catch (e) { reqCard.replaceChildren(); return; }
      reqCard.replaceChildren(h("h2", { text: "Requests from comictable.com" + (reqs.length ? " (" + reqs.length + ")" : "") }),
        reqs.length ? h("div", null, reqs.map((r) => h("div", { class: "switch-row", style: "flex-wrap:wrap;align-items:flex-start" },
          h("div", { style: "flex:1 1 320px" }, h("b", { text: r.name }), h("span", { class: "hint", style: "margin-left:8px", text: ago(r.created_at) }),
            h("div", null, h("a", { href: "mailto:" + r.email, text: r.email })),
            r.act ? h("div", { class: "hint", text: r.act }) : null, r.links ? h("div", { class: "hint", text: r.links }) : null, r.note ? h("div", { style: "margin-top:4px;white-space:pre-wrap", text: r.note }) : null),
          h("div", { class: "btns" },
            h("button", { class: "btn sm", type: "button", text: "Start their site", onclick: () => { set(name, r.name); form.scrollIntoView({ behavior: "smooth" }); name.focus(); } }),
            h("button", { class: "btn sm ghost", type: "button", text: "Mark handled", onclick: async () => { try { await q(sb.from("site_requests").update({ handled: true }).eq("id", r.id)); drawRequests(); } catch (e) { toast(errText(e), { bad: true }); } } })))))
          : empty("No new requests", "When a comic fills in the form on comictable.com, it shows up here."));
    }
    const set = (el, v) => { el.value = v; el.dispatchEvent(new Event("input")); };
    drawRequests();
    const supCard = h("section", { class: "card" });
    (async () => {
      let list;
      try { list = await q(sb.rpc("platform_admin_list")); } catch (e) { return; }
      const staffRole = (r) => (r || "admin") === "admin" ? "Admin" : "Staff";
      const email = h("input", { id: "stEmail", type: "email", placeholder: "their email", autocapitalize: "none", "aria-label": "Email" });
      const pass = h("input", { id: "stPass", type: "text", placeholder: "only if they're new: 8+ characters", "aria-label": "Starting password" });
      const role = h("select", { id: "stRole", "aria-label": "Role", style: "width:auto" }, h("option", { value: "staff", text: "Staff: works on every site and comic" }), h("option", { value: "admin", text: "Admin: everything, like you" }));
      const msg = h("div", { class: "err" });
      supCard.replaceChildren(h("h2", { text: "ComicTable staff" }),
        h("p", { class: "sub", text: "People who work on every site. Admins can do everything. Staff can't add staff, create sites, delete comics or change the front page." }),
        h("div", null, list.map((u) => h("div", { class: "switch-row" },
          h("div", null, h("b", { text: u.email }), u.you ? h("span", { class: "pill", style: "margin-left:6px", text: "You" }) : null, h("div", { class: "hint", text: staffRole(u.role) })),
          S.isOwner && !u.you ? h("div", { class: "btns" },
            (() => { const sel = h("select", { "aria-label": "Role for " + u.email, style: "width:auto" }, h("option", { value: "staff", text: "Staff", selected: (u.role || "admin") === "staff" }), h("option", { value: "admin", text: "Admin", selected: (u.role || "admin") === "admin" }));
              sel.addEventListener("change", async () => { try { await q(sb.rpc("set_platform_role", { p_user: u.user_id, p_role: sel.value })); toast(u.email + " is " + (sel.value === "admin" ? "an admin" : "staff") + " now."); route(); } catch (e) { toast(errText(e), { bad: true }); } });
              return sel; })(),
            sure("Remove", async () => { try { await q(sb.rpc("remove_platform_admin", { p_user: u.user_id })); toast(u.email + " is off ComicTable staff."); route(); } catch (e) { toast(errText(e), { bad: true }); } })) : null))),
        S.isOwner ? h("div", { class: "newclub stack", style: "gap:10px;margin-top:12px" }, h("b", { text: "Add someone" }),
          h("div", { class: "grid" }, field("Email", email, "c6"), field("Starting password", pass, "c6"), h("div", { class: "field c12" }, h("span", { text: "Role" }), role)),
          h("div", { class: "hint", text: "If they already have a ComicTable login, the password is ignored. Otherwise send them their email and password yourself." }), msg,
          h("div", { class: "btns" }, h("button", { class: "btn primary sm", type: "button", text: "Add to staff", onclick: async (e) => {
            msg.textContent = "";
            if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.value.trim())) { email.classList.add("bad"); email.focus(); return; }
            const b = e.currentTarget; b.disabled = true;
            try { await teamCall({ action: "staff_add", email: email.value.trim(), password: pass.value, role: role.value }); toast("Added. They log in with " + email.value.trim() + "."); route(); }
            catch (er) { msg.textContent = er.message; b.disabled = false; }
          } }))) : null);
    })();
    wrap.append(...[reqCard, listCard, S.isOwner ? showcaseCard() : null, S.isOwner ? form : null, supCard].filter(Boolean));
    try {
      const sites = await q(sb.from("sites").select("*").order("created_at", { ascending: true }));
      const counts = async (t, sidv, extra) => { let qq = sb.from(t).select("id", { count: "exact", head: true }).eq("site_id", sidv); if (extra) qq = extra(qq); const r = await qq; return r.error ? 0 : r.count || 0; };
      const rows = await Promise.all(sites.map(async (st) => {
        const [people, shows, srcs] = await Promise.all([counts("hosts", st.id), counts("shows", st.id, (x) => x.gte("date", today())), counts("sources", st.id)]);
        const steps = [["Comics added", people > 0], ["Podcast or YouTube connected", srcs > 0], ["Web address set", !!st.domain]];
        return h("div", { class: "switch-row", style: "flex-wrap:wrap;align-items:flex-start" },
          h("div", { style: "flex:1 1 280px" }, h("b", { text: st.name }), st.id === sid() ? h("span", { class: "pill", style: "margin-left:6px", text: "Open now" }) : null,
            h("div", { class: "hint", text: (st.domain || "No address yet") + " · id: " + st.id + " · " + people + (people === 1 ? " comic" : " comics") + " · " + shows + " upcoming show" + (shows === 1 ? "" : "s") }),
            h("div", { class: "btns", style: "margin-top:6px;gap:6px" }, steps.map(([t, ok]) => h("span", { class: "pill" + (ok ? "" : " warn"), text: (ok ? "✓ " : "○ ") + t })))),
          h("div", { class: "btns" },
            st.id === sid() ? null : h("button", { class: "btn sm", type: "button", text: "Open", onclick: () => switchSite(st.id, "home") }),
            st.domain ? h("a", { class: "btn sm ghost", href: "https://" + st.domain, target: "_blank", rel: "noopener", text: "Visit ↗" }) : null));
      }));
      listCard.replaceChildren(h("h2", { text: "Sites (" + sites.length + ")" }), h("div", null, rows));
    } catch (e) { listCard.replaceChildren(h("h2", { text: "Sites" }), h("p", { class: "err", text: errText(e) })); }
  }

  function clubsReview() {
    const card = h("section", { class: "card" });
    const draw = () => {
      const fresh = S.venues.filter((v) => v.created_by_site && !v.verified).sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
      card.replaceChildren(h("h2", { text: "Recently added clubs" }), h("p", { class: "sub", text: "Clubs comics added. They're already in the shared database; check them over, fix typos, or remove duplicates." }),
        fresh.length ? h("div", null, fresh.map((v) => {
          const nm = h("input", { value: v.name, "aria-label": "Club name" }), ct = h("input", { value: v.city, "aria-label": "City" }), st = h("input", { value: v.state || "", "aria-label": "State", maxlength: "3", style: "width:70px" });
          return h("div", { class: "switch-row", style: "flex-wrap:wrap" }, h("div", { class: "btns", style: "flex:1 1 320px" }, nm, ct, st),
            h("div", { class: "btns" },
              h("button", { class: "btn sm primary", type: "button", text: "Looks good", onclick: async () => { try { await q(sb.from("venues").update({ name: nm.value.trim(), city: ct.value.trim(), state: st.value.trim().toUpperCase() || null, verified: true }).eq("id", v.id)); await reload.venues(); draw(); toast("Checked " + nm.value.trim() + "."); } catch (e) { toast(errText(e), { bad: true }); } } }),
              h("button", { class: "btn sm ghost danger", type: "button", text: "Remove", onclick: async () => { try { await q(sb.from("venues").delete().eq("id", v.id)); await reload.venues(); draw(); toast("Removed. Shows already entered there keep their details."); } catch (e) { toast(errText(e), { bad: true }); } } })));
        })) : empty("Nothing new", S.venues.length + " clubs in the shared database."));
    };
    draw(); return card;
  }

