# Live demo for the judges (about 4 minutes)

You need two devices:
- **Phone:** runs Blindspot (the "trader").
- **Laptop:** your normal wallet `0xD43c…d5F4` plays the whale. It has ETH and about 102 USDC on Sepolia.

## Setup (10 minutes before)

1. **Phone:** open https://useblindspot.xyz, tap **Launch the app**, go through onboarding, and wait for
   **Live · block N** at the top.
2. **Fund the phone's wallet** (needed for the copy trade):
   - On the phone, go to **Send** and scroll to **Funding this device**. Copy the address shown there.
   - From your laptop wallet, send it **0.01 Sepolia ETH**.
   - Wait until Portfolio shows the balance as **Verified · block N**.
3. **Phone, follow your laptop wallet:**
   - Go to **Watch → Watching**.
   - Paste `0xD43c11F0F5663c068837299c5973E1985318d5F4` and name it `Whale`.
   - Tap **Watch wallet**.
4. **Laptop:** open https://app.uniswap.org on **Sepolia** with your wallet. Set up a swap of **0.001 ETH → USDC**,
   but don't confirm yet.
5. **Phone:** open **Network** once. The traffic share should show a % (it needs about 20 requests first). Then
   go back to **Watch → Alerts**.
6. **Phone:** keep the screen on with **Watch → Alerts → Watch mode**, and plug the phone in.

## On stage

| # | You do | Judges see | Say (short) |
| --- | --- | --- | --- |
| 1 | Show the landing page | "Watch from their blind spot." | "Anon-RPC hides who you are. Blindspot also hides what you watch." |
| 2 | **Spy panel → Run the comparison** | 3 columns: Normal RPC (2 addresses + IP), Anon-RPC alone (2 addresses), Blindspot (0) | "A normal wallet leaks your IP and addresses. Anon-RPC hides the IP, not the addresses. We send block numbers only." |
| 3 | Laptop: **confirm the Uniswap swap** | Phone, Watch → Alerts: "Whale is swapping · Pending · unverified" | "That's the mempool, about 5–10 seconds after the send. It's marked unverified." |
| 4 | Wait | The pending row turns into "Whale swapped … · block N ✓" | "Now the block landed. My phone checked the header hash, the access list, the receipts, and a second provider. Nobody was asked about this wallet." (about 20–40 s after the send) |
| 5 | Tap **Copy trade**, type `0.0005`, tap **Trade ETH for USDC** | Price comes in through the mixnet, then "Landed · Verified · block N" | "Signed on the phone and sent through the mixnet. The quote names the pair and size, not who asked." |
| 6 | **Lookup** → paste `0xC2D7d07c52F556b1837E5FD51989850Fa4f173E9` → **Look up privately** | Balance in 3–10 s with "Private, not yet proven", then history "Hidden among 8", then sometimes "Partly proven ✓" | "PIR: the server computes over its whole table and can't tell which row I read. Then the phone checks the answer against blocks it verified." |
| 7 | **Network** (after about 5 min of the app running) | Relay status, current block, traffic share (starts around 90%, climbs to 97–99%) | "Every request and its route. The only direct ones are Anon-RPC's own startup reads, 2 or 3 when the page opens, and we count them against ourselves. That's why it starts near 90% and climbs." |

## If something goes wrong

- **Status shows Reconnecting, Waiting or Switching network…:** that's the mixnet, not us; it had outages on Nov 7.
  Say "notice it never falls back to a direct connection", reload once, and show the Spy panel and the README
  numbers meanwhile.
- **No pending row after 15 s:** skip it. The verified alert still comes within about a block.
- **Copy-trade price stuck:** change the amount to `0.0006` to ask again.
- **Lookup says the directory isn't reachable:** it's the mixnet; try again in a minute.
- **Backup:** the video, plus the screenshots in `docs/demo-backup/`.

## Don't say

"100% private", "works on mainnet", "the relay can't lie" (say "faking a block needs our relay and a second provider
to collude"), "full history".
