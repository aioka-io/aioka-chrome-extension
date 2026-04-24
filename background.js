// AIOKA background service worker — polls /v1/tradingview/signal every 60s,
// caches result in chrome.storage.local, updates the toolbar badge, and
// broadcasts fresh data to active TradingView tabs.

const API_URL = "https://api.aioka.io/v1/tradingview/signal";
const POLL_ALARM = "aioka-poll";
const POLL_INTERVAL_MINUTES = 1;

const VERDICT_COLORS = {
  STRONG_BUY: "#16A34A",
  BUY: "#22C55E",
  ACCUMULATE: "#22C55E",
  HOLD: "#6B7280",
  REDUCE: "#EF4444",
  SELL: "#EF4444",
  STRONG_SELL: "#B91C1C",
  PENDING: "#6B7280"
};

const VERDICT_BADGE = {
  STRONG_BUY: "BUY+",
  BUY: "BUY",
  ACCUMULATE: "ACC",
  HOLD: "HOLD",
  REDUCE: "RED",
  SELL: "SELL",
  STRONG_SELL: "SELL-",
  PENDING: "..."
};

async function getApiKey() {
  const { apiKey } = await chrome.storage.local.get("apiKey");
  return apiKey || "";
}

async function setBadge(verdict, hasKey) {
  try {
    if (!hasKey) {
      await chrome.action.setBadgeText({ text: "KEY" });
      await chrome.action.setBadgeBackgroundColor({ color: "#6B7280" });
      return;
    }
    const text = VERDICT_BADGE[verdict] || "...";
    const color = VERDICT_COLORS[verdict] || "#6B7280";
    await chrome.action.setBadgeText({ text });
    await chrome.action.setBadgeBackgroundColor({ color });
  } catch (err) {
    // Badge updates must never crash the worker.
    console.debug("aioka_badge_failed", err);
  }
}

async function broadcastSignal(signal, error) {
  // Best-effort push to any open TradingView tabs. Failures are expected
  // (no tab open, content script not yet injected) and must not throw.
  try {
    const tabs = await chrome.tabs.query({ url: "https://www.tradingview.com/*" });
    for (const tab of tabs) {
      chrome.tabs.sendMessage(tab.id, { type: "aioka_signal_update", signal, error })
        .catch(() => { /* swallow — tab may be gone or content script unloaded */ });
    }
  } catch (err) {
    console.debug("aioka_broadcast_failed", err);
  }
}

async function pollSignal() {
  const apiKey = await getApiKey();
  if (!apiKey) {
    await setBadge(null, false);
    await chrome.storage.local.set({
      lastError: "NO_API_KEY",
      lastErrorAt: Date.now()
    });
    await broadcastSignal(null, "NO_API_KEY");
    return;
  }

  try {
    const res = await fetch(API_URL, {
      method: "GET",
      headers: { "X-API-Key": apiKey, "Accept": "application/json" },
      cache: "no-store"
    });

    if (res.status === 401 || res.status === 403) {
      await setBadge(null, false);
      await chrome.storage.local.set({
        lastError: "INVALID_KEY",
        lastErrorAt: Date.now()
      });
      await broadcastSignal(null, "INVALID_KEY");
      return;
    }

    if (!res.ok) {
      await chrome.storage.local.set({
        lastError: `HTTP_${res.status}`,
        lastErrorAt: Date.now()
      });
      await broadcastSignal(null, `HTTP_${res.status}`);
      return;
    }

    const signal = await res.json();
    await chrome.storage.local.set({
      lastSignal: signal,
      lastSignalAt: Date.now(),
      lastError: null,
      lastErrorAt: null
    });
    await setBadge(signal.verdict, true);
    await broadcastSignal(signal, null);
  } catch (err) {
    await chrome.storage.local.set({
      lastError: "NETWORK",
      lastErrorAt: Date.now()
    });
    await broadcastSignal(null, "NETWORK");
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.alarms.create(POLL_ALARM, { periodInMinutes: POLL_INTERVAL_MINUTES });
  pollSignal();
});

chrome.runtime.onStartup.addListener(async () => {
  await chrome.alarms.create(POLL_ALARM, { periodInMinutes: POLL_INTERVAL_MINUTES });
  pollSignal();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === POLL_ALARM) pollSignal();
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === "aioka_force_refresh") {
    pollSignal().then(() => sendResponse({ ok: true }));
    return true; // async sendResponse
  }
  if (msg && msg.type === "aioka_test_connection") {
    (async () => {
      const apiKey = msg.apiKey || await getApiKey();
      if (!apiKey) {
        sendResponse({ ok: false, error: "NO_API_KEY" });
        return;
      }
      try {
        const res = await fetch(API_URL, {
          headers: { "X-API-Key": apiKey, "Accept": "application/json" }
        });
        if (res.status === 401 || res.status === 403) {
          sendResponse({ ok: false, error: "INVALID_KEY", status: res.status });
          return;
        }
        if (!res.ok) {
          sendResponse({ ok: false, error: `HTTP_${res.status}`, status: res.status });
          return;
        }
        const data = await res.json();
        sendResponse({ ok: true, data });
      } catch (err) {
        sendResponse({ ok: false, error: "NETWORK" });
      }
    })();
    return true;
  }
});
