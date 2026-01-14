(() => {
  const el = (id) => document.getElementById(id);

  const CONFIG = {
    api: "/api/combined?region=stavanger",
    refreshRate: 60000,
    clockRate: 1000
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

  function esc(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  async function load() {
    try {
      const response = await fetch(CONFIG.api, { cache: "no-store" });
      if (!response.ok) throw new Error(`Status ${response.status}`);

      const data = await response.json();
      const by = data.byfjord || {};
      const events = data.stavanger?.messages || [];
      const status = String(by.status || "UKJENT").toUpperCase();

      updateGlobalTheme(status);

      if (dom.statusText) dom.statusText.textContent = status;
      if (dom.statusReason) dom.statusReason.textContent = by.reason || "Ingen spesielle merknader.";

      if (dom.pill) {
        dom.pill.textContent =
          status === "ÅPEN" ? "FRI FLYT" :
          status === "STENGT" ? "STENGT" :
          status === "AVVIK" ? "AVVIK" : "SJEKK STATUS";
      }

      const updatedStr = fmtTime(data.updated || by.updated);
      if (dom.updated) dom.updated.textContent = "Oppdatert: " + updatedStr;

      const cam1Updated = by?.cameras?.retningByfjordtunnelen?.updated;
      const cam2Updated = by?.cameras?.retningStavanger?.updated;
      if (dom.camStamp1) dom.camStamp1.textContent = fmtTime(cam1Updated || data.updated || by.updated);
      if (dom.camStamp2) dom.camStamp2.textContent = fmtTime(cam2Updated || data.updated || by.updated);

      const bust = Date.now();
      const cam1Url = by?.cameras?.retningByfjordtunnelen?.image;
      const cam2Url = by?.cameras?.retningStavanger?.image;
      if (dom.cam1 && cam1Url) dom.cam1.src = cam1Url + "?t=" + bust;
      if (dom.cam2 && cam2Url) dom.cam2.src = cam2Url + "?t=" + bust;

      if (dom.items) {
        if (!events.length) {
          dom.items.innerHTML = `<div class="skeleton">Ingen hendelser registrert</div>`;
        } else {
          dom.items.innerHTML = events.map(m => {
            const sev = String(m.severity || "").toUpperCase();
            const cls = (sev === "STENGT") ? "bad" : (["ULYKKE", "VEIARBEID", "VÆR"].includes(sev) ? "warn" : "info");
            return `
              <div class="item ${cls}">
                <div class="badge"></div>
                <div class="itemMain">
                  <div class="itemTitle">${esc(m.title)}</div>
                  <div class="itemText">${esc(m.text)}</div>
                </div>
              </div>`;
          }).join("");
        }
      }

      if (dom.health) dom.health.textContent = "System status: OK";
    } catch (err) {
      updateGlobalTheme("FEIL");
      if (dom.statusText) dom.statusText.textContent = "KOBLINGSFEIL";
      if (dom.statusReason) dom.statusReason.textContent =
        "Kunne ikke hente data (API feil: " + (err?.message || err) + "). Prøver igjen automatisk.";
      if (dom.pill) dom.pill.textContent = "OFFLINE";
      if (dom.health) dom.health.textContent = "Sjekk internett / API-status";
    }
  }

  function tick() {
    if (dom.clock) {
      dom.clock.textContent = new Date().toLocaleTimeString("no-NO", { hour: "2-digit", minute: "2-digit" });
    }
  }

  tick();
  setInterval(tick, CONFIG.clockRate);
  load();
  setInterval(load, CONFIG.refreshRate);
})();
