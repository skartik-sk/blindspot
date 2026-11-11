# Blindspot

*Watch from their blind spot.* We started as **Bina Pooche** (बिना पूछे, Hindi for "without asking"): the app never
asks a provider about an address. The name changed; the idea didn't.

**Anon-RPC hides who you are. We also hide what you watch.**

A private trading companion: watch whales, get copy-trade alerts, check any wallet's balance and history, and trade,
without any RPC provider learning which wallets you care about.

Anon-RPC alone hides your IP. But a wallet that sends `eth_getBalance(0xWhale…)` or `eth_getLogs(…0xWhale…)` through
Anon-RPC still tells the node *which* addresses matter; it just doesn't know who asked. Repeat that every block and
the node holds your watchlist, minus your name. Blindspot never asks about an address. Every phone downloads the
same verified blocks by number (through Anon-RPC's Nox network, the Sphinx mixnet, specifier
`0x35133267A8F7EC35046a83DCA0f4Ca8A6e1b7A9A` on Sepolia) and filters them locally. Balance and history lookups use PIR.
The Spy panel shows all three side by side, from real requests: a normal RPC, Anon-RPC alone, and us.

Track: Ethereum Foundation, Best Use of Anon-RPC (ETHGlobal Mumbai 2026).

## Why this is different

Private RPCs and private wallets hide *who you are*: your IP, sometimes your requests. They still have to ask a
server about the addresses you care about, so they can't privately **watch other wallets** or **look up an
address's balance**: the question itself gives the address away.

Blindspot never asks about an address:

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
- **Who we trust.** Blocks come from our relay, but the phone checks every one against the Ethereum sync committee
  with a light client (see "How a block is proven"): a relay can't make up a block. What it can still do is stop
  serving, or lie about the private lookup's answer (labelled "not yet proven" until a verified block shows it). The
  relay and the PIR server are the same machine, run by us.
- **Sends are public once they land,** and on Sepolia they pass the public mempool (no private builder there).

## Live

- App: https://useblindspot.xyz/ (GitHub Pages; landing at `/`, app at `#/portfolio`)
- Relay: https://bina-relay.13-53-45-89.sslip.io/health

## Tested on the live site (Nov 7)

We ran everything below against https://useblindspot.xyz/ on the morning of Nov 7, in a desktop browser and at phone
width. The checks were real requests and real Sepolia blocks, nothing mocked.

| What we checked | Result |
| --- | --- |
| Site, domain and HTTPS | Loads over HTTPS. `http://`, `www` and the old github.io address all redirect to it. The tab shows the Blindspot icon. |
| Every screen (landing, Portfolio, Watch, Lookup, Send, Spy, Network) | Loads on desktop and at 390 px wide. No console errors, no sideways scrolling. |
| Going live | Live on Nox in 10–20 s when the network was healthy. |
| Watch alerts | 25 verified alerts with "block N ✓". Pending ones are marked unverified and can't be copied. |
| Background toggle on, tab hidden | Kept following blocks (12080063 → 12080067) and fired 5 notifications for a watched trader. |
| Background toggle off, tab hidden | "Paused", and 0 requests in 30 s. Back to Live on return. |
| Watch mode | Turns on, keeps the screen awake, and turns off when you leave the screen. |
| Private lookup of the demo whale | Correct balance in 8.5 s. History hidden among 8 wallets in 53.5 s (11.2 MB, on Nym). The answer was then checked against those blocks: "Partly proven ✓ (USDC)". |
| Spy panel | Normal RPC: 2 addresses plus our IP. Anon-RPC alone: 2 addresses. Blindspot: 0. |
| Traffic share | 98.7% (230 of 233 requests) on the Network page. |
| Worker code | Nox and Nym both start from our own hash-checked copy. Nothing loads from GitHub, jsDelivr or unpkg. |
| Mixnet outage | Real, from about 04:25 IST, on and off. The app showed "Switched to Nym because Nox stopped responding", then "Nox and Nym both stopped responding". It never connected directly. |

Not repeated on Nov 7: a copy trade and a send landing on-chain. Both passed on the live site on Nov 6 (whale swap,
then alert, then a one-tap copy trade that landed in a verified block). On the new domain the device wallet has no
Sepolia funds yet. Steps to repeat them are in `docs/TESTING.md`.

## What it does

| Screen | What you get | What the provider learns |
| --- | --- | --- |
| Portfolio | Balances of your wallets, updated every block | Block numbers only; a wallet's first balance comes from PIR (or a one-off mixnet read if it isn't in the directory) |
| Watch | Alerts the moment a watched wallet swaps, with what it sold and bought; pending (mempool) alerts seconds earlier, marked unverified | Nothing: block numbers and a parameterless mempool snapshot |
| Lookup | Any address's ETH/USDC/WETH balance and recent activity, via PIR | An encrypted query; then blocks that fit up to 8 wallets equally |
| Trade / Send | Uniswap swap or transfer, signed on device, sent through Anon-RPC | The tx, from a mixnet exit (not your IP). On Sepolia it goes to the public mempool |
| Spy panel | Three columns from real requests: normal RPC (your IP + addresses), Anon-RPC alone (addresses), ours (block numbers) | — |
| Network | Traffic share: % of requests sent through Anon-RPC, live | — |

It's a PWA: one codebase for phone and desktop. It installs like an app ("Install app" where the browser offers it;
Share -> Add to Home Screen on iOS), with home-screen shortcuts to Watch, Lookup and Trade. A small service worker
caches only the app's own files, so the installed app opens instantly and offline; every other request (Anon-RPC,
the relay, providers) passes straight through it. SEO: per-page titles, description, canonical URL, Open Graph and
Twitter cards, PNG favicons, JSON-LD, `robots.txt` and `sitemap.xml`. The landing page's headline rotates through six lines every 4 s
(one fixed-size box, so nothing below moves); with reduced motion on, it shows the first line only. "How it works"
lights its three steps in turn (live block request, a packet crossing three mixnet hops, four checks ticking), the
FAQ is a one-at-a-time accordion, and the footer is a photo of the Bandra–Worli Sea Link at dusk whose sky fades into
the page (photo by Shamoil on Unsplash, Unsplash License; self-hosted, so no request goes to Unsplash); all motion is
CSS or `motion` and stops under reduced motion. In the app, a "Getting started" checklist on Portfolio shows the next step (connect,
watch a wallet, first alert, private lookup, Spy panel), each derived from real app state; it can be hidden.

**When something is down.** Every screen keeps working on what it can: if the relay can't be reached, the status pill
says "Reconnecting" with a plain reason (raw error under Network → Details), Lookup says the private directory is
unreachable and falls back to a one-off mixnet read (labelled as such), and history is skipped rather than guessed.

Demo: `docs/DEMO.md` (script) and `docs/DEMO-CHECKLIST.md` (exact steps, timings, fallbacks). Submission text and checklist:
`docs/SUBMISSION.md`.

## Layout

| Path | What |
| --- | --- |
| `packages/sdk` | The private core, usable by any wallet: header, access-list and receipts verification; event feed; per-wallet activity; chain follower; PIR client and server |
| `apps/relay` | Fetches each block once, verifies it, serves the same bytes to everyone; PIR balance table; spy log; public `GET /log` (block numbers only) |
| `apps/web` | The app (React + Vite) |

## Quickstart

```bash
bun install
bun run dev        # local relay (:8787) + the app (:5173), both with live reload
bun run check      # tests, typecheck (web, relay, sdk), production build, lint: one line, exit code 0 = good
bun run pin        # refresh the pinned Anon-RPC specifiers, the self-hosted worker code and the light-client checkpoint
```

**Run your own, in one command** (a Linux machine with Docker, and two DNS names pointing at it):

```bash
cp .env.example .env          # set SITE_DOMAIN and RELAY_DOMAIN
docker compose up -d --build  # relay + website + automatic HTTPS (Caddy)
docker compose --profile tor up -d --build   # also a Tor gateway (needs UDP 12298 open; set PUBLIC_IP)
```

**GitHub Pages:** `.github/workflows/pages.yml` builds and publishes the site on every push to `main` (set the
repository variable `RELAY_URL`; Settings → Pages → Source: GitHub Actions). `.github/workflows/ci.yml` runs
`bun run check` on every push.

Relay settings. Without `VITE_RELAY_URL` the app reads blocks straight from publicnode through the mixnet (no relay needed;
PIR lookup falls back to a one-off mixnet read). Relay env: `UPSTREAM_RPC`, `PORT`, `POLL_MS`, `SPY_TOKEN`,
`ENABLE_NAIVE=1`, `RATE_LIMIT`, `TRUST_PROXY=1`, `PIR_SEED` (comma-separated addresses, never evicted), `PIR_MAX`,
`PIR_NEW_PER_BLOCK` (default 8: how fast new wallets enter the directory; lower keeps quiet wallets listed longer),
`NAIVE_ALLOW` (addresses the demo lane may answer about; default the Sepolia Uniswap router and quoter),
`PIR_STATE` (where the directory and history are saved after each block and reloaded on start; default
`~/.bina-relay/pir-state.json`, outside the code folder so a redeploy doesn't wipe it), `PENDING_RPC` (mempool source, defaults to `UPSTREAM_RPC`; use a different provider, e.g. Tenderly's gateway, so pending
polling can't rate-limit block fetches).

Deployed on a small VM: the relay runs as a systemd service (`bina-relay`, bound to 127.0.0.1, MemoryMax 400M)
behind Caddy for HTTPS (sslip.io hostname, no DNS setup). The web app is a static build on GitHub Pages
(`bun run build -- --base /`, pushed to the `gh-pages` branch), so our server never serves the page. The root
`Dockerfile` works for Railway/fly.io too. Mixnet exits only reach `https://` hosts on 443,
so a deployed relay needs a public https URL.

## Using the SDK

```ts
import { RpcClient, follow, scanBlock, SEPOLIA_TOKENS } from "@blindspot/sdk";

const rpc = new RpcClient("https://ethereum-sepolia-rpc.publicnode.com", anonFetch);   // any fetch, e.g. Anon-RPC's
const anchor = new RpcClient("https://sepolia.gateway.tenderly.co", anonFetch);        // different operator

await follow({ rpc, anchor, onBlock: (b) => {
  // b is verified: header hash, access-list hash, receipts root, and the anchor agrees on b.hash
  for (const a of scanBlock(b.bal, b.feed, myWallets, SEPOLIA_TOKENS))
    if (a.swapped) console.log(`${a.address} traded in block ${b.number}`, a.items);
}});
```

**For any wallet or dapp: an EIP-1193 provider.** Every read goes through the anonymous fetch you give it, block
headers are checked against their hashes (and, with a light client, against heads the sync committee signed),
`eth_chainId` is answered locally, and anything that would sign or send for an account is refused (error 4200):

```ts
import { createProvider, LightClient } from "@blindspot/sdk";

const provider = createProvider({ url: "https://ethereum-sepolia-rpc.publicnode.com", fetch: anonFetch, chainId: 11155111 });
const client = createPublicClient({ chain: sepolia, transport: custom(provider) }); // viem, or new ethers.BrowserProvider(provider)
```

**The light client on its own:** `new LightClient({ get, checkpoint, bootstrap })`, where `get(path)` fetches a beacon
API path (through Anon-RPC), then `await lc.latest()` returns the execution block hash the sync committee signed.

## How a block is proven

For every block the app uses:

1. `keccak(rlp(header)) == header.hash`, and the number is the one asked for
2. `keccak(rlp(accessList)) == header.blockAccessListHash` ([EIP-7928](https://eips.ethereum.org/EIPS/eip-7928))
3. The receipts trie root `== header.receiptsRoot`, so no event can be invented, edited or hidden
4. **A beacon light client**: the block links by parent hash to an execution block hash that the Ethereum sync
   committee (512 validators) signed. The app shows the block at once and adds its ✓ when a signed head links back
   to it, usually 10–20 s later.

The light client (`packages/sdk/src/lightclient.ts`) starts from a finalized checkpoint pinned at build time
(`bun run pin` checks it three ways: the bootstrap header hashes to it, its sync committee's Merkle branch verifies,
and a beacon API from another operator agrees on the root). From there it follows each sync-committee period
(each new committee signed by the old one) and verifies every head: BLS aggregate signature from at least 2/3 of the
committee, and the Merkle branch from the execution block hash into the signed beacon block (Gloas layout on
Sepolia, Electra on mainnet). The beacon data comes through Anon-RPC like everything else. If the relay ever serves a
block the signed chain contradicts, its alerts are flagged in red and can't be copied. Copy trade is only offered once
a block is proven.

If the light client can't start or fails 5 times in a row, the app falls back to the old check (a second provider,
Tenderly, confirms each block hash) and says so on the Network page. Tested against real Sepolia data, including
forged heads and tampered signatures (`packages/sdk/test/lightclient.test.ts`).

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
with the platform CSPRNG, capped at 48 blocks, in random order, each block as its own request through the mixnet, and verifies every
block like any other. It also checks the server's claims: every listed wallet must show activity in each listed
verified block, or the app flags the relay. If no cover exists, the app asks first.

Measured on Nov 6 (live relay, ~330 KB per block): crowd 4: 10 blocks, 14 s; crowd 8: 5–19 blocks, 9–37 s, 1.4–6 MB;
crowd 16: 24 blocks, 28 s, 8 MB. In steady state (6 blocks per wallet) crowd 16 could reach 96 blocks (~32 MB, ~2 min)
and ~300 upstream calls on the relay, which would compete with the block feed's rate limit; crowd 32 needs a full
1,024-row directory and ~192 blocks. So the default is 8 with a 48-block cap (~16 MB, ~1 min worst case).

## Traffic through Anon-RPC, and the disclosed exceptions

Everything the browser sends goes through `anonFetch` (Anon-RPC worker), including blocks, anchor checks, PIR,
quotes, token names and sends. The Spy panel lists every request as the server received it, and shows our
relay's own server-side log (`GET /log`) next to it.

**Traffic share** (Network screen) = requests sent through Anon-RPC ÷ every request the app made since load,
counting any startup reads and direct relay calls in the denominator. **Since Nov 11 it is 100% from the first
request**: the app answers Anon-RPC's startup reads itself from pins and serves the worker code from its own site
(see "Pinned startup"). Before that, measured against the deployed site: **97.3%** (109 of 112, Nov 6). The 3 direct requests were Anon-RPC's own bootstrap at startup
(2 reads of the public network contract, 1 download of the network's code bundle, addressed by hash), so the
share rises the longer the app runs: a longer live session measured **99.7%** (876 of 879). A resource
observer counts any direct request the app didn't log itself.

Since Nov 7 the code download no longer goes to a third party. The worker used to come from
`raw.githubusercontent.com` (Nox) or jsDelivr (Nym), and those hosts saw every user's IP at startup. Now we serve
the same bytes from useblindspot.xyz. The on-chain specifier still supplies the hash, and the harness still checks
the bytes against it. We only put our copy first in its list of download URLs. A stale copy fails the hash check
and the harness moves on to the original URLs (`apps/web/src/lib/resolvers.ts`, tested). Startup is now 2 direct
requests instead of 3: in a browser check, Nox ran from our copy with 12 of 14 requests through the mixnet in the
first 20 s.

**IP check (Nov 6):** with the relay's spy stream open, one deliberate direct call marked our IP's salted tag;
the app then made 84 relay requests, **0 from our IP**, spread over 3 mixnet exits. A browser network capture
showed no direct request to the relay, Tenderly or publicnode reads, only the bootstrap above.

Exceptions (all counted in the denominator above):

- **Startup, only if a pin is stale:** a network whose pinned specifier is out of date (or can't boot) reads its
  specifier contract from a public node directly on its next start: 2 reads, the same public data for every user, no
  address. Counted in the share. With current pins this doesn't happen.
- **Local relay:** a relay on `localhost` is fetched directly (exits can't reach it). Dev only; shown in the UI.
- **Named reads:** a few reads must name an address: your nonce and gas when sending, and balances of addresses
  not in the PIR directory. Each leaves from a mixnet exit, so the node doesn't learn who asked. We don't claim these reads can't be linked to
  each other (see "Isolation keys" below). The Spy panel highlights them.

## Who sees your IP

Checked Nov 6. Everything the app fetches goes through `anonFetch` (Anon-RPC), except these:

| Who | Sees your IP | Learns | Notes |
| --- | --- | --- | --- |
| Mixnet entry node | yes | that you use the mixnet; not destinations or content | inherent to any mixnet |
| GitHub Pages and Cloudflare (DNS and HTTPS for useblindspot.xyz), when you **load the website** | yes | that you opened the site | the static app is hosted on GitHub Pages (moved off our server on Nov 6); GitHub's own logging applies. Our server no longer serves any page: the old site address doesn't answer. |
| Our server's error log | only for a request that fails | | Caddy keeps no access log. Its error log records the client IP of a failed proxied request (an aborted stream, or the relay restarting). Since the website moved, the requests our server receives come from mixnet exits (plus the opt-in Spy demo lane), so what it can record are mixnet-exit IPs. That log can only be filtered globally, and the server is shared with another team's service, so we left it as is rather than change their logging. |
| Anon-RPC startup, only with a stale pin | yes | that someone is starting Anon-RPC | 2 `eth_call`s to the public network contract (publicnode, with fallbacks). No address. Normally 0: the app answers these from pins. |
| Spy panel "Run the comparison" | yes (opt-in) | 2 public demo contract addresses | the "Normal RPC" column sends directly to our relay's demo lane on purpose. The lane is off by default (`ENABLE_NAIVE`), and when on it answers only about the demo addresses (`NAIVE_ALLOW`). |
| A relay on `localhost` | n/a | | dev only |

Everything else (block feed, second-provider checks, PIR, history, mempool feed, quotes, token names, sends, relay
log) reaches servers from mixnet exits. On the relay, per-IP rate-limit counters live in memory only (in practice
they hold exit IPs), the Spy log stores salted hashes, and its journal has no client IPs. Not checked: network-level
flow logs at the cloud provider (no access to the account).

**Isolation keys: they work on Tor, not on Nox or Nym.** Anon-RPC lets an app tag each request with an
`isolationKey`, and its README says support "varies". On Nov 7 we downloaded the exact worker code the app runs
(Nox `@hisoka-io/anon-rpc-worker` and Nym `@nymproject/anon-rpc-worker` 0.1.0) and searched it, including the two
WebAssembly modules inside the Nox bundle: neither reads `isolationKey` or `anonOptions`. EF's tor-js does: different
keys never share a Tor circuit. So on Nox and Nym we don't claim our keys keep requests apart. Blindspot doesn't
depend on them: block requests are the same for everyone, and the few reads that name an address (your nonce and
gas when sending, lookups outside the PIR directory) say so in the Spy panel. We send the keys anyway, so Tor (and
any future worker that honours them) gets them for free.

## Two anonymous networks, side by side

The app runs **Nox and Nym at the same time** (two Anon-RPC workers in one page), so one network stalling never
stalls the app. On Nov 7, during judging, Nox exits stopped offering TLS tunnels for about 35 minutes and the app
sat on "Reconnecting"; this is the fix. Logic: `apps/web/src/lib/lanes.ts` (pure, tested) and `anon.ts`.

- **Warm standby:** Nym starts in the background about 10 s after Nox works (not when the browser asks to save
  data), and idle networks get a cheap request every minute so their routes stay open. Measured: once both are warm,
  a request takes about 0.55 s on either.
- **Probe before trust:** a network counts as working only after a real request through it succeeds. A network still
  starting gets 90 s of grace for ordinary timeouts (Nym's first answer takes 17–60 s); errors that mean it can't work
  (`TOPOLOGY_FETCH_FAILED`, "No exit offers TLS tunnels") mark it down at once.
- **Instant failover, no reload:** requests go to the best working network. A down network is probed again after
  15 s, doubling to 5 minutes, and takes traffic back as soon as it answers.
- **Hedging, for address-free reads only:** if the first network is slow (3× its usual time, 3–15 s), the same block
  read is also sent on the other one; the first answer wins. A read that names an address is never hedged, and moves
  to the other network only if it never left the first (start-up or route errors), so a server can't link two copies.
- **Never direct.** If no network works, requests fail and the app says "Nox and Nym aren't responding".
- **Your choice wins:** a network you pick on the Network page runs alone; if it stalls, a banner offers the switch.

Tested in the browser with a simulated Nox stall (`?simulate-nox-stall`, development builds only): Nym took over
without a reload, and the traffic share stayed 100%. iPhone Safari, where Nox can't start (EF, Nov 6), is the same
path: Nox fails with a start-up error, Nym carries the traffic.

### Pinned startup: 0 direct requests

The stock Anon-RPC harness starts by reading each network's specifier contract (`workerHash()`,
`workerResolvers()`) directly from a public node, and downloads the worker code from GitHub or a CDN, so those hosts
see every user's IP. Blindspot answers the two reads itself from pins generated by `bun run pin`
(`apps/web/src/lib/pins.json`) and serves a hash-checked copy of the worker code from its own site, listed first.
Measured: **100.0% of requests through Anon-RPC from the first request**, 0 startup requests.

Pins go stale when a network ships a new worker (Nox moved from 0.4.1 to 0.4.2 between Nov 7 and Nov 11). The app
checks the live specifier through the mixnet; a pin is marked stale only when two different RPC operators, each read
through a different network, report the same new hash, and then that network's next start does the normal live read.
A runtime answer is never saved as a trusted pin, so a lying RPC can't choose which worker code runs. A pin that
can't boot also falls back to the live read, so availability never depends on it.


## Choice of network

Nox (Sphinx) is the default; the Network page offers others, saved per device. Measured Nov 6 from the browser
against the live relay (same app, same blocks):

| Network | First verified block | Per block (header + list + receipts + second provider) |
| --- | --- | --- |
| Nox | 10 s | 2.6 s, ~280 KB |
| Nym | 50 s (larger client download) | 15.7 s, ~270 KB: slower than Sepolia's 12 s blocks, so alerts lag |
| Tor | not offered yet | Both blockers from Nov 7 are now solved or ready: the light client replaced Tenderly (which refused Tor exits), and `docker compose --profile tor` runs EF's tor-js gateway. What's left is opening UDP 12298 on our server's firewall (AWS security group) and publishing the gateway address. The EF demo gateways were down when tested (Nov 6, Nov 7, Nov 11). |

A Tor gateway sees users' IPs, like any Tor entry, but never destinations or content: the Tor circuit is built end to
end in the browser, and the gateway only forwards encrypted bytes to Tor relays it finds in the public consensus.

## Trade-offs

- **Copy trades can link you to the whale.** Your trade is public on-chain once it lands; trading the same pair
  right after a watched wallet can reveal that you follow it. Use a separate wallet for copy trading (the app says so
  on the copy screen).
- **The trade is public once it lands.** We hide reading and intent, not settled money.
- **Latency.** The mixnet adds seconds. Fine for swing and copy traders, not for millisecond trading.
- **Bandwidth.** The phone downloads whole blocks: ~250 KB to ~1 MB per Sepolia block from publicnode.
  The relay serves receipts without blooms (about 3x smaller).
- **Data use.** About 250–330 KB per block while the app is open (roughly 75–100 MB an hour on Sepolia's 12 s
  blocks); nothing while it's hidden or closed, unless you turn on background watching. The Network page shows the live per-block average.
- **The light client is optimistic, not finalized.** It follows the latest head the sync committee signed (like
  Atmos and most light clients), so a deep reorg could change a block it already marked. Finality checks would add
  ~13 minutes of delay. If it fails 5 times in a row the app falls back to a second provider and says so.
- **History anonymity is up to 8, not 1,000.** The history download hides the address among up to 8, not the whole directory,
  and the relay can see the downloads arrive together. The window covers the last 6 active blocks per address since
  the relay started indexing; older history isn't available.
- **PIR hides; the device checks it when it can.** A PIR answer starts as "Private, not yet proven". When a block
  this device verifies shows that address's balance (the history download fetches its last active blocks, and the
  live feed and the last 30 blocks in memory are checked too), the app compares:
  - same value: **proven ✓ (block N)**, per asset ("Partly proven ✓ (ETH)" when only ETH changed in a verified block).
    This means "equals the verified balance at block N", not "proven current": the server picks which blocks a
    record lists, so a stale answer could match an older block;
  - different value at or before the PIR snapshot: **"Mismatch: the server may have lied"**, and the verified value is
    shown;
  - different value in a later block: "Updated from verified block N", a real change, not an accusation.

  No new requests and no change to the PIR protocol (`apps/web/src/lib/proof.ts`, tested). An address with no
  verifiable block in reach stays "not yet proven". The server's snapshot block is capped at the device's own
  verified head, and any difference always shows the verified value. Next step: proof-checked rows (`eth_getProof` against a verified
  header).
- **PIR scale.** Paillier PIR is slow on big tables, so the demo indexes ~1k active addresses. 1024-bit keys.
- **Sends.** On Sepolia, sends are signed on the device and go through Anon-RPC to the public mempool: the node
  doesn't see your IP, but the tx is visible before it lands. There is no private builder on Sepolia: Flashbots
  removed the DNS for its Sepolia Protect RPC and relay (`rpc-sepolia.flashbots.net` and `relay-sepolia.flashbots.net`
  resolved to nothing when checked twice on Nov 6), and the builders producing Sepolia blocks (builder.nflaig.eth,
  MigaLabs rbuilder) publish no private-tx endpoint, so no Sepolia private-send test or Spy-panel proof was possible.
  On mainnet, Flashbots Protect and MEV Blocker were tested and accepted transactions through Anon-RPC (details
  below), but they're not built into the app, because the app is Sepolia-only.
- **Polling, not streaming.** We tried streaming new blocks (the relay's `/stream` SSE) through the Anon-RPC worker
  on Nov 6: the worker returns only complete responses, so an open stream times out after 25 s. The app polls by
  block number instead; alerts still arrive within a block (~12 s).
- **Paused in the background.** When the tab or app is hidden, block following stops (no requests at all; checked
  in the browser: 0 requests in 36 s hidden) and the app shows "Paused while in background". When it's visible again
  it catches up from the last block it saw, at most 30 blocks; older ones are skipped and it says how many.
- **Background alerts are opt-in, and nothing new is sent.** Watch → "While you're away":
  - **Keep watching in background** (desktop, off by default): blocks keep downloading while the tab is hidden, and a
    local browser notification fires when a watched wallet trades. Permission is asked only when you turn it on, and
    the text comes only from data already on the device. Browsers may slow hidden tabs, so it can be up to a minute
    late.
  - **Watch mode** (phones; shown only where the Screen Wake Lock API exists): keeps the screen awake while you watch,
    with a battery warning. It's released when you leave the screen, switch apps or tap again.

  Alerts work while the tab is open (including in the background on desktop) or with Watch mode on a phone. Fully closed-app push is future work: private bucketed push, where the server only learns a coarse address group shared by thousands of wallets.
- **Keys on device.** The device key lives in `localStorage`. Send → "This wallet's key" can back it up (behind a
  warning, masked until shown, copy or download a text file) and import one (validated, shows the address it opens,
  asks you to confirm the old key is backed up). The key is never logged or sent anywhere: checked in the browser
  across 251 requests on Nov 7. Production would use a passkey wallet or hardware wallet.
- **Token names are untrusted.** Unknown tokens are marked; copy-trade is offered only for known pairs.
- **Pending alerts are unverified.** The mempool feed can't be proven against a block; the app labels it "pending,
  unverified" and replaces it with the verified alert when the block lands. A relay could show fake pending
  transactions, so copy trade is offered only once the block verifies the swap (the pending row says "Copy after
  the block confirms it").
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
- **P**rivacy: reads are address-free; transport is Anon-RPC; lookups via PIR; sends leave from a mixnet exit (on
  Sepolia they reach the public mempool).
- **S**ecurity: every block is hash-checked three ways and anchored; keys never leave the device.

## What's next

In order of what removes the most trust or leakage. Assessed Nov 6–7; each was too large or risky to finish
properly before the deadline.

- **Done Nov 11: light client, two networks side by side, pinned startup, one-command deploy.** See the sections
  above. What follows is still open.
- **Hint-based PIR (SimplePIR / YPIR).** Paillier PIR cost grows with the table, so we index ~1,000 addresses. A
  hint-based scheme updated from the block stream would cover every active address, and could serve history rows
  directly instead of k-anonymity cover downloads.
- **A passkey wallet.** The device key lives in `localStorage` today (with backup and import). A passkey (WebAuthn)
  smart account would keep the key in the phone's secure hardware.
- **A dedicated server with monitoring.** The relay shares a small machine with another team's service. Its own
  box, uptime and block-lag alerts, and per-site logging (no client IPs) are next.
- **Browser tests in CI.** 110 unit tests run on real Sepolia fixtures; the end-to-end checks (Nox boot, a verified
  block, pause in background, copy trade) were run by hand in a browser and should run on every push.
- **Shielded sends (Railgun on Sepolia).** Large proving artifacts and a separate broadcaster network that would also
  have to work through Anon-RPC: 6–10 hours, high risk.
- **Tor as a third network.** The gateway image is in `deploy/tor-gateway.Dockerfile`; it needs UDP 12298 opened on
  the server and its address added to the app. Then Tor joins Nox and Nym as a lane, with real per-request circuits.
- Proof-checked PIR rows (`eth_getProof` against a verified header); a mainnet mode after Glamsterdam, with the
  Flashbots Protect / MEV Blocker send route already tested; merchant payments on the same core (an earlier
  prototype is tagged `payments-v1`).

## AI usage

Built with help from Claude Code (Anthropic) for scaffolding, code and tests. All code reviewed by the team.

## License

MIT
