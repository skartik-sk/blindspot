# Judge Q&A

The 12 hardest questions we expect, with short answers. Numbers were measured on Nov 6–7 against the live relay.

### 1. Anon-RPC already hides my IP. Why not just call `eth_getBalance(whale)` through it?

Because the question gives away the answer you care about. Each per-address read tells the node *which* wallets
matter. Repeat it every block and the node holds your watchlist, just without your name, and a watchlist is a
fingerprint in itself. Blindspot never asks about an address. Every phone asks for the same block by number, gets the
same bytes and filters them locally. The Spy panel shows this side by side from real requests: normal RPC (your IP and
the addresses), Anon-RPC alone (the addresses), Blindspot (block numbers only).

### 2. The relay is yours. Why can't it lie to me?

Every block is checked on the phone:
- `keccak(rlp(header))` must equal the block hash;
- `keccak(rlp(accessList))` must equal the header's `blockAccessListHash` (EIP-7928);
- the receipts trie is rebuilt and must match `receiptsRoot`;
- a beacon light client: the block must link by parent hash to an execution block hash the Ethereum sync committee
  (512 validators) signed, checked with their BLS signatures on the phone.

So the relay can't make up a block: it would need two thirds of the sync committee to sign it. (Since Nov 11; before
that a second operator, Tenderly, confirmed each hash, and that's still the fallback if the light client can't run.) Two things are *not* proven: pending
(mempool) alerts, which are labelled as such, and PIR answers (see 4).

### 3. What does the relay learn about me?

- Block numbers: the same ones everyone requests.
- That an app is polling the mempool snapshot, which has no parameters.
- For a lookup: an epoch, a one-time public key and ~32 ciphertexts.
- For history: a set of blocks that fits up to 8 wallets equally.

All of it arrives from mixnet exits, never your IP. In an IP check, the relay received 84 app requests, 0 of them
from our IP, spread over 3 exits. There's no access log (an error log can hold a mixnet exit's IP for a failed request), and the Spy log stores
salted hashes.

### 4. What does PIR protect, and what doesn't it?

It protects *which row* you read. Single-server Paillier PIR (Kushilevitz–Ostrovsky): the server computes over the
whole table and can't tell which row you asked for.

It does not:
- **Prove the value by itself.** A dishonest server could return a wrong balance, so the answer starts as "Private,
  not yet proven". The device then compares it with verified blocks it already has: the address's own recent blocks
  from the history download, the live feed, and the last 30 blocks in memory.
  - Match: "proven ✓" per asset, meaning it equals the verified balance at that block. That's not a proof that it's
    current: only a state proof can give that.
  - Different at or before the PIR snapshot: "Mismatch: the server may have lied", and the verified value is shown.
  - Different later: "Updated from verified block N".

  This adds no requests and doesn't change the protocol.
- **Cover every address.** The table holds about 1,000 recently active addresses. Anything else falls back to a
  one-off read through the mixnet: the node learns the address, but not who asked.

### 5. Why is history hidden among only 8 wallets?

Bandwidth and time. Each cover wallet adds up to 6 blocks of about 330 KB. With 8 wallets a lookup costs 9–37 s and
1.4–6 MB; 16 measured 28 s and 8 MB, and could reach about 32 MB in steady state. The relay also sees the downloads
arrive together. So it's k-anonymity (k ≤ 8), and we say so. Real coverage needs a hint-based PIR (SimplePIR/YPIR)
serving history rows directly.

### 6. How fast is it?

| Network | First verified block | Then, per block |
| --- | --- | --- |
| Nox (default) | 10 s | 2.6 s, so it keeps up with 12 s blocks |
| Nym | 50 s | 15.7 s, so alerts lag |

- Pending alert: about 6 s after the whale's transaction is sent.
- Verified alert: about 20 s.
- PIR balance: 3–5 s through the mixnet.
- History: 9–37 s.

### 7. How much data does it use?

About 250–330 KB per block while the app is open, roughly 75–100 MB an hour on Sepolia. Nothing while it's hidden (unless you turn on
background watching): polling stops in the background (0 requests in 36 s, checked) and catches up at most 30 blocks when you come back.
The relay drops receipt blooms, which makes blocks about 3× smaller. The Network page shows the live average.

### 8. Why no push notifications?

A push server has to know whom to wake for what, and that's exactly the watchlist we refuse to hand over.

Alerts work while the tab is open (including in the background on desktop) or with Watch mode on a phone. Fully closed-app push is future work: private bucketed push, where the server only learns a coarse address group shared by thousands of wallets.

Both background options are opt-in and send nothing new: the same block-number requests continue, and the
notification text comes from data already on the device.

### 9. Aren't copy trades public anyway?

Yes. Once a trade lands it's on-chain, and trading the same pair right after a whale can show that you follow it. The
copy screen says so and suggests a separate wallet. We hide reading and intent, not settled trades. On Sepolia sends
pass the public mempool: Flashbots has no Sepolia endpoint, and the builders publish no private one. On mainnet,
Flashbots Protect and MEV Blocker both accepted transactions through Anon-RPC in our test, but they aren't built in,
because the app is Sepolia-only.

### 10. Do you trust the relay?

Not for the blocks. Since Nov 11 the phone runs a light client: it starts from a finalized checkpoint (pinned, and
cross-checked with a second beacon API at build time), follows the sync committee period by period, and checks every
signed head (BLS aggregate signature from at least 2/3 of 512 validators, plus the Merkle branch to the execution
block hash). The beacon data comes through Anon-RPC. A block shows at once and gets its ✓ when a signed head links
back to it; copy trade waits for that ✓. The relay is still trusted to be available, and for the private lookup's
answer, which is labelled until a verified block shows it.

### 11. Why Sepolia? Does it work on mainnet?

Block access lists (EIP-7928) exist only on Sepolia today; they reach mainnet with Glamsterdam. Without them a phone
would have to fetch state per address, which is the leak we avoid. Mainnet mode comes after Glamsterdam, and the
mainnet private-send route is already tested.

### 12. Who sees my IP?

- **Mixnet entry node:** sees that you use the mixnet, not where your traffic goes or what it says.
- **GitHub Pages:** sees it when you load the site.
- **Anon-RPC's startup:** nothing, since Nov 11. The app answers the worker's two startup reads from pins and serves
  the worker code from its own site, so 100% of requests go through Anon-RPC from the first one.
- **The Spy panel's "Normal RPC" column:** sends directly, on purpose, and only about public demo contracts.

Everything else reaches servers from mixnet exits. Isolation keys: we checked the worker code Anon-RPC actually runs,
and the Nox and Nym workers ignore them, so we don't claim they separate requests there; Tor's worker does honour
them (different keys, different circuits). Blindspot doesn't depend on them, because block requests carry no address.