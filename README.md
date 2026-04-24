# AIOKA Chrome Extension

Live AI trading signals from [AIOKA](https://aioka.io), overlaid on TradingView
charts as a floating panel.

![AIOKA panel on TradingView — placeholder](docs/screenshot.png)

## What it does

- Injects a draggable floating panel on every `tradingview.com` page.
- Polls `GET https://api.aioka.io/v1/tradingview/signal` every 60s.
- Shows the live AIOKA verdict, confidence, BTC price, market regime, RSI,
  Dark Pool score, and Ghost Trader status.
- Colors the Chrome toolbar badge green (ACCUMULATE/BUY) or red (REDUCE/SELL).
- Survives API outages: the panel keeps the last known signal and shows how
  stale it is.

## Install — developer mode (until Chrome Web Store listing is live)

1. Clone or download this repo:
   ```
   git clone https://github.com/aioka-io/aioka-chrome-extension.git
   ```
2. Open Chrome and go to `chrome://extensions`.
3. Flip **Developer mode** on (top right).
4. Click **Load unpacked** and select the repo folder.
5. Pin the AIOKA icon to the toolbar.

## Install — Chrome Web Store

*Listing pending review — link will be added here once published.*

## Get a free API key

1. Run this in any terminal:
   ```bash
   curl -X POST https://api.aioka.io/v1/keys/generate \
     -H "Content-Type: application/json" \
     -d '{"email": "you@example.com"}'
   ```
   You'll receive a key in the format `aik_free_{token}`.
2. Open the extension's **Settings** page (right-click the toolbar icon →
   *Options*, or open the popup → *Settings*).
3. Paste the key, click **Save**, then **Test Connection**.

Free tier = 60 API calls/day. The extension polls once per minute when a
TradingView tab is open; that's well within the free allowance during normal
browsing but will hit the daily cap if left open all day. See
[aioka.io/pricing](https://aioka.io/pricing) to upgrade.

## Panel controls

| Action | How |
| :--- | :--- |
| Move the panel | Drag the header |
| Minimize | Click the `−` button; click the floating ghost to re-open |
| Force refresh | Click the ⟲ button in the footer (or "Refresh" in the popup) |
| Open settings | Right-click the toolbar icon → *Options*, or popup → *Settings* |

Your position preference is saved per-profile.

## Privacy

- The only data the extension transmits is a `GET /v1/tradingview/signal`
  request to `https://api.aioka.io`, authenticated with your API key.
- No analytics, no trackers, no third-party requests.
- The API key is stored in `chrome.storage.local` and never leaves your
  browser except in the `X-API-Key` header of the AIOKA request.
- The content script injects a single DOM subtree scoped by the
  `#aioka-panel-root` id and does not read TradingView's DOM or data.

## Development

- Manifest V3, no build step required — plain ES2020 and CSS.
- Content script is scoped via `all: initial` on the panel root + the
  `#aioka-panel-root` id prefix, so TradingView's stylesheet never bleeds in.
- Polling is handled by a service worker using `chrome.alarms` (1 minute
  cadence — the minimum MV3 allows).
- `chrome.storage.local` holds: `apiKey`, `lastSignal`, `lastSignalAt`,
  `lastError`, `lastErrorAt`, `panelPos`, `minimized`.

### Reload after edits

```
chrome://extensions → AIOKA AI Signals → Reload
```

Then hard-refresh the TradingView tab (`Ctrl+Shift+R`).

## Links

- Website: https://aioka.io
- API: https://api.aioka.io
- Docs: https://docs.aioka.io
- TradingView integration guide: https://docs.aioka.io/tradingview
- AIOKA live dashboard: https://aioka.io/live
- Pricing & tiers: https://aioka.io/pricing

## License

MIT. See [LICENSE](LICENSE).
