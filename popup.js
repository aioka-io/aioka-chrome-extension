// AIOKA popup — mirrors the floating panel using cached storage state, plus
// Refresh / Settings buttons. Pulls live from background via aioka_force_refresh.

const VERDICT_CLASS = {
  STRONG_BUY: "buy",
  BUY: "buy",
  ACCUMULATE: "buy",
  HOLD: "hold",
  REDUCE: "sell",
  SELL: "sell",
  STRONG_SELL: "sell",
  PENDING: "hold"
};

function fmtAge(ts) {
  if (!ts) return "—";
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.round(m / 60)}h ago`;
}

function fmtPrice(v) {
  if (v === null || v === undefined || isNaN(v)) return "—";
  if (v >= 1000) return "$" + Math.round(v).toLocaleString("en-US");
  return "$" + Number(v).toFixed(2);
}

function showSetup(reason) {
  const wrap = document.querySelector(".wrap");
  const title = reason === "INVALID_KEY" ? "Invalid API key" : "API key required";
  const msg = reason === "INVALID_KEY"
    ? "The saved key was rejected by api.aioka.io. Update it in settings."
    : "Paste your free AIOKA API key in settings to see live signals here and on TradingView.";
  wrap.innerHTML = `
    <header class="hdr">
      <div class="brand">
        <span class="ghost">&#128123;</span>
        <span class="name">AIOKA</span>
      </div>
    </header>
    <div class="setup">
      <div class="setup-title">${title}</div>
      <div class="setup-body">${msg}</div>
      <button class="btn-primary" id="setup-btn" type="button">Open Settings</button>
    </div>
  `;
  document.getElementById("setup-btn").addEventListener("click", () => {
    if (chrome.runtime.openOptionsPage) chrome.runtime.openOptionsPage();
  });
}

function render(state) {
  const { signal, lastSignalAt, error } = state;

  if (error === "NO_API_KEY" || error === "INVALID_KEY") {
    showSetup(error);
    return;
  }

  const verdict = (signal && signal.verdict) || "PENDING";
  const verdictEl = document.getElementById("verdict");
  verdictEl.textContent = verdict.replace(/_/g, " ");
  verdictEl.className = "verdict " + (VERDICT_CLASS[verdict] || "hold");

  const confEl = document.getElementById("confidence");
  confEl.textContent = signal && typeof signal.confidence === "number"
    ? `Confidence ${signal.confidence.toFixed(1)}%`
    : "Confidence —";

  document.getElementById("btc").textContent =
    signal && typeof signal.btc_price === "number" ? fmtPrice(signal.btc_price) : "—";
  document.getElementById("regime").textContent =
    (signal && signal.regime ? signal.regime.replace(/_/g, " ") : "—");
  document.getElementById("rsi").textContent =
    signal && typeof signal.rsi === "number" ? signal.rsi.toFixed(1) : "—";
  document.getElementById("darkpool").textContent =
    signal && typeof signal.dark_pool === "number" ? `${Math.round(signal.dark_pool)}/100` : "—";
  document.getElementById("ghost").textContent =
    (signal && signal.ghost_status ? signal.ghost_status.replace(/_/g, " ") : "—");

  const updated = document.getElementById("updated");
  const live = document.getElementById("live-indicator");
  if (error) {
    updated.textContent = `Offline — last ${fmtAge(lastSignalAt)}`;
    updated.classList.add("stale");
    if (live) live.classList.add("stale");
  } else {
    updated.textContent = `Updated ${fmtAge(lastSignalAt)}`;
    updated.classList.remove("stale");
    if (live) live.classList.remove("stale");
  }
}

async function hydrate() {
  try {
    const state = await chrome.storage.local.get([
      "apiKey", "lastSignal", "lastSignalAt", "lastError"
    ]);
    if (!state.apiKey) {
      render({ signal: null, lastSignalAt: null, error: "NO_API_KEY" });
      return;
    }
    render({
      signal: state.lastSignal || null,
      lastSignalAt: state.lastSignalAt || null,
      error: state.lastError || null
    });
  } catch (err) {
    console.debug("aioka_popup_hydrate_failed", err);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  hydrate();

  const refreshBtn = document.getElementById("refresh-btn");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", async () => {
      refreshBtn.textContent = "Refreshing…";
      refreshBtn.disabled = true;
      try {
        await chrome.runtime.sendMessage({ type: "aioka_force_refresh" });
      } catch (_) { /* ignore */ }
      setTimeout(() => {
        refreshBtn.textContent = "Refresh";
        refreshBtn.disabled = false;
        hydrate();
      }, 800);
    });
  }

  const settingsBtn = document.getElementById("settings-btn");
  if (settingsBtn) {
    settingsBtn.addEventListener("click", () => {
      if (chrome.runtime.openOptionsPage) chrome.runtime.openOptionsPage();
    });
  }
});
