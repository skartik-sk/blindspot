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
- a second operator (Tenderly) must confirm the same block hash.

To fake a block, our relay and Tenderly would both have to lie the same way. Two things are *not* proven: pending
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
- **Prove the value.** A dishonest server could return a wrong balance. The app labels it "Private, not yet proven",
  and the next verified block touching that address corrects it.
- **Cover every address.** The table holds about 1,000 recently active addresses. Anything else falls back to a
  one-off read on a fresh mixnet route: the node learns the address, but not who asked.

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

About 250–330 KB per block while the app is open, roughly 75–100 MB an hour on Sepolia. Nothing while it's hidden:
polling stops in the background (0 requests in 36 s, checked) and catches up at most 30 blocks when you come back.
The relay drops receipt blooms, which makes blocks about 3× smaller. The Network page shows the live average.

### 8. Why no push notifications?

A push server has to know whom to wake for what, and that is exactly the watchlist we refuse to hand over. Alerts
work while the app is open. The honest future version is a content-free "new block" push, identical for every
device, that wakes the app to fetch and filter locally.

### 9. Aren't copy trades public anyway?

Yes. Once a trade lands it's on-chain, and trading the same pair right after a whale can show that you follow it. The
copy screen says so and suggests a separate wallet. We hide reading and intent, not settled trades. On Sepolia sends
pass the public mempool: Flashbots has no Sepolia endpoint, and the builders publish no private one. On mainnet,
Flashbots Protect and MEV Blocker both accepted transactions through Anon-RPC in our test, but they aren't built in,
because the app is Sepolia-only.

### 10. So you trust the relay plus Tenderly. What's the plan to remove that?

A light client. We checked: Lodestar's Sepolia node serves light-client optimistic updates (478 of 512 sync-committee
signatures), and its header includes `execution_block_hash` with an 11-node branch. That is everything needed to
prove the execution block hash from the sync committee instead of asking a second provider. Its consensus reads would
also go through Anon-RPC. It's 4–8 hours of high-risk work, so it wasn't rushed in.

### 11. Why Sepolia? Does it work on mainnet?

Block access lists (EIP-7928) exist only on Sepolia today; they reach mainnet with Glamsterdam. Without them a phone
would have to fetch state per address, which is the leak we avoid. Mainnet mode comes after Glamsterdam, and the
mainnet private-send route is already tested.

### 12. Who sees my IP?

- **Mixnet entry node:** sees that you use the mixnet, not where your traffic goes or what it says.
- **GitHub Pages:** sees it when you load the site.
- **Anon-RPC's startup:** two reads of its public network contract and a code download. They carry no address and
  are counted against our traffic share, which starts around 91% and climbs to 96–99%.
- **The Spy panel's "Normal RPC" column:** sends directly, on purpose, and only about public demo contracts.

Everything else reaches servers from mixnet exits. Each kind of request gets its own isolation key, so an exit can't
link, for example, your lookups to your trades.
