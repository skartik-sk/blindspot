# Bina Pooche — ETHGlobal Mumbai 2026 Project Brief

Nov 6, 2026 · @kartik

## The project in 30 seconds

**Bina Pooche** (बिना पूछे, "without asking") is a tap-to-pay app for merchants whose RPC provider never learns who the merchant is or what they earn. Track: **Ethereum Foundation, Best Use of Anon-RPC** (one track only).

**Pitch line:** "Every crypto payment app tells its RPC provider who the merchant is and how much they earn. Ours tells it nothing. Tap, pay, done."

**USP:** Anon-RPC hides *who* is asking. Bina Pooche hides *what* is asked. A hash check stops the server from lying. Together: complete read privacy.

**Easy analogy (railway station):** a normal wallet asks the enquiry counter "has train 12345 arrived?", so the counter learns which train you care about. Bina Pooche just listens to the station announcements that everyone hears, and picks out its own train.

## The problem

Every balance check leaks: the RPC provider sees which addresses you look up, how often, and from which IP. This happens before any transaction is sent, all day, every time an app opens. EF's own privacy research calls this "the hidden leak".

- **Money privacy is already built:** Railgun, Privacy Pools, Aztec, stealth addresses.
- **Read privacy is the gap:** Anon-RPC hides only the IP, not which address is asked about. EF's answer (PIR) is still research.
- **Stealth addresses are quietly broken:** they give a merchant a fresh address per payment, but the merchant's wallet then asks the RPC provider about all of them from one session, and the provider links them back together. The merchant's full daily income is exposed.

**Who it hurts:** merchants (income and customer flow), and anyone with more than one wallet.

**What we hide vs. what stays public:** sending is public on-chain by design (sender, receiver, amount). We protect the reading side only. Fetching data needs no account, signature or gas.

## Our solution: the "Watch, Don't Ask" protocol

The app never asks about an address. It watches public block data that everyone receives identically and finds its own payments locally. Four rules make this private, cheap and verifiable.

| # | Rule | What it does | What it solves |
| --- | --- | --- | --- |
| 1 | Born-private addresses | A brand-new one-time address is created at each tap | No first-lookup leak: a new address has no history to look up |
| 2 | Tap-triggered watching | After a tap, watch only the next \~10 blocks; sleep otherwise | Bandwidth: about 1 MB per sale instead of \~500–650 MB/day |
| 3 | Address-free, verified reads | Download each block's access list, check `keccak(list) == header.blockAccessListHash`, find the address locally | Server never learns the address and cannot lie |
| 4 | Self-paying exit | Gas for spending is paid from the received USDC via an ERC-20 paymaster | No outside wallet ever funds the address, so no gas-funding link |

All traffic goes through Anon-RPC, with a separate `isolationKey` per sale so two sales cannot be linked.

**The data source:** Glamsterdam's Block-Level Access Lists (EIP-7928). Every block lists every account and storage slot it changed, with the new balance, nonce and storage values, and the block header commits to the list's hash.

**Long-term position:** PIR handles arbitrary lookups of any data; Watch, Don't Ask handles "did my own payment arrive?" with zero server compute. They complement each other: when PIR is ready it plugs in as another module.

## Architecture

Every request leaves the phones through Anon-RPC, and the merchant reads only block lists that everyone receives, so no server learns the merchant's address.

&#91;embedded content: architecture · tap-to-pay flow\]

1. **Tap:** the merchant phone creates a fresh one-time address and hands it to the customer by NFC (QR fallback).
2. **Pay:** the customer sends USDC to it; the transaction goes out through Anon-RPC.
3. **Detect:** the merchant phone gets the next \~10 blocks' lists from the relay through Anon-RPC, checks each hash against the block header, and finds its address locally.
4. **Show:** "₹20 received ✅", proven, not trusted. Data stays on the phone.
5. **Spend later:** the paymaster takes gas from the USDC itself; the transaction goes out through Anon-RPC.

**Pluggable read-privacy layer:** app layer (tap-to-pay now; Private Watchlist later) → read layer (BAL Watch now; PIR and a light client plug in later) → transport (Anon-RPC). When PIR is ready, it slots in; nothing is thrown away.

## What we use vs. what we build

We build a new protocol, relay and SDK on top of Anon-RPC; the apps are the front end, not the whole project.

**We use (existing):**

- Anon-RPC browser harness with the **Tor worker** (not the passthrough demo worker, which is not anonymous)
- `eth_getBlockAccessList` / `debug_getRawBlockAccessList` RPC methods (live on Sepolia since Glamsterdam)
- USDC on Sepolia, an ERC-20 paymaster
- Web NFC (Chrome on Android), QR as fallback

**We build (ours):**

1. **BAL Relay:** fetches each block's access list once and serves the identical stream to every client, so the relay cannot tell which blocks anyone cares about. Untrusted: clients verify every list against the header hash.
2. **Verifier SDK:** raw list → keccak check against the header → extracts ETH and USDC balances for watched addresses (USDC via its storage slot for the address).
3. **Watch engine:** one-time address per sale (HD-derived), opens the block window after a tap, separate `isolationKey` per sale, random cover downloads.
4. **Two web apps (PWA):** merchant and customer, NFC tap with QR fallback. Data stays on the phone (IndexedDB); no server database.
5. **Spy Panel:** a logging proxy that shows, side by side, what the provider sees from a normal wallet vs. from Bina Pooche.

**Not a full node:** nothing heavy runs on the phone; it is a web app.

## Track fit: EF Best Use of Anon-RPC

The plan matches every judging point, provided every network call goes through Anon-RPC. Prize: $2,500 / $1,500 / $1,000. Only one EF prize per project; EF judges may place us in CROPS instead.

| EF judging point (paraphrased) | How we meet it |
| --- | --- |
| Works end to end in the demo | Tap → pay → "received ✅" live on two phones |
| Quality of user experience | One tap, no crypto steps for the merchant |
| Share of the app's traffic through Anon-RPC | 100%: relay, block headers, sending, paymaster. Any exclusion stated in the README |
| Could ship for real after the hackathon | SDK + relay are reusable; mainnet-ready once Glamsterdam ships |
| Technical depth | New protocol, hash verification, relay, isolation per sale |
| Matches their idea list | "Combine Anon-RPC with a light client or proof verification" |
| Qualification: reads go through Anon-RPC by default | Yes, by default and only path |

**Bonus pitch line:** Anon-RPC's adopters page lists no shipping app yet. We can be the first.

## Landscape: who else is near this, and how we differ

No identical project found on the web or among public ETHGlobal Mumbai repos (last checked Nov 5–6). The goal (private reads) is shared with EF research, but nobody has shipped a working product.

| Project | What it is | Leaks your addresses? | Difference from us |
| --- | --- | --- | --- |
| [skim](https://github.com/leekt/skim) (Taek Lee, ZeroDev CTO) | Rust state client that follows block access lists over P2P, for speed | Yes: first lookups ask peers about your address | Goal is speed, not privacy; a node, not a browser app; no Anon-RPC |
| [Kohaku](https://github.com/ethereum/kohaku) (EF) | Wallet privacy SDK: Railgun, Privacy Pools, Helios light client | Yes: its light client still asks the provider about your address | A toolkit for money privacy; not address-free reads |
| EF Private Reads / PIR | Research to hide what is queried, using encrypted lookups | No (design goal) | Research and specs, not a product; heavy server compute. We plug PIR in later |
| [Porch](https://github.com/andyguzmaneth/porch) (Andy Guzman) | Reads from home nodes; privacy planned via PIR | Planned fix | Design / RFC only, not built |
| How Doxxed Am I? (Taipei 2025 finalist) | Shows what your past on-chain activity reveals | n/a | Diagnoses past exposure; does not fix live reads |
| Mumbai repos (38+ at last check) | Closest: kusari (Anon-RPC for AI-agent swap limits) | n/a | Different problem; no private-reads project |

**Avoided on purpose:** post-quantum wallets (winterlock-wallet at Mumbai, plus JARDIN and pq-dksap already public).

## Honest risks and mitigations

The biggest risk is infrastructure: a free Sepolia endpoint that serves block access lists and accepts Tor traffic. Test it in the first hour.

| Risk | Mitigation | Status |
| --- | --- | --- |
| No free endpoint for `eth_getBlockAccessList` over Tor (Nodit offers it only on paid plans; some providers block Tor) | Try several providers; else run our own Sepolia node behind the relay | Test first |
| Bandwidth: \~70–90 KB per block on mainnet | Tap-triggered windows (\~1 MB per sale); full stream only on Wi-Fi | Solved by design |
| Timing: server sees an anonymous client fetching a block range | Relay pushes the identical stream to everyone; random cover downloads | Solved by design |
| App offline for a long time | Download missed blocks from the relay; for long gaps, one isolated lookup of a single one-time address (reveals only that one sale) | Acceptable, state in README |
| Old, arbitrary wallet balances | Out of scope; PIR's job, plugged in later | State in README |
| Merging sale addresses links them on-chain | Rule: don't merge. Stretch: auto-shield each sale into Railgun via Kohaku (check Sepolia support first) | Stretch goal |
| Customer's own reads leak if they use another wallet | Customers using our app are protected too | State clearly |
| Testnet only until Glamsterdam reaches mainnet | Pitch as "mainnet-ready" | Unavoidable |
| iPhone has no Web NFC | QR fallback | Solved |
| Live demo failure (two phones, NFC, Tor, Wi-Fi) | Rehearse; record a backup video; mobile hotspot | Prepare |
| Misuse concern | We don't hide money; amounts stay public. Only reading is private, like HTTPS. Auto-shield via Privacy Pools if added | Answer ready |

Never claim "100% private": EF judges reward honest trade-offs.

## Build plan (\~24 hours)

The first hour decides everything: if block lists can't be fetched over Tor, we fall back to our own Sepolia node before writing app code.

&#91;embedded content: build plan · 6 phases, 2 gates\]

Run the competitor-monitoring script every 3–4 hours throughout.

## Demo script (4 minutes)

Lead with the shock, not the tech: judges decide in the first 30 seconds.

1. **0:00 – The pain.** "Stealth addresses promised merchants privacy. RPC reads quietly broke that promise."
2. **0:30 – The shock (Spy Panel, left side).** A chai stall using stealth addresses with a normal RPC. The provider's log shows all its payment addresses linked: the stall's whole day of income, exposed.
3. **1:15 – The tap.** Customer phone taps the stall phone (NFC). Customer pays ₹20 in USDC.
4. **1:45 – Received.** Stall phone shows "₹20 received ✅ (verified)".
5. **2:15 – The proof (Spy Panel, right side).** Our provider log: only "block 501, block 502", no address, no IP.
6. **2:45 – Why it can't lie.** Show the hash check against the block header.
7. **3:15 – The bigger picture.** "Bitcoin wallets stopped asking about addresses years ago. Ethereum never did. Now it can, and any wallet can use our SDK."

**Backup:** a recorded video of the full flow, plus a mobile hotspot in case venue Wi-Fi fails.

## Judge Q&A cheat sheet

Short, direct answers for when the judges grill you.

| Question | Answer |
| --- | --- |
| Why not PIR? | PIR handles arbitrary lookups. We handle your own live payments with zero server compute, verifiable. A wallet should use both; PIR plugs into our architecture. |
| Isn't this just Anon-RPC + skim + a UI? | No. Anon-RPC hides who asks; skim is for speed and still leaks. We built a protocol, relay and SDK that hide what is asked. |
| Bandwidth? | About 1 MB per sale: we only watch the \~10 blocks after a tap. |
| Can the server lie? | No. The list must match the hash committed in the block header. |
| First-lookup leak? | Doesn't exist: every address is born after we start watching. |
| What if the app was offline for a week? | Missed blocks come from the relay; for long gaps, one isolated lookup of a single one-time address, which reveals only that one sale. |
| Gas funding link? | Gas is paid from the received USDC through a paymaster. No outside funding. |
| Timing leak? | The relay pushes the same stream to everyone, plus random cover downloads. |
| Why Anon-RPC? | It hides the IP, and a separate isolationKey per sale keeps sales unlinkable. |
| Can sending be hidden? | The transaction is public by design. We make it unlinkable (fresh address, paymaster gas, hidden IP). Hiding amounts needs a shielded pool: our next step. |
| Could criminals misuse it? | We don't hide money; amounts stay public. We stop surveillance of reads, like HTTPS does for the web. |
| Mainnet? | Glamsterdam is on testnets; we're mainnet-ready the day it ships. |

## Competitor monitoring rule

Run this every 3–4 hours and once more before submitting. If anything close appears, add our own extra factor, even at the last minute. Private repos won't show up.

```bash
# watch.sh — run: GH_TOKEN=xxx bash watch.sh   (token optional, avoids rate limit)
for k in "ethglobal+mumbai+privacy" "ethglobal+mumbai+stealth" "ethglobal+mumbai+payment" \
         "block+access+list" "anon-rpc" "private+reads" "stealth+address+nfc"; do
  echo "== $k"
  curl -s ${GH_TOKEN:+-H "Authorization: Bearer $GH_TOKEN"} \
   "https://api.github.com/search/repositories?q=$k+created:>2026-11-03&sort=updated&per_page=10" |
  python3 -c "import sys,json;[print(' ',r['created_at'][:16],r['html_url'],'|',(r['description'] or '')[:90]) for r in json.load(sys.stdin).get('items',[])]"
  sleep 7
done
```

## Submission checklist

Deadline: Sat Nov 7, 9:00 AM IST.

- [ ] Public repo under an open-source license (MIT or Apache-2.0), steady commit history
- [ ] README: setup, architecture, honest trade-offs, what traffic (if any) skips Anon-RPC and why
- [ ] README section titled **CROPS** (one line each for C, O, P, S), in case EF places us in CROPS
- [ ] No third-party trackers or analytics in the client; keys stay on the device
- [ ] Demo video, 3 minutes max, showing "the moment it matters" (the Spy Panel)
- [ ] Live demo link; both apps work on a phone browser
- [ ] AI usage disclosed, as ETHGlobal rules require
- [ ] Team of 3–5 listed (finalist reward is 1,000 USDC + 500 USDC travel per person)
- [ ] Final run of the monitoring script before submitting

## Key facts and sources

- **Prize text and rules:** [ETHGlobal Mumbai prizes](https://ethglobal.com/events/mumbai/prizes) (EF section)
- **Anon-RPC:** [spec and code](https://github.com/ethereum/anon-rpc), [integration guide](https://ethereum.github.io/anon-rpc/wallets/), [adopters](https://ethereum.github.io/anon-rpc/adopters/). Browser-only today; hash-pinned worker in a null-origin iframe; `isolationKey` keeps calls unlinkable.
- **Block access lists:** [EIP-7928](https://eips.ethereum.org/EIPS/eip-7928); RPC method in the [execution-apis spec](https://github.com/ethereum/execution-apis/pull/726); live on Sepolia per [Nodit's Nov 3 notice](https://developer.nodit.io/notice/2026-11-03-service/) (paid plan)
- **Sizes:** [EF size analysis](https://eips.ethereum.org/assets/eip-7928/bal_size_analysis_60m): \~72 KiB compressed per block at 60M gas; \~92 KiB in the Oct 2026 run
- **EF private-reads research:** [reads.ethereum.foundation](https://reads.ethereum.foundation/roadmap)
- **Related projects:** [skim](https://github.com/leekt/skim), [Kohaku](https://github.com/ethereum/kohaku), [Porch](https://github.com/andyguzmaneth/porch)
