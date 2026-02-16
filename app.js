(() => {
  const el = (id) => document.getElementById(id);

  const CONFIG = {
    api: "/api/combined?region=stavanger",
    weatherApi: "https://api.met.no/weatherapi/locationforecast/2.0/compact",
    weatherLat: 59.0369,
    weatherLon: 5.7331,
    refreshRate: 60000,
    clockRate: 1000,
    camRefreshRate: 30000,
    weatherRefreshRate: 600000,
    retryDelay: 5000,
    maxRetries: 3
  };

  // Complete list of tunnels in Stavanger region that can be closed
  const TUNNELS = {
    byfjord: {
      name: "Byfjordtunnelen",
      shortName: "Byfjord",
      keywords: ["byfjord"],
      length: 5875,
      camLabels: {
        nord: "Mot Byfjord / Rennesøy",
        sor: "Mot Stavanger sentrum"
      }
    },
    mastrafjord: {
      name: "Mastrafjordtunnelen",
      shortName: "Mastrafjord",
      keywords: ["mastrafjord", "mastra"],
      length: 4424,
      camLabels: {
        nord: "Mot Rennesøy",
        sor: "Mot Stavanger"
      }
    },
    eiganes: {
      name: "Eiganestunnelen",
      shortName: "Eiganes",
      keywords: ["eiganes"],
      length: 3174,
      camLabels: {
        nord: "Mot nord",
        sor: "Mot sør"
      }
    },
    sotrasambandet: {
      name: "Sotrasambandet",
      shortName: "Sotra",
      keywords: ["sotra", "sotrasambandet", "sotratunnelen"],
      length: 0,
      camLabels: {
        nord: "Mot Sotra",
        sor: "Mot Stavanger"
      }
    },
    hundvagtunnelen: {
      name: "Hundvågtunnelen",
      shortName: "Hundvåg",
      keywords: ["hundvåg", "hundvaag"],
      length: 2100,
      camLabels: {
        nord: "Mot nord",
        sor: "Mot sør"
      }
    },
    ryfast: {
      name: "Ryfylketunnelen (Ryfast)",
      shortName: "Ryfast",
      keywords: ["ryfast", "ryfylke"],
      length: 14300,
      camLabels: {
        nord: "Mot Ryfylke",
        sor: "Mot Stavanger"
      }
    },
    solbakk: {
      name: "Solbakktunnelen",
      shortName: "Solbakk",
      keywords: ["solbakk"],
      length: 1350,
      camLabels: {
        nord: "Mot nord",
        sor: "Mot sør"
      }
    },
    storhaug: {
      name: "Storhaugtunnelen",
      shortName: "Storhaug",
      keywords: ["storhaug"],
      length: 1100,
      camLabels: {
        nord: "Mot nord",
        sor: "Mot sør"
      }
    }
  };

  const STATE = {
    retryCount: 0,
    lastSuccessfulUpdate: null,
    camsVisible: true,
    isRefreshing: false,
    currentTunnel: "byfjord",
    isFullscreen: false,
    tunnelStatuses: {}
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
    camLabel1: el("camLabel1"),
    camLabel2: el("camLabel2"),
    camStamp1: el("camStamp1"),
    camStamp2: el("camStamp2"),
    camLoader1: el("camLoader1"),
    camLoader2: el("camLoader2"),
    health: el("health"),
    refreshBtn: el("refreshBtn"),
    refreshText: el("refreshText"),
    toggleCams: el("toggleCams"),
    camToggleText: el("camToggleText"),
    travelTime: el("travelTime"),
    travelTimeText: el("travelTimeText"),
    eventCount: el("eventCount"),
    weather: el("weather"),
    weatherText: el("weatherText"),
    fullscreenBtn: el("fullscreenBtn"),
    fullscreenIcon: el("fullscreenIcon"),
    tunnelGrid: el("tunnelGrid"),
    tunnelName: el("tunnelName")
  };

  // Initialize tunnel statuses
  Object.keys(TUNNELS).forEach(key => {
    STATE.tunnelStatuses[key] = "ÅPEN";
  });

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

  // Weather fetching
  async function loadWeather() {
    try {
      const response = await fetch(
        `${CONFIG.weatherApi}?lat=${CONFIG.weatherLat}&lon=${CONFIG.weatherLon}`,
        {
          headers: {
            'User-Agent': 'Byfjordtunnelen/2.0 (trafikkmeldinger.pages.dev)'
          }
        }
      );

      if (!response.ok) throw new Error(`Weather API ${response.status}`);

      const data = await response.json();
      const current = data.properties?.timeseries?.[0];
      
      if (current?.data?.instant?.details) {
        const temp = current.data.instant.details.air_temperature;
        if (dom.weatherText) {
          dom.weatherText.textContent = `${Math.round(temp)}°C`;
        }
        if (dom.weather) {
          dom.weather.style.display = "flex";
        }
      }
    } catch (err) {
      console.error("Weather fetch error:", err);
      if (dom.weather) {
        dom.weather.style.display = "none";
      }
    }
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

  // Update camera labels
  function updateCameraLabels() {
    const tunnel = TUNNELS[STATE.currentTunnel];
    if (tunnel && dom.camLabel1 && dom.camLabel2) {
      dom.camLabel1.textContent = tunnel.camLabels.nord;
      dom.camLabel2.textContent = tunnel.camLabels.sor;
    }
  }

  // Update Health Indicator
  function updateHealth(isHealthy, message) {
    if (dom.health) {
      dom.health.innerHTML = `<span class="healthDot ${isHealthy ? 'healthy' : 'unhealthy'}"></span>${message || 'System status: OK'}`;
    }
  }

  // Render tunnel grid
  function renderTunnelGrid() {
    if (!dom.tunnelGrid) return;

    const html = Object.entries(TUNNELS).map(([key, tunnel]) => {
      const status = STATE.tunnelStatuses[key] || "ÅPEN";
      const statusClass = 
        status === "ÅPEN" ? "status-open" :
        status === "STENGT" ? "status-closed" :
        "status-warning";
      
      const isActive = key === STATE.currentTunnel;

      return `
        <button class="tunnelCard ${isActive ? 'active' : ''}" data-tunnel="${key}">
          <div class="tunnelCardStatus ${statusClass}"></div>
          <div class="tunnelCardName">${tunnel.shortName}</div>
        </button>
      `;
    }).join("");

    dom.tunnelGrid.innerHTML = html;

    // Add click handlers
    document.querySelectorAll('.tunnelCard').forEach(card => {
      card.addEventListener('click', () => {
        selectTunnel(card.dataset.tunnel);
      });
    });
  }

  // Check if message is relevant to tunnel
  function isRelevantToTunnel(message, tunnelKey) {
    const tunnel = TUNNELS[tunnelKey];
    if (!tunnel) return false;

    const text = `${message.title || ""} ${message.text || ""} ${message.where || ""}`.toLowerCase();
    return tunnel.keywords.some(keyword => text.includes(keyword));
  }

  // Determine tunnel status from messages
  function determineTunnelStatus(messages, tunnelKey) {
    const relevantMessages = messages.filter(msg => isRelevantToTunnel(msg, tunnelKey));
    
    if (relevantMessages.length === 0) return "ÅPEN";

    for (const msg of relevantMessages) {
      const txt = `${msg.title} ${msg.text}`.toLowerCase();
      if (/stengt|tunnel stengt|closed|closure/.test(txt)) {
        return "STENGT";
      }
    }

    for (const msg of relevantMessages) {
      const txt = `${msg.title} ${msg.text}`.toLowerCase();
      if (/kolonne|stans|omkjøring|lysregulering|dirigering|redusert|kø|ulykke/.test(txt)) {
        return "AVVIK";
      }
    }

    return "ÅPEN";
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
      
      STATE.retryCount = 0;
      STATE.lastSuccessfulUpdate = new Date();

      const events = data.stavanger?.messages || [];

      // Update all tunnel statuses
      Object.keys(TUNNELS).forEach(tunnelKey => {
        STATE.tunnelStatuses[tunnelKey] = determineTunnelStatus(events, tunnelKey);
      });

      // Render tunnel grid with updated statuses
      renderTunnelGrid();

      // Get current tunnel status
      const currentStatus = STATE.tunnelStatuses[STATE.currentTunnel];
      const currentTunnelMessages = events.filter(msg => 
        isRelevantToTunnel(msg, STATE.currentTunnel)
      );

      updateGlobalTheme(currentStatus);

      if (dom.statusText) {
        dom.statusText.textContent = currentStatus;
        dom.statusText.classList.add("statusUpdate");
        setTimeout(() => dom.statusText.classList.remove("statusUpdate"), 600);
      }
      
      if (dom.statusReason) {
        const reason = currentTunnelMessages.length > 0 
          ? (currentTunnelMessages[0].text || currentTunnelMessages[0].title)
          : "Ingen spesielle merknader.";
        dom.statusReason.textContent = reason;
      }

      if (dom.pill) {
        dom.pill.textContent =
          currentStatus === "ÅPEN" ? "FRI FLYT" :
          currentStatus === "STENGT" ? "STENGT" :
          currentStatus === "AVVIK" ? "AVVIK" : "SJEKK STATUS";
      }

      // Show travel time
      if (currentStatus === "ÅPEN" && dom.travelTime) {
        dom.travelTime.style.display = "flex";
        const tunnel = TUNNELS[STATE.currentTunnel];
        const minutes = Math.ceil(tunnel.length / 1000);
        if (dom.travelTimeText) {
          dom.travelTimeText.textContent = `~${minutes} min`;
        }
      } else if (dom.travelTime) {
        dom.travelTime.style.display = "none";
      }

      const updatedStr = fmtTime(data.updated);
      const relativeStr = fmtRelativeTime(data.updated);
      
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

      // Process ALL traffic events (not just tunnel-specific)
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

  // Fullscreen Toggle
  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => {
        STATE.isFullscreen = true;
        if (dom.fullscreenIcon) {
          dom.fullscreenIcon.innerHTML = '<path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/>';
        }
      }).catch(err => {
        console.error('Fullscreen error:', err);
      });
    } else {
      document.exitFullscreen().then(() => {
        STATE.isFullscreen = false;
        if (dom.fullscreenIcon) {
          dom.fullscreenIcon.innerHTML = '<path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>';
        }
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

  // Tunnel Selection
  function selectTunnel(tunnelKey) {
    STATE.currentTunnel = tunnelKey;
    
    const tunnel = TUNNELS[tunnelKey];
    if (tunnel && dom.tunnelName) {
      dom.tunnelName.textContent = tunnel.name;
    }
    
    updateCameraLabels();
    renderTunnelGrid();
    load(true);
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

  if (dom.fullscreenBtn) {
    dom.fullscreenBtn.addEventListener("click", toggleFullscreen);
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
    if (e.key === "f" && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      toggleFullscreen();
    }
  });

  document.addEventListener('fullscreenchange', () => {
    STATE.isFullscreen = !!document.fullscreenElement;
  });

  // Initialize
  tick();
  setInterval(tick, CONFIG.clockRate);

  renderTunnelGrid();
  setCameraSources();
  updateCameraLabels();
  setInterval(setCameraSources, CONFIG.camRefreshRate);

  load();
  setInterval(load, CONFIG.refreshRate);

  loadWeather();
  setInterval(loadWeather, CONFIG.weatherRefreshRate);

  setInterval(() => {
    if (STATE.lastSuccessfulUpdate && dom.updated) {
      const relativeStr = fmtRelativeTime(STATE.lastSuccessfulUpdate);
      dom.updated.title = relativeStr;
    }
  }, 60000);

  // Optimize for display size
  function optimizeForDisplay() {
    const width = window.innerWidth;
    
    if (width >= 1920 && width < 2560) {
      document.documentElement.style.setProperty('--detected-display', '1080p');
    } else if (width >= 2560) {
      document.documentElement.style.setProperty('--detected-display', 'uhd');
    }
  }
  
  optimizeForDisplay();
  window.addEventListener('resize', optimizeForDisplay);
})();
