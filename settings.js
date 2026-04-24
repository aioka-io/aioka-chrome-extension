// AIOKA settings page — save API key, test connection, display tier.

const KEY_INPUT = () => document.getElementById("api-key");
const STATUS = () => document.getElementById("status");
const TIER_VALUE = () => document.getElementById("tier-value");

function setStatus(text, kind) {
  const el = STATUS();
  el.textContent = text || "";
  el.className = "status" + (kind ? " " + kind : "");
}

function parseTierFromKey(key) {
  // AIOKA key format: aik_{tier}_{random20}
  if (!key || typeof key !== "string") return null;
  const parts = key.split("_");
  if (parts.length >= 3 && parts[0] === "aik") {
    return parts[1].toUpperCase();
  }
  return null;
}

function setTierDisplay(tier) {
  const el = TIER_VALUE();
  if (!tier) {
    el.textContent = "—";
    return;
  }
  el.textContent = tier;
}

async function hydrate() {
  try {
    const { apiKey } = await chrome.storage.local.get("apiKey");
    if (apiKey) {
      KEY_INPUT().value = apiKey;
      setTierDisplay(parseTierFromKey(apiKey));
      setStatus("Key loaded from storage.", "info");
    } else {
      setStatus("No key saved yet. Paste your AIOKA API key above.", "info");
    }
  } catch (err) {
    console.debug("aioka_settings_hydrate_failed", err);
  }
}

async function save() {
  const key = (KEY_INPUT().value || "").trim();
  if (!key) {
    setStatus("Please enter an API key.", "err");
    return;
  }
  if (!/^aik_[a-z0-9]+_[A-Za-z0-9]+$/.test(key)) {
    setStatus("Key format looks invalid. Expected aik_{tier}_{token}.", "err");
    return;
  }
  try {
    await chrome.storage.local.set({ apiKey: key, lastError: null, lastErrorAt: null });
    setTierDisplay(parseTierFromKey(key));
    setStatus("Saved. Testing connection…", "info");
    await test();
    // Force the background worker to poll immediately so the panel updates.
    try {
      await chrome.runtime.sendMessage({ type: "aioka_force_refresh" });
    } catch (_) { /* ignore — service worker may be idle */ }
  } catch (err) {
    setStatus("Could not save key: " + (err && err.message ? err.message : "unknown error"), "err");
  }
}

async function test() {
  const key = (KEY_INPUT().value || "").trim();
  if (!key) {
    setStatus("Enter a key first, then click Test.", "err");
    return;
  }
  setStatus("Testing connection to api.aioka.io…", "info");
  try {
    const res = await chrome.runtime.sendMessage({
      type: "aioka_test_connection",
      apiKey: key
    });
    if (!res) {
      setStatus("No response from extension background. Try reloading the extension.", "err");
      return;
    }
    if (res.ok) {
      const verdict = (res.data && res.data.verdict) || "(no verdict)";
      const conf = res.data && typeof res.data.confidence === "number"
        ? `${res.data.confidence.toFixed(1)}%`
        : "—";
      setStatus(`Connected. Current verdict: ${verdict} · confidence ${conf}`, "ok");
      return;
    }
    if (res.error === "INVALID_KEY") {
      setStatus("Key rejected by api.aioka.io (401/403). Check it and try again.", "err");
    } else if (res.error === "NETWORK") {
      setStatus("Network error reaching api.aioka.io. Check your internet connection.", "err");
    } else if (res.error && res.error.startsWith("HTTP_")) {
      setStatus(`API responded with status ${res.error.slice(5)}. Try again shortly.`, "err");
    } else {
      setStatus("Test failed: " + (res.error || "unknown"), "err");
    }
  } catch (err) {
    setStatus("Extension messaging error: " + (err && err.message ? err.message : err), "err");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  hydrate();

  document.getElementById("save-btn").addEventListener("click", save);
  document.getElementById("test-btn").addEventListener("click", test);

  const showKey = document.getElementById("show-key");
  showKey.addEventListener("change", () => {
    KEY_INPUT().type = showKey.checked ? "text" : "password";
  });

  KEY_INPUT().addEventListener("keydown", (e) => {
    if (e.key === "Enter") save();
  });
});
