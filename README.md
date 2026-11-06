# Bina Pooche (बिना पूछे)

**Anon-RPC hides who you are. We also hide what you watch.**

A private trading companion: watch whales, get copy-trade alerts, check any wallet's balance and history, and trade,
without any RPC provider learning which wallets you care about.

Anon-RPC alone hides your IP. But a wallet that sends `eth_getBalance(0xWhale…)` or `eth_getLogs(…0xWhale…)` through
Anon-RPC still tells the node *which* addresses matter; it just doesn't know who asked. Repeat that every block and
the node holds your watchlist, minus your name. Bina Pooche never asks about an address. Every phone downloads the
same verified blocks by number (through Anon-RPC's Nox network, the Sphinx mixnet, specifier
`0x35133267A8F7EC35046a83DCA0f4Ca8A6e1b7A9A` on Sepolia) and filters them locally. Balance and history lookups use PIR.
The Spy panel shows all three side by side, from real requests: a normal RPC, Anon-RPC alone, and us.

Track: Ethereum Foundation, Best Use of Anon-RPC (ETHGlobal Mumbai 2026).

## Why this is different

Private RPCs and private wallets hide *who you are*: your IP, sometimes your requests. They still have to ask a
server about the addresses you care about, so they can't privately **watch other wallets** or **look up an
address's balance**: the question itself gives the address away.

Bina Pooche never asks about an address:

- **Watching** is local. Every user downloads the same verified blocks (header, access list, receipts) by block
  number through Anon-RPC, and the phone filters them for the wallets it watches. The server can't tell who
  watches whom, because everyone gets identical bytes.
- **Lookups** use PIR: the server computes over its whole table and can't tell which row you asked for.

What this does **not** give you (we never claim "100% private"):

- **PIR scope.** The table covers about 1,000 addresses that were active in recent verified blocks, plus a few
  seeds, with ETH, USDC and WETH balances. An address outside it falls back to a one-off read over a fresh
  mixnet route: the node learns the address, but not who asked.
- **PIR hides, it doesn't prove.** Our PIR is single-server (Paillier): privacy rests on encryption, not on servers
  not colluding. But the server could return a wrong row; the next verified block touching that address corrects it.
- **Who we trust in the demo.** Blocks come from our relay, and every block hash is cross-checked with Tenderly.
  Faking a block needs both to collude. The relay and the PIR server are the same machine, run by us. A light client
  would remove the second-provider trust.
- **Sends are public once they land,** and on Sepolia they pass the public mempool (no private builder there).

## Live

- App: https://skartik-sk.github.io/bina-pooche/ (GitHub Pages; landing at `/`, app at `#/portfolio`)
- Relay: https://bina-relay.13-53-45-89.sslip.io/health

## What it does

| Screen | What you get | What the provider learns |
| --- | --- | --- |
| Portfolio | Balances of your wallets, updated every block | Nothing: block numbers only |
| Watch | Alerts the moment a watched wallet swaps, with what it sold and bought; pending (mempool) alerts seconds earlier, marked unverified | Nothing: block numbers and a parameterless mempool snapshot |
| Lookup | Any address's ETH/USDC/WETH balance and recent activity, via PIR | An encrypted query; then blocks matching 4 addresses equally |
| Trade / Send | Uniswap swap or transfer, signed on device, sent through the mixnet | The tx, from a mixnet exit (not your IP). On mainnet a private builder (Flashbots Protect) keeps it out of the public mempool |
| Spy panel | Three columns from real requests: normal RPC (your IP + addresses), Anon-RPC alone (addresses), ours (block numbers) | — |
| Network | Traffic share: % of requests sent through Anon-RPC, live | — |

It's a PWA: one codebase for phone and desktop, installable from the browser. The landing page's headline rotates through six lines every 4 s
(one fixed-size box, so nothing below moves); with reduced motion on, it shows the first line only. "How it works"
lights its three steps in turn (live block request, a packet crossing three mixnet hops, four checks ticking), the
FAQ is a one-at-a-time accordion, and the footer is an illustrated Sea Link at dusk; all motion is CSS or `motion`
and stops under reduced motion. In the app, a "Getting started" checklist on Portfolio shows the next step (connect,
watch a wallet, first alert, private lookup, Spy panel), each derived from real app state; it can be hidden.

**When something is down.** Every screen keeps working on what it can: if the relay can't be reached, the status pill
says "Reconnecting" with a plain reason (raw error under Network → Details), Lookup says the private directory is
unreachable and falls back to a one-off mixnet read (labelled as such), and history is skipped rather than guessed.

Demo: `docs/DEMO.md` (script) and `docs/DEMO-CHECKLIST.md` (exact steps, timings, fallbacks).

## Layout

| Path | What |
| --- | --- |
| `packages/sdk` | The private core, usable by any wallet: header, access-list and receipts verification; event feed; per-wallet activity; chain follower; PIR client and server |
| `apps/relay` | Fetches each block once, verifies it, serves the same bytes to everyone; PIR balance table; spy log; public `GET /log` (block numbers only) |
| `apps/web` | The app (React + Vite) |

## Run

```bash
bun install
bun test                      # 66 tests, real Sepolia block fixtures
bun run relay                 # relay on :8787
cd apps/web && VITE_RELAY_URL=http://localhost:8787 bunx vite    # app on :5173
```

Without `VITE_RELAY_URL` the app reads blocks straight from publicnode through the mixnet (no relay needed;
PIR lookup falls back to a one-off mixnet read). Relay env: `UPSTREAM_RPC`, `PORT`, `POLL_MS`, `SPY_TOKEN`,
`ENABLE_NAIVE=1`, `RATE_LIMIT`, `TRUST_PROXY=1`, `PIR_SEED` (comma-separated addresses, never evicted), `PIR_MAX`,
`PIR_NEW_PER_BLOCK` (default 8: how fast new wallets enter the directory; lower keeps quiet wallets listed longer),
`NAIVE_ALLOW` (addresses the demo lane may answer about; default the Sepolia Uniswap router and quoter),
`PIR_STATE` (where the directory and history are saved after each block and reloaded on start; default
`~/.bina-relay/pir-state.json`, outside the code folder so a redeploy doesn't wipe it), `PENDING_RPC` (mempool source, defaults to `UPSTREAM_RPC`; use a different provider, e.g. Tenderly's gateway, so pending
polling can't rate-limit block fetches).

Deployed on a small VM: the relay runs as a systemd service (`bina-relay`, bound to 127.0.0.1, MemoryMax 400M)
behind Caddy for HTTPS (sslip.io hostname, no DNS setup). The web app is a static build on GitHub Pages
(`bun run build -- --base /bina-pooche/`, pushed to the `gh-pages` branch), so our server never serves the page. The root
`Dockerfile` works for Railway/fly.io too. Mixnet exits only reach `https://` hosts on 443,
so a deployed relay needs a public https URL.

## Using the SDK

```ts
import { RpcClient, follow, scanBlock, SEPOLIA_TOKENS } from "@bina/sdk";

const rpc = new RpcClient("https://ethereum-sepolia-rpc.publicnode.com", anonFetch);   // any fetch, e.g. Anon-RPC's
const anchor = new RpcClient("https://sepolia.gateway.tenderly.co", anonFetch);        // different operator

await follow({ rpc, anchor, onBlock: (b) => {
  // b is verified: header hash, access-list hash, receipts root, and the anchor agrees on b.hash
  for (const a of scanBlock(b.bal, b.feed, myWallets, SEPOLIA_TOKENS))
    if (a.swapped) console.log(`${a.address} traded in block ${b.number}`, a.items);
}});
```

## How a block is proven

For every block the app uses:

1. `keccak(rlp(header)) == header.hash`, and the number is the one asked for
2. `keccak(rlp(accessList)) == header.blockAccessListHash` ([EIP-7928](https://eips.ethereum.org/EIPS/eip-7928))
3. The receipts trie root `== header.receiptsRoot`, so no event can be invented, edited or hidden
4. An independent provider agrees on the block hash (every block, so the anchor can't tell which blocks matter)

Balances come from storage slots inside the verified access list (USDC slot 9, WETH slot 3), never `balanceOf`.
"Who traded" comes from nonce changes in the access list (index = tx position + 1), not from the relay.

## Private lookup (PIR)

Single-server PIR (Kushilevitz–Ostrovsky over Paillier, from `paillier-bigint`) on a √N grid. The client
downloads the public directory, finds its row locally and sends one encrypted selector per column. The server
multiplies through every record and returns every row encrypted; only the client can read its row. 1,024
records: ~1.2 s end to end (3–5 s through the mixnet). The table is built from accounts active in verified blocks,
never from user requests.

**What the server learns.**
- *Balance lookup (PIR):* that someone looked something up, when, from which mixnet exit, plus a one-time public key and
  ~32 ciphertexts. Not the address or row (computational privacy: Paillier).
- *History lookup:* the same PIR query, then the set of block numbers the phone downloads, and their timing. Those
  blocks are the combined recent activity of up to 8 directory wallets, so the server learns "one of these 8 (or any
  other wallet whose activity also fits)", not which. That second phase is cover traffic (k-anonymity), not PIR.

**Private history, how.** Each PIR record carries the address's last 6 active blocks (it sent a tx, or its ETH, USDC
or WETH balance changed), as 20-bit offsets, 440 bits per record. After the lookup the phone downloads the union of
this address's blocks and up to 7 other wallets' blocks taken from the same PIR reply (one record per row), chosen
with the platform CSPRNG, capped at 48 blocks, in random order, each block on its own mixnet route, and verifies every
block like any other. It also checks the server's claims: every listed wallet must show activity in each listed
verified block, or the app flags the relay. If no cover exists, the app asks first.

Measured on Nov 6 (live relay, ~330 KB per block): crowd 4: 10 blocks, 14 s; crowd 8: 5–17 blocks, 9–21 s, ~1.4 MB;
crowd 16: 24 blocks, 28 s, 8 MB. In steady state (6 blocks per wallet) crowd 16 could reach 96 blocks (~32 MB, ~2 min)
and ~300 upstream calls on the relay, which would compete with the block feed's rate limit; crowd 32 needs a full
1,024-row directory and ~192 blocks. So the default is 8 with a 48-block cap (~16 MB, ~1 min worst case).

## Traffic through Anon-RPC, and the disclosed exceptions

Everything the browser sends goes through `anonFetch` (Anon-RPC worker), including blocks, anchor checks, PIR,
quotes, token names and sends. The Spy panel lists every request as the server received it, and shows our
relay's own server-side log (`GET /log`) next to it.

**Traffic share** (Network screen) = requests sent through Anon-RPC ÷ every request the app made since load,
counting the worker's bootstrap reads and any direct relay calls in the denominator. Measured against the
deployed site: **97.3%** (109 of 112, Nov 6). The 3 direct requests were Anon-RPC's own bootstrap at startup
(2 reads of the public network contract, 1 download of the network's code bundle, addressed by hash), so the
share rises the longer the app runs: a longer live session measured **99.7%** (876 of 879). A resource
observer counts any direct request the app didn't log itself.

**IP check (Nov 6):** with the relay's spy stream open, one deliberate direct call marked our IP's salted tag;
the app then made 84 relay requests, **0 from our IP**, spread over 3 mixnet exits. A browser network capture
showed no direct request to the relay, Tenderly or publicnode reads, only the bootstrap above.

Exceptions (all counted in the denominator above):

- **Bootstrap:** the Anon-RPC worker reads its specifier contract from a public node (publicnode, with fallbacks),
  directly. It's the same public data for every user and names no address.
- **Local relay:** a relay on `localhost` is fetched directly (exits can't reach it). Dev only; shown in the UI.
- **Named reads:** a few reads must name an address: your nonce and gas when sending, and balances of addresses
  not in the PIR directory. Each goes out on its own fresh mixnet route, so it can't be linked to you or to
  each other. The Spy panel highlights them.

## Who sees your IP

Checked Nov 6. Everything the app fetches goes through `anonFetch` (Anon-RPC), except these:

| Who | Sees your IP | Learns | Notes |
| --- | --- | --- | --- |
| Mixnet entry node | yes | that you use the mixnet; not destinations or content | inherent to any mixnet |
| GitHub Pages, when you **load the website** | yes | that you opened the site | the static app is hosted on GitHub Pages (moved off our server on Nov 6); GitHub's own logging applies. Our server no longer serves any page: the old site address doesn't answer. |
| Our server's error log | only for a request that fails | | Caddy keeps no access log. Its shared error log records the IP of a failed proxied request (so far only mixnet exits). That log can't be filtered per site, only globally, and the box is shared with another service, so it's left as is and disclosed. |
| Anon-RPC bootstrap | yes | that someone is starting Anon-RPC | 2 `eth_call`s to the public network contract (publicnode, with fallbacks) and the client code from `raw.githubusercontent.com`. No address. Counted in the traffic share. |
| Spy panel "Run the comparison" | yes (opt-in) | 2 public demo contract addresses | the "Normal RPC" column sends directly to our relay's demo lane on purpose. The lane is off by default (`ENABLE_NAIVE`), and when on it answers only about the demo addresses (`NAIVE_ALLOW`). |
| A relay on `localhost` | n/a | | dev only |

Everything else (block feed, second-provider checks, PIR, history, mempool feed, quotes, token names, sends, relay
log) reaches servers from mixnet exits. On the relay, per-IP rate-limit counters live in memory only (in practice
they hold exit IPs), the Spy log stores salted hashes, and its journal has no client IPs. Not checked: network-level
flow logs at the cloud provider (no access to the account).

**Isolation keys** (requests sharing a key share a mixnet route, so the exit could link them): the block feed and
the second-provider check each use one key for the session (address-free, identical for everyone); the mempool feed
has its own; every PIR directory fetch, PIR query, history block, one-off balance read, quote, token-name read and
relay-log poll gets a fresh key; a trade's preparation reads share one key and its send uses another.

## Choice of network

Nox (Sphinx) is the default; the Network page offers others, saved per device. Measured Nov 6 from the browser
against the live relay (same app, same blocks):

| Network | First verified block | Per block (header + list + receipts + second provider) |
| --- | --- | --- |
| Nox | 10 s | 2.6 s, ~280 KB |
| Nym | 50 s (larger client download) | 15.7 s, ~270 KB: slower than Sepolia's 12 s blocks, so alerts lag |
| Tor | not available | the EF demo gateway (`152.236.3.22:12298`) refused TCP connections at 19:15 IST on Nov 6 |

Running our own Tor gateway is ~1–2 hours (a WebSocket-to-Tor bridge behind Caddy). That gateway would see users'
IPs, like any Tor entry, but not destinations or content (the Tor circuit is end to end from the browser).

## Honest trade-offs

- **Copy trades can link you to the whale.** Your trade is public on-chain once it lands; trading the same pair
  right after a watched wallet can reveal that you follow it. Use a separate wallet for copy trading (the app says so
  on the copy screen).

- **The trade is public once it lands.** We hide reading and intent, not settled money.
- **Latency.** The mixnet adds seconds. Fine for swing and copy traders, not for millisecond trading.
- **Bandwidth.** The phone downloads whole blocks: ~250 KB to ~1 MB per Sepolia block from publicnode.
  The relay serves receipts without blooms (about 3x smaller).
- **No light client yet.** Each block hash is checked against a second provider. Faking data needs the relay
  and the anchor to collude. A light client (e.g. Helios) would remove this.
- **History anonymity is up to 8, not 1,000.** The history download hides the address among up to 8, not the whole directory,
  and the relay can see the downloads arrive together. The window covers the last 6 active blocks per address since
  the relay started indexing; older history isn't available.
- **PIR hides, it doesn't prove.** A lying PIR server could return a wrong balance; the next verified block
  that touches the address corrects it. Next step: proof-checked rows (`eth_getProof` against a verified header).
- **PIR scale.** Paillier PIR is slow on big tables, so the demo indexes ~1k active addresses. 1024-bit keys.
- **No private builder on Sepolia.** Flashbots removed the DNS for its Sepolia Protect RPC and relay (checked Nov 6,
  2026, and re-checked that evening: `rpc-sepolia.flashbots.net` and `relay-sepolia.flashbots.net` still resolve to
  nothing, so no Sepolia private-send test or Spy-panel "private vs public send" proof was possible), and the builders producing Sepolia blocks today (builder.nflaig.eth, MigaLabs rbuilder) publish no
  private-tx endpoint. The app checks the configured builder through the mixnet before offering the private route;
  on Sepolia it sends to the public mempool via the mixnet (IP hidden, tx visible before it lands). Set
  `VITE_SEND_URL=https://rpc.flashbots.net/fast` on mainnet.
- **Polling, not streaming.** We tried streaming new blocks (the relay's `/stream` SSE) through the Anon-RPC worker
  on Nov 6: the worker returns only complete responses, so an open stream times out after 25 s. The app polls by
  block number instead; alerts still arrive within a block (~12 s).
- **Keys on device.** The device key lives in `localStorage`. Production would use a passkey or hardware wallet.
- **Token names are untrusted.** Unknown tokens are marked; copy-trade is offered only for known pairs.
- **Pending alerts are unverified.** The mempool feed can't be proven against a block; the app labels it "pending,
  unverified" and replaces it with the verified alert when the block lands. A relay could show fake pending
  transactions; copying from a pending alert is your call, and the trade may front-run a tx that never lands.
- **The mempool feed is one shared snapshot,** the same bytes for everyone with no parameters; the relay learns only
  that an app is polling it, from a mixnet exit.
- **The Spy panel comparison is opt-in.** Its "Normal RPC" column really sends demo requests (public contract
  addresses, never yours) from your IP to our relay; that's the point of the demo.
- **Mainnet private send: tested, not built.** On Nov 6, through Anon-RPC: Flashbots Protect (`rpc.flashbots.net/fast`)
  and MEV Blocker (`rpc.mevblocker.io`) both answered `eth_chainId = 0x1`, rejected a malformed tx, and accepted a
  signed tx from an unfunded throwaway key (hash returned in ~1–2 s; it can never land). Not built as a setting:
  the whole app (tokens, Uniswap addresses, signing chain id, block feed) is Sepolia-only, and a mainnet-only send
  switch inside a Sepolia app could never be exercised end to end, so it would be untested code. It becomes a real
  setting when the app gets a mainnet mode, after Glamsterdam.
- **Testnet only** until Glamsterdam (block access lists) reaches mainnet.

## CROPS

- **C**ensorship resistance: the relay is optional and untrusted; any node serving `eth_getBlockAccessList` works.
- **O**pen source: MIT.
- **P**rivacy: reads are address-free; transport is Anon-RPC; lookups via PIR; sends leave from a mixnet exit
  (and skip the public mempool where a private builder exists, i.e. mainnet).
- **S**ecurity: every block is hash-checked three ways and anchored; keys never leave the device.

## After the hackathon

Not built, by choice (assessed Nov 6; each was too large or risky to finish properly before the deadline):

- **PIR beyond ~1,000 addresses.** Paillier PIR cost grows with the table; 2,048 is a one-setting change but 2–4×
  slower per lookup. Real coverage needs a hint-based scheme (SimplePIR/Spiral-style) updated from the block stream.
- **Shielded sends (Railgun on Sepolia).** Large proving artifacts and a separate broadcaster network that would also
  have to work through Anon-RPC: 6–10 hours, high risk.
- **A light client** (e.g. Helios) instead of trusting the relay plus a second provider: needs block-access-list
  support and its consensus reads through Anon-RPC; 4–8 hours, high risk.
- **Our own Tor gateway**, so Tor works when the EF demo gateway is down: ~1–2 hours; the gateway would see users'
  IPs (as any Tor entry does), not destinations or content.
- Proof-checked PIR rows (`eth_getProof` against a verified header); a mainnet mode after Glamsterdam, with the
  Flashbots Protect / MEV Blocker send route already tested; merchant payments on the same core (an earlier
  prototype is tagged `payments-v1`).

## AI usage

Built with help from Claude Code (Anthropic) for scaffolding, code and tests. All code reviewed by the team.

## License

MIT
