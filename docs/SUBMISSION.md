# ETHGlobal submission: Bina Pooche

**Prize:** Ethereum Foundation, Best Use of Anon-RPC (only).

## Short description

Watch whales and copy their trades without telling any RPC provider which wallets you follow.

## Description

Anon-RPC hides who you are; Bina Pooche also hides what you watch. A normal wallet asks its provider about your
addresses every block, and even through Anon-RPC a wallet that queries per address still tells the node which
wallets matter. Bina Pooche never asks about an address: every phone downloads the same verified Sepolia blocks by
number through Anon-RPC, proves them, and finds the trades of the wallets you watch on the device. You get whale and
copy-trade alerts (pending in a few seconds, verified within a block), your portfolio, any wallet's balance and recent
activity through private information retrieval, and on-device signed trades sent through the mixnet. A Spy panel shows,
from real requests, what a normal RPC, Anon-RPC alone, and Bina Pooche each reveal.

## How it's made

- **Relay, untrusted.** A Bun relay fetches each Sepolia block once, verifies it, and serves the same bytes to every
  client: header, EIP-7928 block access list, and receipts without blooms (~3x smaller). Requests name only a block
  number. It also serves one shared, parameterless mempool snapshot and a PIR table.
- **Verification on the phone.** Every block passes `keccak(rlp(header)) == hash`,
  `keccak(rlp(accessList)) == blockAccessListHash`, a receipts trie rebuilt to `receiptsRoot` (our own minimal MPT,
  canonical-hex guard), and a second operator (Tenderly) confirming each block hash. Balances come from verified
  access-list storage slots; "who traded" from verified nonce changes. The core is a reusable SDK (`packages/sdk`).
- **Anon-RPC.** Every request goes through `@anon-rpc/browser-harness` 0.4.0 on Nox (Sphinx) by default, with
  separate isolation keys per request type. Nym is selectable. If Nox can't boot (EF reported a topology failure on
  iPhone Safari), the app falls back to Nym automatically, deciding from the failure, never the browser, and never to a
  direct connection. Tor with the temporary EF gateway booted and reached the relay, but our anchor provider returns
  403 to Tor exits, so it isn't offered.
- **Measured traffic share:** 97.3% of requests through Anon-RPC on a short session, 99.7% (876 of 879) on a long one.
  The rest are Anon-RPC's own startup reads, counted against us. In an IP check, the relay received 84 app requests,
  0 from our IP, over 3 mixnet exits. Nox: first verified block in 10 s, then 2.6 s per block; Nym: 50 s, then 15.7 s.
- **Private lookup.** Single-server PIR (Kushilevitz–Ostrovsky over Paillier, 1024-bit keys) on a √N grid over
  ~1,000 addresses active in verified blocks: 3–5 s through the mixnet, and the result matched the chain. The server
  sees an epoch and ~32 ciphertexts, never the address.
- **Private history.** Each PIR record also carries the wallet's last 6 active blocks. The phone downloads those blocks
  mixed with up to 7 other wallets' blocks from the same PIR reply (k-anonymity, CSPRNG, 48-block cap), each on its own
  route, verifies them, and checks the relay's index against them. That's 9–37 s and 1.4–6 MB. The server learns "one
  of up to 8 wallets", not which.
- **Pending alerts.** A watched whale's swap showed as "pending, unverified" ~6 s after it was sent, then was replaced
  by the verified alert (~20 s).
- **Live test on Sepolia:** a whale swap, then the alert, then a one-tap copy trade landed in a verified block.
- **Persistence and hardening:** the directory and history are saved to disk (restart-tested). The Spy demo lane only
  answers about allowlisted demo addresses. 81 tests run against real Sepolia block fixtures.
- **Honest limits:**
  - trades are public once they land, and on Sepolia sends reach the public mempool (Flashbots has no Sepolia
    endpoint); mainnet Flashbots Protect and MEV Blocker were tested through Anon-RPC but aren't built in;
  - PIR covers ~1k addresses;
  - history anonymity is up to 8;
  - block trust is our relay plus a second provider (no light client yet).
- **Stack:** Bun, TypeScript, viem, React 19 + Vite PWA (GitHub Pages), Caddy + systemd. Built with help from Claude
  Code.

## Links

- Live app: https://skartik-sk.github.io/bina-pooche/
- Source: https://github.com/skartik-sk/bina-pooche (private until submission)
- Demo video: VIDEO_LINK_HERE

## Pre-submission checklist

| Check | Status (Nov 7) |
| --- | --- |
| Live site works (all screens, desktop + phone, Nox live, 0 console errors) | done, verified after the last Pages deploy |
| Tests pass (`bun test`) | 81 pass, 0 fail |
| No secrets in git history (all 122 commits scanned: keys, tokens, `.env`, server access) | clean |
| README complete (claims checked against the live app) | done |
| Demo video recorded and link added above | waiting on you |
| Repo made public | waiting on your approval, right before submitting |
| Real-iPhone check of the Nox → Nym fallback | waiting on you (simulated on desktop: live on Nym in 41 s) |
