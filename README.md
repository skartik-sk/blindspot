# Bina Pooche (बिना पूछे)

Tap-to-pay for merchants where the RPC provider never learns who the merchant is or what they earn.

**Watch, don't ask.** The app never asks about an address. It downloads each block's
[EIP-7928](https://eips.ethereum.org/EIPS/eip-7928) access list (which everyone receives
identically), checks it against the block header, and finds its own payments locally. All traffic
goes through [Anon-RPC](https://github.com/ethereum/anon-rpc).

Track: Ethereum Foundation, Best Use of Anon-RPC (ETHGlobal Mumbai 2026).

## Layout

| Path | What |
| --- | --- |
| `packages/sdk` | Verifier SDK: BAL RLP + hash check, header hash check, local USDC/ETH detection, watch window |
| `apps/relay` | BAL Relay: fetches each block once, verifies, serves the identical stream to everyone; spy log |
| `apps/web` | PWA: `#/merchant` (charge), `#/customer` (pay), `#/diag` (Anon-RPC + verification check) |
| `docs/BRIEF.md` | Project brief |

## Run

```bash
bun install
bun test            # SDK + relay tests (uses a real Sepolia block fixture)
bun run relay       # relay on :8787, upstream = publicnode Sepolia
cd apps/web && cp .env.example .env && bunx vite   # app on :5173
```

Open `#/diag` first: it boots the Anon-RPC worker and verifies a live block through it.

### Anon-RPC network

Default is the **Sphinx mixnet** (specifier on Sepolia). Tor works too (`VITE_ANON_NETWORK=tor`) but needs a
reachable tor-js gateway (`VITE_TOR_GATEWAYS`); the public demo gateway was unreachable on Nov 6.
Mixnet/Tor exits only reach `https://` hosts on port 443, so the relay must be deployed publicly before
`VITE_RELAY_URL` can point at it. Until then lists come straight from publicnode, which is equally address-free.

Relay env: `UPSTREAM_RPC`, `PORT`, `POLL_MS`, `SPY_TOKEN`, `ENABLE_NAIVE=1` (demo lane), `RATE_LIMIT`, `TRUST_PROXY=1`.

## How a payment is proven

For each block in the watch window the client checks:

1. `keccak(rlp(header)) == header.hash` and `header.number` is the block asked for
2. `keccak(rlp(accessList)) == header.blockAccessListHash`
3. `header.parentHash` == previous block's hash (one chain)
4. For a block with a hit: an independent provider (via Anon-RPC) agrees on its hash

USDC balances come from the token's balance slot (`keccak(addr, 9)` for FiatTokenV2_2) inside the
verified list, so no `balanceOf` call is ever made.

## Honest trade-offs

- **Header trust.** Without a light client, a hit is trusted if the relay and an independent
  anchor provider agree on the block hash. Faking a payment needs both to collude. A light client
  (e.g. Helios) would remove this.
- **Customer balance.** The customer screen reads its own balance with `balanceOf`, through the mixnet under
  a fresh isolation key. That names the customer's address (never the merchant's) to the provider.
- **Keys on device.** Seed and burner key live in `localStorage`; the app loads no third-party scripts.
  Production would wrap them with a passkey.
- **Provider regions.** Some publicnode regions don't serve `eth_getBlockAccessList`; the SDK retries under a
  fresh isolation key (new route). Running our own relay removes this.
- **Sending is public.** Sender, receiver and amount are on-chain. We protect reads only.
- **Old balances** of arbitrary wallets are out of scope (that's PIR's job).
- **Testnet only** until Glamsterdam reaches mainnet.

## CROPS

- **C**ensorship resistance: the relay is optional and untrusted; any node serving `eth_getBlockAccessList` works.
- **O**pen source: MIT.
- **P**rivacy: reads are address-free; transport is Anon-RPC with a separate isolation key per sale.
- **S**ecurity: every list is hash-verified against the header; keys never leave the device.

## AI usage

Built with help from Claude Code (Anthropic) for scaffolding, code and tests. All code reviewed by the team.

## License

MIT
