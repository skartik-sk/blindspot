# Demo video (3:00)

Judging: works end to end · UX · traffic share through Anon-RPC · could ship · technical depth.

**Setup before recording:** phone (or narrow browser) on https://bina.13-53-45-89.sslip.io, app open for 2+ minutes
so the traffic share has settled. Whale wallet funded. Second window ready to send the whale's swap. Wallet A
(the whale) already added under Watch.

| Time | Screen | Say | Shows criterion |
| --- | --- | --- | --- |
| 0:00–0:20 | Spy panel, left column, "Run a normal wallet" | "This is what a normal wallet sends its RPC provider every block: your addresses and your IP. Real requests to a real server. It knows your portfolio and everyone you copy." | the problem |
| 0:20–0:40 | Watch → add whale address | "Bina Pooche watches wallets without asking about them. It downloads each block by number, the same bytes everyone gets, through Anon-RPC's Nox mixnet, and filters on the phone." | UX, depth |
| 0:40–1:15 | Second window: whale swaps ETH→USDC. Phone: alert appears (sold / bought) → tap Copy → Trade screen prefilled → Send | "The whale just swapped. We saw it in the next block, from the verified receipts, not from a server telling us. One tap to copy. Signed on the phone, sent out through the mixnet." Wait for "Landed in block N". | works end to end |
| 1:15–1:40 | Lookup → paste any address → balance | "Want a balance? That's PIR: the server computes over its whole table, encrypted, and can't tell which row we asked for." | depth |
| 1:40–2:10 | Spy panel, both columns + relay log | "Left: the normal wallet, addresses and IP. Right: everything we sent. Block numbers only, from mixnet exits. Bottom: our relay's own log. Same story from the server's side." | privacy proof |
| 2:10–2:30 | Network → Traffic share | "97% of requests went through Anon-RPC. The rest are the worker's bootstrap reads of the public network contract, counted, not hidden." | traffic share |
| 2:30–3:00 | README "How a block is proven" / landing | "Every block is checked three ways: header hash, the EIP-7928 access-list hash, the receipts root, then cross-checked with a second provider. It's an SDK any wallet can drop in. Limits are in the README: PIR covers ~1k addresses, Sepolia has no private builder. We never say 100% private." | could ship, honesty |

## How the traffic share is calculated

`share = mixnet / (mixnet + bootstrap + direct)`, counted in `apps/web/src/lib/reqlog.ts` since the page loaded:

- **mixnet:** every request sent through `anonFetch` → Anon-RPC worker (blocks, anchor checks, PIR, quotes, sends, relay log).
- **bootstrap:** the worker's own direct reads of its specifier contract (public data, no address). Counted against us.
- **direct:** calls to a relay on localhost (dev only; 0 on the deployed site).
- **Not counted:** the Spy panel's opt-in "normal wallet" demo lane, which exists to show the leak and is shown separately.

Measured on Nov 6 against the deployed relay: 82 / 84 = 97.6% after ~4 minutes; it rises over time because
bootstrap happens only at startup.
