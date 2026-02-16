(() => {
  const el = (id) => document.getElementById(id);

  const CONFIG = {
    api: "/api/combined?region=stavanger",
    refreshRate: 60000,
    clockRate: 1000,
    camRefreshRate: 30000,
    retryDelay: 5000,
    maxRetries: 3
  };

  const STATE = {
    retryCount: 0,
    lastSuccessfulUpdate: null,
    camsVisible: true,
    isRefreshing: false
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
    camLoader1: el("camLoader1"),
    camLoader2: el("camLoader2"),
    health: el("health"),
    healthDot: document.querySelector(".healthDot"),
    refreshBtn: el("refreshBtn"),
    refreshText: el("refreshText"),
    toggleCams: el("toggleCams"),
    camToggleText: el("camToggleText"),
    travelTime: el("travelTime"),
    travelTimeText: el("travelTimeText"),
    eventCount: el("eventCount")
  };

  // Theme Management
  function updateGlobalTheme(status) {
    if (!dom.app) return;
    dom.app.classList.remove("good", "bad", "warn", "loading");

    const s = String(status || "").toUpperCase();
    if (s === "ÅPEN") {
      dom.app.classList.add("good");
    } else if (s === "STENGT") {
      dom.app.classList.add("bad");
    } else if (s === "HENTER...") {
      dom.app.classList.add("loading");
    } else {
      dom.app.classList.add("warn");
    }
  }

  // Time Formatting
  function fmtTime(iso) {
    try {
      if (!iso) return "--:--";
      const d = new Date(iso);
      return d.toLocaleTimeString("no-NO", { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "--:--";
    }
  }

  function fmtRelativeTime(iso) {
    try {
      if (!iso) return "";
      const d = new Date(iso);
      const now = new Date();
      const diffMs = now - d;
      const diffMin = Math.floor(diffMs / 60000);
      
      if (diffMin < 1) return "akkurat nå";
      if (diffMin === 1) return "1 minutt siden";
      if (diffMin < 60) return `${diffMin} minutter siden`;
      
      const diffHours = Math.floor(diffMin / 60);
      if (diffHours === 1) return "1 time siden";
      if (diffHours < 24) return `${diffHours} timer siden`;
      
      return fmtTime(iso);
    } catch {
      return "";
    }
  }

  // HTML Escaping
  function esc(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  // Camera Management
  function setCameraSources() {
    const bust = Date.now();

    if (dom.cam1) {
      if (dom.camLoader1) dom.camLoader1.style.display = "flex";
      dom.cam1.src = `/api/cam?id=nord&t=${bust}`;
      dom.cam1.onload = () => {
        if (dom.camLoader1) dom.camLoader1.style.display = "none";
      };
      dom.cam1.onerror = () => {
        if (dom.camLoader1) dom.camLoader1.style.display = "none";
        dom.cam1.removeAttribute("src");
        dom.cam1.alt = "Kamera utilgjengelig";
      };
    }

    if (dom.cam2) {
      if (dom.camLoader2) dom.camLoader2.style.display = "flex";
      dom.cam2.src = `/api/cam?id=sor&t=${bust}`;
      dom.cam2.onload = () => {
        if (dom.camLoader2) dom.camLoader2.style.display = "none";
      };
      dom.cam2.onerror = () => {
        if (dom.camLoader2) dom.camLoader2.style.display = "none";
        dom.cam2.removeAttribute("src");
        dom.cam2.alt = "Kamera utilgjengelig";
      };
    }
  }

  // Update Health Indicator
  function updateHealth(isHealthy, message) {
    if (dom.health) {
      dom.health.innerHTML = `<span class="healthDot ${isHealthy ? 'healthy' : 'unhealthy'}"></span>${message || 'System status: OK'}`;
    }
  }

  // Main Data Loading Function
  async function load(isManual = false) {
    if (STATE.isRefreshing && !isManual) return;
    
    STATE.isRefreshing = true;
    
    if (isManual && dom.refreshBtn) {
      dom.refreshBtn.classList.add("refreshing");
      if (dom.refreshText) dom.refreshText.textContent = "Oppdaterer...";
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(CONFIG.api, { 
        cache: "no-store",
        signal: controller.signal 
      });
      
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      
      // Reset retry count on success
      STATE.retryCount = 0;
      STATE.lastSuccessfulUpdate = new Date();

      // Process tunnel status
      const by = data.byfjord || {};
      const events = data.stavanger?.messages || [];
      const status = String(by.status || "UKJENT").toUpperCase();

      updateGlobalTheme(status);

      if (dom.statusText) {
        dom.statusText.textContent = status;
        dom.statusText.classList.add("statusUpdate");
        setTimeout(() => dom.statusText.classList.remove("statusUpdate"), 600);
      }
      
      if (dom.statusReason) {
        dom.statusReason.textContent = by.reason || "Ingen spesielle merknader.";
      }

      if (dom.pill) {
        dom.pill.textContent =
          status === "ÅPEN" ? "FRI FLYT" :
          status === "STENGT" ? "STENGT" :
          status === "AVVIK" ? "AVVIK" : "SJEKK STATUS";
      }

      // Show travel time if available (mock for now)
      if (status === "ÅPEN" && dom.travelTime) {
        dom.travelTime.style.display = "flex";
        if (dom.travelTimeText) dom.travelTimeText.textContent = "~3 min";
      } else if (dom.travelTime) {
        dom.travelTime.style.display = "none";
      }

      const updatedStr = fmtTime(data.updated || by.updated);
      const relativeStr = fmtRelativeTime(data.updated || by.updated);
      
      if (dom.updated) {
        dom.updated.textContent = `Oppdatert: ${updatedStr}`;
        dom.updated.title = relativeStr;
      }

      if (dom.camStamp1) dom.camStamp1.textContent = updatedStr;
      if (dom.camStamp2) dom.camStamp2.textContent = updatedStr;

      // Update event count
      if (dom.eventCount) {
        const count = events.length;
        dom.eventCount.textContent = count > 0 
          ? `${count} ${count === 1 ? 'hendelse' : 'hendelser'}`
          : 'Ingen hendelser';
      }

      // Process traffic events
      if (dom.items) {
        if (!events.length) {
          dom.items.innerHTML = `
            <div class="emptyState">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M9 11l3 3L22 4"/>
                <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
              </svg>
              <div>Ingen aktive hendelser</div>
              <div class="emptyStateText">Alle veier i Stavanger-regionen er åpne</div>
            </div>`;
        } else {
          dom.items.innerHTML = events.map((m, index) => {
            const sev = String(m.severity || "").toUpperCase();
            const cls =
              sev === "HIGH" || sev === "HIGHEST" ? "bad" :
              sev === "MEDIUM" ? "warn" : "info";

            const severityIcon = 
              sev === "HIGH" || sev === "HIGHEST" ? 
                `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/>
                  <line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>` :
              sev === "MEDIUM" ?
                `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>` :
                `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="16" x2="12" y2="12"/>
                  <line x1="12" y1="8" x2="12.01" y2="8"/>
                </svg>`;

            const whereLine = m.where ? `<div class="itemWhere">${esc(m.where)}</div>` : "";

            return `
              <div class="item ${cls}" style="animation-delay: ${index * 0.1}s">
                <div class="itemIcon">${severityIcon}</div>
                <div class="itemMain">
                  <div class="itemTitle">${esc(m.title)}</div>
                  ${whereLine}
                  <div class="itemText">${esc(m.text)}</div>
                </div>
              </div>`;
          }).join("");
        }
      }

      updateHealth(true, "System status: OK");

    } catch (err) {
      STATE.retryCount++;
      
      console.error("Data fetch error:", err);
      
      const isTimeout = err.name === "AbortError";
      const errorMsg = isTimeout 
        ? "Tidsavbrudd ved henting av data"
        : `API feil: ${err?.message || err}`;

      if (STATE.retryCount < CONFIG.maxRetries) {
        updateHealth(false, `Kobler til på nytt... (${STATE.retryCount}/${CONFIG.maxRetries})`);
        setTimeout(() => load(), CONFIG.retryDelay);
      } else {
        updateGlobalTheme("FEIL");
        
        if (dom.statusText) dom.statusText.textContent = "KOBLINGSFEIL";
        if (dom.statusReason) {
          dom.statusReason.textContent = `${errorMsg}. Forsøker igjen snart.`;
        }
        if (dom.pill) dom.pill.textContent = "OFFLINE";
        
        updateHealth(false, "Ingen forbindelse til API");
        
        // Reset retry count after some time
        setTimeout(() => { STATE.retryCount = 0; }, 30000);
      }
    } finally {
      STATE.isRefreshing = false;
      
      if (dom.refreshBtn) {
        dom.refreshBtn.classList.remove("refreshing");
        if (dom.refreshText) dom.refreshText.textContent = "Oppdater";
      }
    }
  }

  // Clock Update
  function tick() {
    if (dom.clock) {
      const now = new Date();
      dom.clock.textContent = now.toLocaleTimeString("no-NO", { 
        hour: "2-digit", 
        minute: "2-digit",
        second: "2-digit"
      });
    }
  }

  // Camera Toggle
  function toggleCameras() {
    STATE.camsVisible = !STATE.camsVisible;
    const camsElement = document.querySelector(".cams");
    
    if (camsElement) {
      if (STATE.camsVisible) {
        camsElement.style.display = "grid";
        if (dom.camToggleText) dom.camToggleText.textContent = "Skjul kameraer";
      } else {
        camsElement.style.display = "none";
        if (dom.camToggleText) dom.camToggleText.textContent = "Vis kameraer";
      }
    }
  }

  // Event Listeners
  if (dom.refreshBtn) {
    dom.refreshBtn.addEventListener("click", () => {
      load(true);
      setCameraSources();
    });
  }

  if (dom.toggleCams) {
    dom.toggleCams.addEventListener("click", toggleCameras);
  }

  // Keyboard shortcuts
  document.addEventListener("keydown", (e) => {
    if (e.key === "r" && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      load(true);
    }
    if (e.key === "c" && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      toggleCameras();
    }
  });

  // Initialize
  tick();
  setInterval(tick, CONFIG.clockRate);

  setCameraSources();
  setInterval(setCameraSources, CONFIG.camRefreshRate);

  load();
  setInterval(load, CONFIG.refreshRate);

  // Update relative time every minute
  setInterval(() => {
    if (STATE.lastSuccessfulUpdate && dom.updated) {
      const relativeStr = fmtRelativeTime(STATE.lastSuccessfulUpdate);
      dom.updated.title = relativeStr;
    }
  }, 60000);
})();
