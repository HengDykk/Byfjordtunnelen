(() => {
  // --- Hjelpefunksjon for DOM ---
  const el = (id) => document.getElementById(id);

  // --- Konfigurasjon ---
  const CONFIG = {
    api: "https://byfjordtunnelen.arild-dahl-andersen.workers.dev/api/combined",
    refreshRate: 60000, // 60 sekunder
    clockRate: 1000
  };

  // --- DOM Referanser ---
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

  // --- Tema-styring ---
  function updateGlobalTheme(status) {
    if (!dom.app) return;
    
    // Fjern eksisterende statusklasser
    dom.app.classList.remove("good", "bad", "warn");
    
    const s = String(status || "").toUpperCase();
    
    if (s === "ÅPEN") {
      dom.app.classList.add("good");
    } else if (s === "STENGT") {
      dom.app.classList.add("bad");
    } else {
      // Fail-safe: "AVVIK", "UKJENT", "FEIL" eller nettverksproblemer blir GULT
      dom.app.classList.add("warn");
    }
  }

  // --- Formatering ---
  function fmtTime(iso) {
    try {
      if (!iso) return "--:--";
      const d = new Date(iso);
      return d.toLocaleTimeString("no-NO", { hour: "2-digit", minute: "2-digit" });
    } catch { return "--:--"; }
  }

  function esc(s) {
    return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // --- Datauthenting ---
  async function load() {
    try {
      const response = await fetch(CONFIG.api, { cache: "no-store" });
      
      // Håndter HTTP-feil (som 503 Service Unavailable)
      if (!response.ok) throw new Error(`Status ${response.status}`);
      
      const data = await response.json();
      const by = data.byfjord || {};
      const events = data.stavanger?.messages || [];
      const status = (by.status || "UKJENT").toUpperCase();

      // 1. Oppdater Hovedstatus og Tema
      updateGlobalTheme(status);
      if (dom.statusText) dom.statusText.textContent = status;
      if (dom.statusReason) dom.statusReason.textContent = by.reason || "Ingen spesielle merknader.";
      
      if (dom.pill) {
        dom.pill.textContent = 
          status === "ÅPEN" ? "FRI FLYT" : 
          status === "STENGT" ? "STENGT" : 
          status === "AVVIK" ? "AVVIK" : "SJEKK STATUS";
      }

      // 2. Oppdater Tider
      const timeStr = fmtTime(data.updated || by.updated);
      if (dom.updated) dom.updated.textContent = "Oppdatert: " + timeStr;
      if (dom.camStamp1) dom.camStamp1.textContent = timeStr;
      if (dom.camStamp2) dom.camStamp2.textContent = timeStr;

      // 3. Oppdater Kamera (med cache-busting)
      const bust = Date.now();
      if (dom.cam1) {
        const url = by?.cameras?.retningByfjordtunnelen?.image || "img/byfjord";
        dom.cam1.src = (url.startsWith('http') ? url : CONFIG.api.replace('/api/combined', url)) + "?t=" + bust;
      }
      if (dom.cam2) {
        const url = by?.cameras?.retningStavanger?.image || "img/stavanger";
        dom.cam2.src = (url.startsWith('http') ? url : CONFIG.api.replace('/api/combined', url)) + "?t=" + bust;
      }

      // 4. Oppdater Hendelsesliste
      if (dom.items) {
        if (!events.length) {
          dom.items.innerHTML = `<div class="skeleton">Ingen aktive hendelser i Stavanger.</div>`;
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
      console.error("Fetch error:", err);
      
      // --- FAIL-SAFE MODUS ---
      updateGlobalTheme("FEIL"); // Setter alt til GULT
      if (dom.statusText) dom.statusText.textContent = "KOBLINGSFEIL";
      if (dom.statusReason) dom.statusReason.textContent = "Kunne ikke hente data (API feil: " + err.message + "). Forsøker igjen om 20s.";
      if (dom.pill) dom.pill.textContent = "OFFLINE";
      if (dom.health) dom.health.textContent = "Sjekk internett / API-status";
    }
  }

  // --- Klokke ---
  function tick() {
    if (dom.clock) {
      dom.clock.textContent = new Date().toLocaleTimeString("no-NO", {
        hour: "2-digit",
        minute: "2-digit"
      });
    }
  }

  // Start
  tick();
  setInterval(tick, 1000);
  load();
  setInterval(load, CONFIG.refreshRate);
})();