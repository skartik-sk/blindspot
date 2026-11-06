# Bina Pooche (बिना पूछे)

A private trading companion. Watch whales, copy their trades, check balances and send trades, and your
RPC provider never learns what you hold, who you follow or what you're about to do.

**Watch, don't ask.** A normal wallet asks its provider about your addresses on every block, so the provider
knows your portfolio, your copy-trade list and your IP. Bina Pooche never asks about an address. It downloads
each block, the same bytes everyone gets, proves the block is real, and filters it on your device. Every
request goes through [Anon-RPC](https://github.com/ethereum/anon-rpc) (Sphinx mixnet).

Track: Ethereum Foundation, Best Use of Anon-RPC (ETHGlobal Mumbai 2026).

## What it does

| Screen | What you get | What the provider learns |
| --- | --- | --- |
| Portfolio | Balances of your wallets, updated every block | Nothing: block numbers only |
| Watch | Alerts the moment a watched wallet swaps, with what it sold and bought | Nothing: block numbers only |
| Lookup | Any address's ETH/USDC/WETH balance via PIR | An encrypted query; not which address |
| Trade / Send | Uniswap swap or transfer, signed on device, sent via Flashbots Protect | The tx when it's sent, from a mixnet exit, not in the public mempool |
| Spy panel | Side by side: a typical wallet's requests vs. this app's actual requests | — |

It's a PWA: one codebase for phone and desktop, installable from the browser.

## Layout

| Path | What |
| --- | --- |
| `packages/sdk` | The private core, usable by any wallet: header, access-list and receipts verification; event feed; per-wallet activity; chain follower; PIR client and server |
| `apps/relay` | Fetches each block once, verifies it, serves the same bytes to everyone; PIR balance table; spy log |
| `apps/web` | The app (React + Vite) |

## Run

```bash
bun install
bun test                      # 47 tests, real Sepolia block fixtures
bun run relay                 # relay on :8787
cd apps/web && VITE_RELAY_URL=http://localhost:8787 bunx vite    # app on :5173
```

Without `VITE_RELAY_URL` the app reads blocks straight from publicnode through the mixnet (no relay needed;
PIR lookup falls back to a one-off mixnet read). Relay env: `UPSTREAM_RPC`, `PORT`, `POLL_MS`, `SPY_TOKEN`,
`ENABLE_NAIVE=1`, `RATE_LIMIT`, `TRUST_PROXY=1`, `PIR_SEED` (comma-separated addresses), `PIR_MAX`.

Deploy the relay with the root `Dockerfile` (Railway, fly.io). Mixnet exits only reach `https://` hosts on 443,
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
records: ~1.2 s end to end. The table is built from accounts active in verified blocks, never from user requests.

## Traffic through Anon-RPC, and the disclosed exceptions

Everything the browser sends goes through `anonFetch` (Anon-RPC worker), including blocks, anchor checks, PIR,
quotes, token names and sends. The Spy panel lists every request as the server received it. Exceptions:

- **Bootstrap:** the Anon-RPC worker reads its specifier contract once from publicnode, directly.
- **Local relay:** a relay on `localhost` is fetched directly (exits can't reach it). Dev only; shown in the UI.
- **Named reads:** a few reads must name an address: your nonce and gas when sending, and balances of addresses
  not in the PIR directory. Each goes out on its own fresh mixnet route, so it can't be linked to you or to
  each other. The Spy panel highlights them.

## Honest trade-offs

- **The trade is public once it lands.** We hide reading and intent, not settled money.
- **Latency.** The mixnet adds seconds. Fine for swing and copy traders, not for millisecond trading.
- **Bandwidth.** The phone downloads whole blocks: ~250 KB to ~1 MB per Sepolia block from publicnode.
  The relay serves receipts without blooms (about 3x smaller).
- **No light client yet.** Each block hash is checked against a second provider. Faking data needs the relay
  and the anchor to collude. A light client (e.g. Helios) would remove this.
- **PIR hides, it doesn't prove.** A lying PIR server could return a wrong balance; the next verified block
  that touches the address corrects it. Next step: proof-checked rows (`eth_getProof` against a verified header).
- **PIR scale.** Paillier PIR is slow on big tables, so the demo indexes ~1k active addresses. 1024-bit keys.
- **Keys on device.** The device key lives in `localStorage`. Production would use a passkey or hardware wallet.
- **Token names are untrusted.** Unknown tokens are marked; copy-trade is offered only for known pairs.
- **Testnet only** until Glamsterdam (block access lists) reaches mainnet.

## CROPS

- **C**ensorship resistance: the relay is optional and untrusted; any node serving `eth_getBlockAccessList` works.
- **O**pen source: MIT.
- **P**rivacy: reads are address-free; transport is Anon-RPC; lookups via PIR; sends skip the public mempool.
- **S**ecurity: every block is hash-checked three ways and anchored; keys never leave the device.

## After the hackathon

Faster PIR with hints updated from the block stream; mempool streaming for earlier alerts; shielded sends;
merchant payments on the same core (an earlier prototype lives in this repo's history).

## AI usage

Built with help from Claude Code (Anthropic) for scaffolding, code and tests. All code reviewed by the team.

## License

MIT
