// AIOKA content script — injects a floating signal panel on TradingView pages.
// The panel is isolated from TradingView's DOM styles via a unique id prefix
// and `all: initial` on the panel root (see styles.css).

(() => {
  if (window.__aiokaPanelInjected) return;
  window.__aiokaPanelInjected = true;

  const VERDICT_CLASS = {
    STRONG_BUY: "aioka-verdict-strong-buy",
    BUY: "aioka-verdict-buy",
    ACCUMULATE: "aioka-verdict-accumulate",
    HOLD: "aioka-verdict-hold",
    REDUCE: "aioka-verdict-reduce",
    SELL: "aioka-verdict-sell",
    STRONG_SELL: "aioka-verdict-strong-sell",
    PENDING: "aioka-verdict-pending"
  };

  const GHOST_CLASS = {
    IN_POSITION: "aioka-ghost-in-position",
    READY: "aioka-ghost-ready",
    WAITING: "aioka-ghost-waiting"
  };

  function fmtAge(ts) {
    if (!ts) return "—";
    const ageMs = Date.now() - ts;
    const s = Math.max(0, Math.round(ageMs / 1000));
    if (s < 60) return `${s}s ago`;
    const m = Math.round(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.round(m / 60);
    return `${h}h ago`;
  }

  function fmtPrice(value) {
    if (value === null || value === undefined || isNaN(value)) return "—";
    if (value >= 1000) {
      return "$" + Math.round(value).toLocaleString("en-US");
    }
    return "$" + Number(value).toFixed(2);
  }

  function buildPanel() {
    const wrap = document.createElement("div");
    wrap.id = "aioka-panel-root";
    wrap.innerHTML = `
      <div id="aioka-panel" class="aioka-panel" role="complementary" aria-label="AIOKA signal">
        <div class="aioka-header" id="aioka-drag-handle">
          <span class="aioka-title">
            <span class="aioka-ghost">&#128123;</span>
            <span class="aioka-brand">AIOKA</span>
          </span>
          <span class="aioka-status">
            <span class="aioka-dot" id="aioka-live-dot"></span>
            <span id="aioka-live-label">LIVE</span>
          </span>
          <button class="aioka-btn-icon" id="aioka-minimize" type="button" title="Minimize">&minus;</button>
        </div>

        <div class="aioka-body" id="aioka-body">
          <div class="aioka-verdict-row">
            <div class="aioka-verdict" id="aioka-verdict">PENDING</div>
            <div class="aioka-conf" id="aioka-confidence">—</div>
          </div>

          <div class="aioka-metrics">
            <div class="aioka-metric">
              <span class="aioka-metric-label">BTC</span>
              <span class="aioka-metric-value" id="aioka-btc">—</span>
            </div>
            <div class="aioka-metric">
              <span class="aioka-metric-label">Regime</span>
              <span class="aioka-metric-value" id="aioka-regime">—</span>
            </div>
            <div class="aioka-metric">
              <span class="aioka-metric-label">RSI</span>
              <span class="aioka-metric-value" id="aioka-rsi">—</span>
            </div>
            <div class="aioka-metric">
              <span class="aioka-metric-label">Dark Pool</span>
              <span class="aioka-metric-value" id="aioka-darkpool">—</span>
            </div>
            <div class="aioka-metric aioka-ghost-row">
              <span class="aioka-metric-label">Ghost</span>
              <span class="aioka-metric-value aioka-ghost-pill" id="aioka-ghost">—</span>
            </div>
          </div>

          <div class="aioka-footer">
            <span id="aioka-updated">Waiting…</span>
            <button class="aioka-refresh" id="aioka-refresh" type="button" title="Refresh now">&#8634;</button>
          </div>
        </div>

        <div class="aioka-body aioka-setup" id="aioka-setup" style="display:none;">
          <div class="aioka-setup-title">API key required</div>
          <div class="aioka-setup-body">
            Open extension settings and paste your AIOKA API key to see live signals.
          </div>
          <button class="aioka-btn-primary" id="aioka-open-settings" type="button">Open Settings</button>
        </div>
      </div>

      <button id="aioka-minimized" class="aioka-minimized" type="button" title="Show AIOKA panel">
        <span class="aioka-ghost">&#128123;</span>
      </button>
    `;
    return wrap;
  }

  function render(state) {
    const { signal, error, lastSignalAt } = state;
    const panel = document.getElementById("aioka-panel");
    const setup = document.getElementById("aioka-setup");
    const body = document.getElementById("aioka-body");
    if (!panel) return;

    if (error === "NO_API_KEY" || error === "INVALID_KEY") {
      body.style.display = "none";
      setup.style.display = "block";
      const title = setup.querySelector(".aioka-setup-title");
      if (title) title.textContent = error === "INVALID_KEY" ? "Invalid API key" : "API key required";
      return;
    }

    setup.style.display = "none";
    body.style.display = "block";

    const verdict = (signal && signal.verdict) || "PENDING";
    const confidence = signal && typeof signal.confidence === "number"
      ? `${signal.confidence.toFixed(1)}%`
      : "—";
    const regime = (signal && signal.regime) || "—";
    const rsi = signal && typeof signal.rsi === "number" ? signal.rsi.toFixed(1) : "—";
    const darkPool = signal && typeof signal.dark_pool === "number" ? `${Math.round(signal.dark_pool)}/100` : "—";
    const btcPrice = signal && typeof signal.btc_price === "number" ? fmtPrice(signal.btc_price) : "—";
    const ghostStatus = (signal && signal.ghost_status) || "UNKNOWN";

    const verdictEl = document.getElementById("aioka-verdict");
    verdictEl.textContent = verdict.replace(/_/g, " ");
    verdictEl.className = "aioka-verdict " + (VERDICT_CLASS[verdict] || "aioka-verdict-pending");

    document.getElementById("aioka-confidence").textContent = confidence;
    document.getElementById("aioka-btc").textContent = btcPrice;
    document.getElementById("aioka-regime").textContent = regime.replace(/_/g, " ");
    document.getElementById("aioka-rsi").textContent = rsi;
    document.getElementById("aioka-darkpool").textContent = darkPool;

    const ghostEl = document.getElementById("aioka-ghost");
    ghostEl.textContent = ghostStatus.replace(/_/g, " ");
    ghostEl.className = "aioka-metric-value aioka-ghost-pill " + (GHOST_CLASS[ghostStatus] || "");

    const updatedEl = document.getElementById("aioka-updated");
    if (error) {
      updatedEl.textContent = `Offline — last update ${fmtAge(lastSignalAt)}`;
      updatedEl.className = "aioka-updated-stale";
    } else {
      updatedEl.textContent = `Updated ${fmtAge(lastSignalAt)}`;
      updatedEl.className = "";
    }
  }

  async function hydrate() {
    try {
      const state = await chrome.storage.local.get([
        "lastSignal", "lastSignalAt", "lastError", "apiKey"
      ]);
      if (!state.apiKey) {
        render({ signal: null, error: "NO_API_KEY", lastSignalAt: null });
        return;
      }
      render({
        signal: state.lastSignal || null,
        error: state.lastError || null,
        lastSignalAt: state.lastSignalAt || null
      });
    } catch (err) {
      // Storage can be unavailable during extension updates; fail silently.
      console.debug("aioka_hydrate_failed", err);
    }
  }

  function setupDragging(panel, handle) {
    let dragging = false;
    let startX = 0, startY = 0, origRight = 24, origBottom = 24;

    function onMouseDown(e) {
      if (e.button !== 0) return;
      dragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const rect = panel.getBoundingClientRect();
      origRight = window.innerWidth - rect.right;
      origBottom = window.innerHeight - rect.bottom;
      e.preventDefault();
    }

    function onMouseMove(e) {
      if (!dragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const newRight = Math.max(0, Math.min(window.innerWidth - 100, origRight - dx));
      const newBottom = Math.max(0, Math.min(window.innerHeight - 40, origBottom - dy));
      panel.style.right = newRight + "px";
      panel.style.bottom = newBottom + "px";
      panel.style.left = "auto";
      panel.style.top = "auto";
    }

    function onMouseUp() {
      if (!dragging) return;
      dragging = false;
      try {
        chrome.storage.local.set({
          panelPos: { right: panel.style.right, bottom: panel.style.bottom }
        });
      } catch (_) { /* ignore */ }
    }

    handle.addEventListener("mousedown", onMouseDown);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }

  async function restorePosition(panel) {
    try {
      const { panelPos } = await chrome.storage.local.get("panelPos");
      if (panelPos && panelPos.right && panelPos.bottom) {
        panel.style.right = panelPos.right;
        panel.style.bottom = panelPos.bottom;
      }
    } catch (_) { /* ignore */ }
  }

  async function restoreMinimizedState(panel, minimizedBtn) {
    try {
      const { minimized } = await chrome.storage.local.get("minimized");
      if (minimized) {
        panel.style.display = "none";
        minimizedBtn.style.display = "flex";
      }
    } catch (_) { /* ignore */ }
  }

  function inject() {
    if (document.getElementById("aioka-panel-root")) return;
    const root = buildPanel();
    document.documentElement.appendChild(root);

    const panel = document.getElementById("aioka-panel");
    const minimizedBtn = document.getElementById("aioka-minimized");
    const handle = document.getElementById("aioka-drag-handle");

    setupDragging(panel, handle);
    restorePosition(panel);
    restoreMinimizedState(panel, minimizedBtn);

    document.getElementById("aioka-minimize").addEventListener("click", () => {
      panel.style.display = "none";
      minimizedBtn.style.display = "flex";
      try { chrome.storage.local.set({ minimized: true }); } catch (_) { /* ignore */ }
    });

    minimizedBtn.addEventListener("click", () => {
      panel.style.display = "flex";
      minimizedBtn.style.display = "none";
      try { chrome.storage.local.set({ minimized: false }); } catch (_) { /* ignore */ }
    });

    document.getElementById("aioka-refresh").addEventListener("click", () => {
      try {
        chrome.runtime.sendMessage({ type: "aioka_force_refresh" }).catch(() => {});
      } catch (_) { /* ignore */ }
    });

    document.getElementById("aioka-open-settings").addEventListener("click", () => {
      try {
        chrome.runtime.sendMessage({ type: "aioka_open_settings" }).catch(() => {});
        chrome.runtime.openOptionsPage && chrome.runtime.openOptionsPage();
      } catch (_) { /* ignore */ }
    });

    hydrate();
    setInterval(hydrate, 15000); // refresh "Updated Xs ago" label
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg) return;
    if (msg.type === "aioka_signal_update") {
      chrome.storage.local.get(["lastSignalAt"]).then(({ lastSignalAt }) => {
        render({
          signal: msg.signal || null,
          error: msg.error || null,
          lastSignalAt: lastSignalAt || Date.now()
        });
      }).catch(() => { /* ignore */ });
    }
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", inject, { once: true });
  } else {
    inject();
  }
})();
