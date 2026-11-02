  /* ======================================================
     QR CODES (fan sign-up)
     ====================================================== */
  // The sign-up page lives on the comic's own domain (/join), or on comictable.com/join/<site> until they have one.
  const joinUrl = (showId) => (S.site.domain ? "https://" + S.site.domain + "/join" : location.origin + "/join/" + sid()) + (showId ? "?show=" + showId : "");
  let qrLib = null;
  const loadQr = () => qrLib || (qrLib = new Promise((ok, no) => {
    if (window.qrcode) return ok(window.qrcode);
    const sc = document.createElement("script"); sc.src = "https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js";
    sc.onload = () => window.qrcode ? ok(window.qrcode) : no(new Error("no qrcode")); sc.onerror = () => { qrLib = null; no(new Error("Couldn't load the QR maker. Check your connection.")); };
    document.head.append(sc);
  }));
  async function qrMatrix(text) { const make = await loadQr(); const qr = make(0, "M"); qr.addData(text); qr.make(); const n = qr.getModuleCount(); return { n, dark: (r, c) => qr.isDark(r, c) }; }
  // Black on white with a quiet border, big enough to print on a poster.
  function qrCanvas(m, px) {
    const quiet = 4, cell = Math.max(1, Math.floor(px / (m.n + quiet * 2))), size = cell * (m.n + quiet * 2);
    const c = document.createElement("canvas"); c.width = c.height = size; const g = c.getContext && c.getContext("2d"); if (!g) return c;
    g.fillStyle = "#fff"; g.fillRect(0, 0, size, size); g.fillStyle = "#000";
    for (let r = 0; r < m.n; r++) for (let col = 0; col < m.n; col++) if (m.dark(r, col)) g.fillRect((col + quiet) * cell, (r + quiet) * cell, cell, cell);
    return c;
  }
  function qrBox(url, fileName, caption) {
    const pic = h("div", { class: "qr-pic" }, h("span", { class: "hint", text: "Making the code…" }));
    const box = h("div", { class: "qr-box" }, pic, h("div", { class: "stack", style: "gap:8px;min-width:0" },
      caption ? h("b", { text: caption }) : null,
      h("div", { class: "hint wrap-any", text: url }),
      h("div", { class: "btns" },
        h("button", { class: "btn sm", type: "button", text: "Copy link", onclick: async () => toast((await copyText(url)) ? "Link copied." : "Couldn't copy. Try again.") }),
        h("a", { class: "btn sm ghost", href: url, target: "_blank", rel: "noopener", text: "Open the page ↗" }),
        h("button", { class: "btn sm primary", type: "button", text: "Download for printing", onclick: async () => {
          try { const c = qrCanvas(await qrMatrix(url), 2000); const a = h("a", { href: c.toDataURL("image/png"), download: fileName + ".png" }); document.body.append(a); a.click(); a.remove(); }
          catch (e) { toast(errText(e), { bad: true }); }
        } }))));
    qrMatrix(url).then((m) => { const c = qrCanvas(m, 360); c.setAttribute("aria-label", "QR code for " + url); c.setAttribute("role", "img"); pic.replaceChildren(c); },
      (e) => pic.replaceChildren(h("span", { class: "hint", text: errText(e) })));
    return box;
  }

