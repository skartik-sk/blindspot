# Manual test (desktop and Android)

Site: https://useblindspot.xyz/ · Demo whale: `0xC2D7d07c52F556b1837E5FD51989850Fa4f173E9` (Sepolia).
Do this once on a desktop (Chrome) and once on an Android phone (Chrome). The full run is about 25–35 minutes.

Before starting:
- Use a normal window, not incognito: the wallet lives in this browser's storage.
- On a phone, keep the screen on while testing.

If any step fails, write down the step number, the time, and what the status pill (top of the app) says.

## 1. Open the site
- **Do:** open https://useblindspot.xyz/.
- **Expect:** the landing page, "Watch from their blind spot." as the headline, which rotates every few seconds. The
  browser tab shows the Blindspot icon (a dark square with an orange bar).
- **Time:** 1–3 s.
- **If it fails:** check that the address starts with `https://`. If you see a GitHub 404, the domain setting was
  lost: tell Claude.

## 2. Onboarding
- **Do:** tap **Launch the app**. Go through the slides with **Next**, then **Start**. When asked for wallets, add one
  or tap **Start without wallets**.
- **Expect:** a live connection screen, then the app. The status pill reads **Live · block N**, and N goes up every
  ~12 s.
- **Time:** about 10 s to Live on Nox. On Nym (you'll see a banner saying so), about 50 s.
- **If it fails:**
  - Stuck on "Connecting" for over 60 s: reload once.
  - A "Using the backup network" banner: Nox stalled and Nym took over without a reload. Not a failure; note it.

## 3. Back up the key
- **Do:** **Send** → scroll to **This wallet's key** → **Back up key**. Tick **I understand**, then **Show**, then
  **Download backup file**.
- **Expect:** a warning first, a masked key until you tap Show, and a downloaded `blindspot-key-xxxxxx.txt`.
- **Time:** 30 s.
- **If it fails:** use **Copy** instead and paste the key into a password manager. Never paste it into chat.

## 4. Import a key
- **Do:** **Import key** → paste the key from step 3 (or pick the file).
- **Expect:**
  - The same key: "That's the key this device already uses."
  - A different key: "This key opens 0x…", plus a checkbox **I've backed up…**, then **Use this key**. The app reloads
    with that wallet.
  - Garbage text: a clear validation error, and nothing changes.
- **Time:** 30 s.
- **If it fails:** reload; the old key is untouched unless you pressed **Use this key**.

## 5. Get Sepolia funds
- **Do:**
  - Copy your address from **Send → Funding this device**.
  - Get Sepolia ETH from any Sepolia faucet.
  - Get USDC from https://faucet.circle.com (pick Ethereum Sepolia).
  - Or skip the USDC faucet: once you have ETH, use step 10 to swap a little ETH for USDC.
- **Expect:** **Portfolio** shows the new balance within a block or two after the faucet's transaction lands, marked
  **Verified · block N**.
- **Time:** 1–3 min (mostly the faucet).
- **If it fails:** check the faucet's transaction on sepolia.etherscan.io. If it landed but the balance didn't move,
  reload.

## 6. Watch the demo whale
- **Do:** **Watch → Watching** → paste the whale's address, name it `Whale A` → **Watch wallet**. (Quicker for a
  test: **Watch → Trending** → **Watch** on any active trader.)
- **Expect:** it appears under Watching. Any of its recent trades from the last ~30 blocks show up under **Alerts**.
- **Time:** instant.
- **If it fails:** check the address has 40 hex characters after `0x`.

## 7. Pending alert
- **Do:** ask Claude to run one whale swap (or wait for the trending trader to trade).
- **Expect:**
  - **Alerts** shows "Whale A is swapping" or "… sent a transaction" with the chip **Pending · unverified**.
  - The line under it reads "Unverified, could be wrong until the block confirms it."
  - Instead of a copy button, it says **Copy after the block confirms it**.
- **Time:** about 5–10 s after the swap is sent.
- **If it fails:** pending alerts are best-effort. Go to step 8; the verified alert still comes.

## 8. Verified alert
- **Expect:** the pending row is replaced by "Whale A swapped 0.0005 ETH → ~13 USDC · block N ✓".
- **Time:** about 20–40 s after the swap was sent.
- **If it fails:** look at the status pill. "Reconnecting": wait one block. "Paused": bring the tab to the front.

## 9. Copy trade
- **Do:** on the verified alert, tap **Copy trade**. Enter `0.0005` → wait for the price → **Trade ETH for USDC**.
- **Expect:**
  - "Copying Whale A", the heads-up about on-chain linking, and the button "Getting a price through the mixnet…"
    that then enables.
  - After sending: "Landed · Verified · block N".
  - A swap with tokens the app can't trade shows **Can't copy: unsupported token** instead of a button.
- **Time:** price in 3–10 s; landing in 15–40 s.
- **If it fails:**
  - Price stuck: change the amount (e.g. `0.0006`) to ask again.
  - "That's more than you have": fund the wallet (step 5).

## 10. Private lookup
- **Do:** **Lookup** → paste the whale (or tap a "Trading right now" chip) → **Look up privately**.
- **Expect:**
  - ETH, USDC and WETH balances, with the chip **Private, not yet proven · N s** and a "What the server saw" box.
  - Then "Recent activity · Hidden among up to 8".
- **Time:** balance in 3–10 s; history in 10–60 s.
- **If it fails:**
  - "The private directory isn't reachable right now": try again in a minute (a mixnet route problem).
  - "No cover available": tap **Load anyway** only if you accept a weaker cover.

## 11. Send
- **Do:** **Send → Send** → paste another address → a small amount (e.g. `0.0001` ETH) → **Send ETH**.
- **Expect:** "Working…", then a transaction hash, then "Landed · Verified · block N". The Portfolio balance drops.
- **Time:** 15–40 s.
- **If it fails:** "No price" or a network error: try once more. Sends go to the public Sepolia mempool through the
  mixnet.

## 12. Spy panel
- **Do:** **Spy panel → Run the comparison**.
- **Expect:**
  - **Normal RPC:** your addresses and your IP.
  - **Anon-RPC alone:** the addresses, from mixnet IPs.
  - **Blindspot:** block numbers only.
- **Time:** 5–20 s.
- **If it fails:** stop and start the comparison once. The third column (the relay's own log) is enough to show the
  point.

## 13. Network page and traffic share
- **Do:** open **Network**.
- **Expect:**
  - Relay "Answering", the current block, and "Since last block" counting up and resetting about every 12 s.
  - Traffic share shows "Measuring…" for the first ~20 requests, then 100%.
  - "Networks" lists Nox and Nym; "Block proof" says "Light client · head signed by the sync committee at slot N".
  - "Per block" and "Data use" (~250–330 KB per block).
- **Time:** instant; the share needs a few minutes to climb.
- **If it fails:** "Relay: Waiting for the next block" for over a minute means the relay is slow. Reload once.

## 14. Background toggle with notification (desktop)
- **Do:** **Watch → Alerts → While you're away** → tick **Keep watching in background**. Allow notifications when the
  browser asks. Then switch to another tab for a few minutes while a watched wallet trades.
- **Expect:**
  - A system notification such as "Whale A swapped … · block N".
  - Back on the tab, the status pill was never "Paused".
  - Untick it, hide the tab again: the pill shows **Paused while in background**. On return it catches up and goes
    Live again (after a break of over ~6 min it says how many older blocks it skipped).
- **Time:** 2–5 min. A hidden tab can be up to a minute late.
- **If it fails:**
  - "Notifications are blocked for this site": allow them in the site settings (the lock icon by the address) and
    tick it again.
  - On a phone this toggle is hidden on purpose; use step 15.

## 15. Watch mode (Android)
- **Do:** **Watch → Alerts → Watch mode**.
- **Expect:**
  - The button turns dark: "Watch mode on · tap to stop", with a battery note. The screen doesn't dim or lock while
    on.
  - Switching apps or leaving the Watch screen turns it off. Tap again to stop.
  - If the browser doesn't support it, there's no Watch mode button.
- **Time:** 1–2 min.
- **If it fails:** "The browser refused to keep the screen on": turn off battery saver and try again.

## 16. Reload: everything persists
- **Do:** reload the page (or close and reopen the tab).
- **Expect:** the same wallet address (Send → Funding this device), the same watched wallets, past alerts, and the
  background toggle state. The app goes Live again on its own.
- **Time:** about 10 s to Live.
- **If it fails:** a different address after reload means storage was cleared (private window, or site data
  cleared). Import the backup from step 3.
