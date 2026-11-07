# Voiceover script (about 2:49, about 390 words)

Read it at a relaxed pace and pause for a second between blocks. The video is cut to fit your audio afterwards, so
exact timing doesn't matter. Times match `timeline.json`.

**0:00–0:08 · Title**
This is Blindspot: a private read layer for trading on Ethereum. Follow the whales, leave no trace.

**0:08–0:21 · Problem**
Every trading app tells its RPC provider which wallets are yours, which whales you follow, and what you're about to
trade. That data can be sold, leaked, or used to trade ahead of you.

**0:21–0:34 · The gap**
Anon-RPC hides who you are by routing requests through a mixnet. But the provider still reads every request: the
balance of this address, the logs of that one. Anonymous questions still reveal what you care about.

**0:34–0:49 · Solution**
Blindspot never asks about an address. Our relay fetches each block once, and every user downloads the exact same
copy through Anon-RPC. For lookups, we use private information retrieval: the server computes over every record and
can't tell which one you read.

**0:49–0:59 · How it works**
Your phone checks every block: the header hash, the access list, the receipts, and a second provider. Then it
filters locally for the wallets you care about.

**0:59–1:10 · One core**
This one core runs copy trading, wallet alerts, a private portfolio and private lookups, all live today. Trade
quotes hide your IP, but not yet the pair and size. And the same core is in the repo as an SDK.

**1:10–1:21 · Proof**
From real requests: a normal RPC learns two addresses and your IP. Anon-RPC alone still learns the addresses.
Blindspot: zero. 98.7 percent of requests go through Anon-RPC.

**1:21–2:22 · Demo**
Here's a concrete example. I follow a whale, 0xC2D7. It swaps, and within about six seconds I get a pending alert,
then a verified alert once the block lands. I copy the trade: it's prefilled from the verified swap and priced
through the mixnet, ready to sign on my phone. A private lookup of the same wallet takes a few seconds, and the
server never sees the address. And the Spy Panel: a normal RPC sees my IP and my addresses. Anon-RPC alone still
sees my addresses. Our relay sees block numbers. Nothing else.

**2:22–2:39 · Limits and next**
We're upfront about limits: Sepolia only, private lookup covers about a thousand addresses, alerts need the app
open, and copy trades are public once they land. Next: a light client, faster PIR, local quotes from verified pool
state, and a passkey wallet.

**2:39–2:49 · Close**
Anon-RPC hides who you are. Blindspot also hides what you watch. Built bina pooche: without asking. Thank you.

## What changed from your draft, and why

- **[TRAFFIC_SHARE] is 98.7%.** Measured on the live Network page: 230 of 233 requests, Nov 7.
- **Check (a), quotes.** Quotes are an `eth_call` to Uniswap's QuoterV2 sent through Anon-RPC. The node sees the pair
  and size, not who asked. So the "One core" line says so, and "local quotes from verified pool state" is listed
  under Next.
- **Check (b), the SDK.** The README's SDK example ran for real against Sepolia: it verified block 12080774 and the
  anchor agreed. So "in the repo as an SDK" is true. We don't claim any wallet uses it yet.
- **"Checks every block against its header hash, so the relay can't lie" became the four checks.** Faking a block
  would take our relay and Tenderly lying together, so "can't lie" overclaims.
- **"Signed on my phone and sent through the mixnet" became "ready to sign on my phone".** The device wallet on the
  new domain has no Sepolia funds, so the footage stops before sending. A real copy trade did land on Nov 6; it's in
  the README.
- **The isolation-key line is out of the voiceover,** because your draft dropped it. The finding is in the README and
  `docs/QA.md`.
- **"front-run you" became "trade ahead of you",** which is easier to say.
