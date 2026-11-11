# Blindspot and the ETHGlobal Mumbai 2026 Anon-RPC winners

The Ethereum Foundation's "Best Use of Anon-RPC" prize went to Veil (1st), Atmos RPC (2nd) and Navik (3rd). We read
their code after the event (Nov 11) and took what was better. This page records what each one did, what we kept,
and where Blindspot now goes further. Their descriptions and repos are public on ethglobal.com/showcase.

| | Veil | Atmos RPC | Navik | Blindspot (Nov 11) |
| --- | --- | --- | --- | --- |
| What it is | Browser extension: every dapp's RPC reads over Tor | Faster, verified Anon-RPC client + SDK | Onchain websites with an Anon-RPC dashboard | Private read layer for trading: watch, copy, look up, trade |
| Hides who you are (IP) | Yes (Tor) | Yes (Nym) | Yes (Nym, Nox) | Yes (Nox and Nym side by side; Tor ready) |
| Hides what you ask (addresses) | No (their README: "needs PIR, on the roadmap") | No | No | **Yes**: block reads name no address, lookups use PIR |
| Verifies data | No | Light client + eth_getProof | No | Light client (sync committee) + header, access-list and receipts checks |
| Network outage handling | Reroute to Tor-friendly providers (mainnet only) | Warm standby route, failover on stall | Fails closed, manual reconnect | **Two networks at once**, warm standby, probe before trust, hedged address-free reads, never direct |
| Startup reads (direct) | 1 direct read | 0 (pinned) | 0 (pinned by hand) | 0 (pinned by script) |
| Stale pin | n/a | Logged only | Silent | Detected through the mixnet, needs two RPC operators to agree, then live read |
| Worker code download | CDN | CDN | CDN | **Own site**, hash-checked, CDN as fallback |
| Isolation keys | Real (Tor honours them) | n/a | Per-run | Sent everywhere; real on Tor; we checked Nox and Nym ignore them and say so |
| One-command run | No (needs a separately built gateway) | Partial | CLI | `bun run dev`, `docker compose up`, Pages workflow |

## What we took from each

- **Atmos:** probe a route before trusting it; keep a warm standby; the light-client design (sync-committee
  signatures, Merkle branch to the execution block hash, Gloas layout on Sepolia). Improvements: a checkpoint pinned
  and cross-checked by a script instead of trust on first use; several beacon endpoints instead of one; a stale pin
  acted on, not only logged.
- **Navik:** two Anon-RPC workers in one page; answering the specifier reads from pins. Improvement: pins generated
  and refreshed by `bun run pin`, and checked against the live contract at runtime.
- **Veil:** re-route rather than fail when a provider refuses an anonymity network; per-account isolation on Tor.
  We avoid two things its code does: a direct fetch on cold start (before the first state message), and a direct
  bootstrap read.

## Where we were already ahead

Private information retrieval for balances and history, and address-free block following with EIP-7928 access lists.
None of the three winners hides which addresses you care about; Veil names PIR as its next step.

## What cost us on demo day

The live demo depended on Nox, and Nox exits stopped offering TLS tunnels for ~35 minutes during judging. The app
fell back only by reloading, and the judges saw "Reconnecting". Two networks side by side, the light client and
pinned startup are the answer to that day.
