(() => {
  const el = (id) => document.getElementById(id);

  const CONFIG = {
    api: "https://trafikkmeldinger.pages.dev/api/combined?region=stavanger",
    refreshRateMs: 60_000,
    clockRateMs: 1_000,
    retryAfterErrorMs: 20_000
  };

  const dom = {
    app: el("app"),
    statusText: el("statusText"),
    statusReason: el("statusReason"),
    pill: el("pill"),
    updated: el("updated"),
    clock: el("clock"),
    items: el("items"),
    cam1: el("cam1"),
    cam2: el("cam2"),
    camStamp1: el("camStamp1"),
    camStamp2: el("camStamp2"),
    health: el("health")
  };

  let retryTimer = null;

  function updateGlobalTheme(status) {
    if (!dom.app) return;

    dom.app.classList.remove("good", "bad", "warn");

    const s = String(status || "").toUpperCase();

    if (s === "ÅPEN") dom.app.classList.add("good");
    else if (s === "STENGT") dom.app.classList.add("bad");
    else dom.app.classList.add("warn");
  }

  function fmtTime(iso) {
    try {
      if (!iso) return "--:--";
      const d = new Date(iso);
      return d.toLocaleTimeString("no-NO", { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "--:--";
    }
  }

  function escHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function escHtmlWithBreaks(s) {
    return escHtml(s).replace(/\n/g, "<br>");
  }

  function severityClass(sevRaw) {
    const sev = String(sevRaw || "").toLowerCase();

    // DATEX typiske verdier: none, low, high, highest, unknown
    if (sev === "highest" || sev === "high") return "bad";
    if (sev === "low") return "warn";
    return "info";
  }

  function statusPillText(statusRaw) {
    const s = String(statusRaw || "").toUpperCase();
    if (s === "ÅPEN") return "FRI FLYT";
    if (s === "STENGT") return "STENGT";
    if (s === "AVVIK") return "AVVIK";
    return "SJEKK STATUS";
  }

  async function load() {
    try {
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }

      const response = await fetch(CONFIG.api, { cache: "no-store" });
      if (!response.ok) throw new Error(`Status ${response.status}`);

      const data = await response.json();

      const by = data.byfjord || {};
      const events = data.stavanger?.messages || [];
      const status = String(by.status || "UKJENT").toUpperCase();

      updateGlobalTheme(status);

      if (dom.statusText) dom.statusText.textContent = status;
      if (dom.statusReason) dom.statusReason.textContent = by.reason || "Ingen spesielle merknader.";
      if (dom.pill) dom.pill.textContent = statusPillText(status);

      const timeStr = fmtTime(data.updated || by.updated);
      if (dom.updated) dom.updated.textContent = "Oppdatert: " + timeStr;
      if (dom.camStamp1) dom.camStamp1.textContent = timeStr;
      if (dom.camStamp2) dom.camStamp2.textContent = timeStr;

      // Kamera er tomt inntil eget kamera endepunkt er på plass
      const bust = Date.now();

      if (dom.cam1) {
        const url = by?.cameras?.retningByfjordtunnelen?.image;
        if (url) dom.cam1.src = url + (url.includes("?") ? "&" : "?") + "t=" + bust;
      }

      if (dom.cam2) {
        const url = by?.cameras?.retningStavanger?.image;
        if (url) dom.cam2.src = url + (url.includes("?") ? "&" : "?") + "t=" + bust;
      }

      if (dom.items) {
        if (!events.length) {
          dom.items.innerHTML = `<div class="skeleton">Ingen aktive hendelser i Stavanger.</div>`;
        } else {
          dom.items.innerHTML = events
            .map((m) => {
              const cls = severityClass(m.severity);
              const title = escHtml(m.title);
              const text = escHtmlWithBreaks(m.text);
              return `
                <div class="item ${cls}">
                  <div class="badge"></div>
                  <div class="itemMain">
                    <div class="itemTitle">${title}</div>
                    <div class="itemText">${text}</div>
                  </div>
                </div>
              `;
            })
            .join("");
        }
      }

      if (dom.health) dom.health.textContent = "System status: OK";
    } catch (err) {
      console.error("Fetch error:", err);

      updateGlobalTheme("FEIL");
      if (dom.statusText) dom.statusText.textContent = "KOBLINGSFEIL";
      if (dom.statusReason) {
        dom.statusReason.textContent =
          "Kunne ikke hente data (API feil: " + (err?.message || err) + "). Forsøker igjen snart.";
      }
      if (dom.pill) dom.pill.textContent = "OFFLINE";
      if (dom.health) dom.health.textContent = "Sjekk internett eller API status";

      if (!retryTimer) {
        retryTimer = setTimeout(() => {
          retryTimer = null;
          load();
        }, CONFIG.retryAfterErrorMs);
      }
    }
  }

  function tick() {
    if (!dom.clock) return;
    dom.clock.textContent = new Date().toLocaleTimeString("no-NO", {
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  tick();
  setInterval(tick, CONFIG.clockRateMs);
  load();
  setInterval(load, CONFIG.refreshRateMs);
})();
