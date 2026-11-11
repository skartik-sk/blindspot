# Demo video (3:00)

Judging: works end to end · UX · traffic share through Anon-RPC · could ship · technical depth.

**Setup before recording:** phone (or narrow browser) on https://useblindspot.xyz/, app open for 2+ minutes
so the traffic share has settled. Whale wallet funded. Second window ready to send the whale's swap. Wallet A
(the whale) already added under Watch.

| Time | Screen | Say | Shows criterion |
| --- | --- | --- | --- |
| 0:00–0:20 | Spy panel, left column, "Run a normal wallet" | "This is what a normal wallet sends its RPC provider every block: your addresses and your IP. Real requests to a real server. It knows your portfolio and everyone you copy." | the problem |
| 0:20–0:40 | Watch → add whale address | "Blindspot watches wallets without asking about them. It downloads each block by number, the same bytes everyone gets, through Anon-RPC's Nox mixnet, and filters on the phone." | UX, depth |
| 0:40–1:15 | Second window: whale swaps ETH→USDC. Phone: alert appears (sold / bought) → tap Copy → Trade screen prefilled → Send | "The whale just swapped. We saw it in the next block, from the verified receipts, not from a server telling us. One tap to copy. Signed on the phone, sent out through the mixnet." Wait for "Landed in block N". | works end to end |
| 1:15–1:40 | Lookup → tap a suggested address (or the whale) → balance, then "Recent activity" | "Balance and history of any wallet. PIR: the server computes over its whole table, encrypted, and can't tell which row we asked for. Then we download the blocks, mixed with up to seven other wallets' blocks, so the relay can't tell whose history it was." | depth |
| 1:40–2:10 | Spy panel, both columns + relay log | "Left: the normal wallet, addresses and IP. Right: everything we sent. Block numbers only, from mixnet exits. Bottom: our relay's own log. Same story from the server's side." | privacy proof |
| 2:10–2:30 | Network → Traffic share | "100% of requests went through Anon-RPC, from the very first one: the app answers Anon-RPC's startup reads from pins and serves the worker code itself." | traffic share |
| 2:30–3:00 | README "How a block is proven" / landing | "Every block is checked three ways: header hash, the EIP-7928 access-list hash, the receipts root, then proven by the beacon light client (512 validators signed a head that links back to it). It's an SDK any wallet can drop in. Limits are in the README: PIR covers ~1k addresses, Sepolia has no private builder. We never say 100% private." | could ship, limits |

## How the traffic share is calculated

`share = mixnet / (mixnet + bootstrap + direct)`, counted in `apps/web/src/lib/reqlog.ts` since the page loaded:

- **mixnet:** every request sent through `anonFetch` → Anon-RPC worker (blocks, anchor checks, PIR, quotes, sends, relay log).
- **bootstrap:** Anon-RPC's own direct startup requests. Since Nov 11 there are none: the app answers the two
  specifier reads from pins and serves the worker code from its own site. They only reappear for a network whose pin
  went stale (then 2 reads, no address), and they're counted against us.
- **direct:** calls to a relay on localhost (dev only; 0 on the deployed site).
- **Not counted:** the Spy panel's opt-in "normal wallet" demo lane, which exists to show the leak and is shown separately.

Measured on Nov 11 on a production build: 100.0% from the first request. (Nov 6, before pinning: 109 / 112 = 97.3%; it rose over time because bootstrap happened only
at startup.)

## If the network is down

The mixnets themselves can stall. On Nov 7, Nox stopped delivering between about 04:25 and 05:00 IST, and Nym timed
out too, while our relay kept verifying every block. The app then shows **Reconnecting**, or a banner such as
"Switched to Nym because Nox stopped responding" or "Nox and Nym both stopped responding". That's the app refusing to
fall back to a direct connection, which is the point.

**What to say (about 15 s):** "The mixnet is having a moment. Notice what the app doesn't do: it never falls back to
asking a server directly. It waits, switches between Nox and Nym, and tells you. Here's the same flow from earlier."

**What still shows real data with no mixnet:**

| Where | What it shows | Why it still works |
| --- | --- | --- |
| Watch → Alerts | Past alerts with "block N ✓" | Stored on the device from blocks verified earlier |
| Portfolio | Balances marked "Verified · block N" | Stored on the device |
| Spy panel → "Normal RPC" column | A normal wallet's requests, with your IP and the addresses | It's sent directly on purpose (the leak demo) |
| https://bina-relay.13-53-45-89.sslip.io/health | The relay is up, with its current block | Opened in a normal browser tab |
| https://bina-relay.13-53-45-89.sslip.io/log | The relay's own log: block numbers and method names only, no addresses | Opened in a normal browser tab |
| Network page | Relay status, "Per block" average and the data-use line | From blocks seen before the outage |
| README | Measured numbers: 97.3% / 99.7% traffic share; Nox 10 s to the first block, then 2.6 s per block; PIR 3–5 s; 84 relay requests with 0 from our IP | Written down |

**Show the backup.** Open `docs/demo-backup/README.md` and click through the screenshots in order. Each is captioned
with the step from the table above and the time it was taken.

**Don't:** switch the app to a direct connection, or claim it's live when it says Reconnecting.
