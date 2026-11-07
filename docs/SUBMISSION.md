# ETHGlobal submission: Blindspot

**Prize:** Ethereum Foundation, Best Use of Anon-RPC (only).

## Short description

Watch whales and copy their trades without telling any RPC provider which wallets you follow.

## Description

Anon-RPC hides who you are. We wanted to also hide what you're looking at.

If you follow a whale with a normal wallet, your app asks its RPC provider about that address every block. Route
the same requests through Anon-RPC and the provider loses your IP, but it still sees the addresses. Do that every 12
seconds and it can rebuild your watchlist without ever knowing your name.

So Blindspot never asks about an address. Every phone downloads the same Sepolia blocks by number through Anon-RPC,
checks them, and looks for the watched wallets on the device. You get alerts when a whale trades (a pending one in a
few seconds, a verified one within a block). You can copy the trade with one tap, signed on the phone and sent
through the mixnet. You can look up any wallet's balance and recent activity with private information retrieval.
And there's a Spy panel that shows, from real requests, what a normal RPC, Anon-RPC alone and Blindspot each give
away.

## How it's made

**The relay doesn't need to be trusted.** A small Bun server fetches each Sepolia block once and serves the same
bytes to everyone: the header, the EIP-7928 block access list, and the receipts with the blooms stripped (about 3x
smaller). Requests name a block number and nothing else.

**The phone checks every block.** It hashes the header and compares it to the block hash. It hashes the access list
and compares it to `blockAccessListHash`. It rebuilds the receipts trie (our own small Merkle Patricia trie) and
compares it to `receiptsRoot`. A second operator, Tenderly, has to confirm the same block hash. Balances come
straight out of the verified access list, and "who traded" comes from verified nonce changes. All of this lives in a
reusable SDK (`packages/sdk`).

**Everything goes through Anon-RPC.** We use `@anon-rpc/browser-harness` 0.4.0 with Nox by default, and Nym as an
option.
- If Nox can't start, which EF reported on iPhone Safari, the app moves to Nym by itself.
- On Nov 7 Nox also stopped mid-session for a while, so we added a mid-session switch too, with retries back to Nox.
- It never falls back to a direct connection.
- The worker code itself now loads from our own site. It's still checked against the hash the network publishes
  on-chain, so GitHub and jsDelivr no longer see users' IPs at startup.

**The numbers.**
- 97.3% of requests went through Anon-RPC in a short session, 99.7% (876 of 879) in a long one, and 98.7% on Nov 7.
  The rest are Anon-RPC's own startup reads, and we count them against ourselves.
- In an IP check the relay got 84 requests from the app, none from our IP, through 3 mixnet exits.
- Nox gives the first verified block in about 10 s, then 2.6 s per block. Nym takes about 50 s, then 15.7 s per
  block.

**Private lookup.** This is single-server PIR (Kushilevitz–Ostrovsky over Paillier, 1024-bit keys) on a √N grid of
about 1,000 active addresses.
- It takes 3–5 s through the mixnet. The server sees an epoch and about 32 ciphertexts, never the address.
- The answer starts as "Private, not yet proven". The phone then compares it with any verified block it has for
  that address and marks each asset that matches.

**Private history.** Each PIR record also lists the wallet's last 6 active blocks.
- The phone downloads those mixed in with up to 7 other wallets' blocks from the same reply, verifies them all, and
  checks the relay's index against them.
- That's 9–53 s and 1.4–11 MB. The relay learns "one of these 8 wallets", not which.

**Pending alerts.** A watched whale's swap showed up as "pending, unverified" about 6 s after it was sent, then turned
into the verified alert about 20 s later.

**Tested live on Sepolia.** A whale swapped, the alert came in, and a one-tap copy trade landed in a verified block.
The relay keeps its directory and history on disk (restart-tested). The Spy panel's demo lane only answers about two
allowlisted demo contracts. There are 110 tests, run against real Sepolia blocks.

**What it doesn't do (yet).**
- Trades are public once they land.
- On Sepolia, sends go through the public mempool, because Flashbots has no Sepolia endpoint.
- PIR covers about 1,000 addresses.
- History hides you among up to 8 wallets, not thousands.
- Blocks are trusted from our relay plus a second provider until we add a light client.
- One more thing we found: Anon-RPC's per-request isolation keys are ignored by the current Nox and Nym workers. We
  read their code to check, so we don't rely on them.

**Stack.** Bun, TypeScript, viem, React 19 and Vite (a PWA on GitHub Pages), Caddy and systemd. Built with help from
Claude Code.

## Links

- Live app: https://useblindspot.xyz/
- Source: https://github.com/skartik-sk/blindspot (private until submission)
- Demo video: VIDEO_LINK_HERE

## Pre-submission checklist

| Check | Status (Nov 7) |
| --- | --- |
| Live site works (all screens, desktop + phone, Nox live, 0 console errors) | done, verified after the last Pages deploy |
| Tests pass (`bun test`) | 110 pass, 0 fail |
| No secrets in git history (all 148 commits scanned: keys, tokens, `.env`, server access) | clean |
| README complete (claims checked against the live app) | done |
| Demo video recorded and link added above | waiting on you |
| Repo made public | waiting on your approval, right before submitting |
| Real-iPhone check of the Nox → Nym fallback | waiting on you (simulated on desktop: live on Nym in 41 s) |
