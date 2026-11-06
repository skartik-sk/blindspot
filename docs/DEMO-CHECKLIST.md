# Demo checklist (live, ~3 min)

Site: https://skartik-sk.github.io/bina-pooche/ · Whale A: `0xC2D7d07c52F556b1837E5FD51989850Fa4f173E9`
(Sepolia, ~0.0045 ETH = about 8 more 0.0005 ETH swaps; it is seeded, so it never leaves the lookup directory).

## 15 minutes before
1. Open the site on the demo phone or laptop. Finish onboarding once, so it says **Live · block N**.
2. **Watch → Watching**, add the whale: paste the address above, name it `Whale A`, **Watch wallet**.
3. Ask Claude to run one whale swap now. This puts fresh activity in its history. Check that **Watch → Alerts**
   shows "Whale A swapped … block N ✓" within ~30 s.
4. Open **Network**: traffic share should read a % (it shows "Measuring…" for the first ~20 requests).
5. Leave the tab open. Don't redeploy or restart anything from here on.

## On stage
| Step | Click | What appears | When |
| --- | --- | --- | --- |
| 1 | **Spy panel → Run the comparison** | Three columns fill: Normal RPC (addresses + your IP), Anon-RPC alone (addresses, mixnet IPs), Bina Pooche (block numbers only) | 5–20 s |
| 2 | Say "go", the whale swaps (Claude runs it) | **Watch → Alerts**: "Whale A is swapping · Pending · unverified" | ~5–10 s after send |
| 3 | Wait | The pending row is replaced by "Whale A swapped 0.0005 ETH → ~13 USDC · block N ✓" | ~20–40 s after send |
| 4 | **Copy trade** → type `0.0005` → **Trade ETH for USDC** | Button says "Getting a price through the mixnet…", then enables; after sending: "Landed · Verified · block N" | quote 3–10 s, lands 15–40 s |
| 5 | **Lookup** → paste the whale (or tap a "Trading right now" chip) → **Look up privately** | Balance (PIR, 3–5 s), then "Recent activity · Hidden among 8 · ~30 s · ~5 MB" with the swap from step 3 | 30–60 s total |
| 6 | **Network** | Traffic share 90–99% and per-block size | instant |

## If something is slow
- **No pending row after 15 s:** skip it and say "pending is best-effort, unverified"; the verified alert still comes.
- **No verified alert after 60 s:** look at the status pill. If it says Reconnecting, wait one block. Otherwise open
  **Watch → Trending** and copy any live trader instead; same flow.
- **Copy-trade quote stuck:** edit the amount (e.g. `0.0006`) to re-quote.
- **History says "No cover available":** press **Load anyway** and say "here it would ask the user first".
- **History slow:** keep talking (step 6) and come back to it; it runs in the background.
- **Whole site stuck on Reconnecting:** reload once. The relay keeps its directory on disk, so nothing is lost.
- **Spy comparison errors:** show the third column only (the relay log) and the README table.

## Don't say
"100% private", "works on mainnet", "sends are private from bots on Sepolia", "full history".
