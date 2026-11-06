import { RpcClient, SEPOLIA_USDC, SEPOLIA_WETH, type Balances } from "@bina/sdk";
import { createPublicClient, erc20Abi, http, isAddress, type Address } from "viem";
import { sepolia } from "viem/chains";
import { MAX_PIR_BODY, createApp } from "./app";
import { homedir } from "node:os";
import { join } from "node:path";
import { PirStore, loadPirState, savePirState } from "./pirstore";
import { BlockCache } from "./relay";
import { SpyLog } from "./spy";

const UPSTREAM = process.env.UPSTREAM_RPC ?? "https://ethereum-sepolia-rpc.publicnode.com";
const PORT = Number(process.env.PORT ?? 8787);
const POLL_MS = Number(process.env.POLL_MS ?? 4000);

const upstream = new RpcClient(UPSTREAM);
const cache = new BlockCache(upstream);
const spy = new SpyLog();
const chainId = await upstream.call<string>("eth_chainId");

// PIR table: initial balances in one multicall per block, then kept current from verified BALs.
const client = createPublicClient({ chain: sepolia, transport: http(UPSTREAM) });
const multicall3Abi = [{ type: "function", name: "getEthBalance", stateMutability: "view",
  inputs: [{ name: "addr", type: "address" }], outputs: [{ name: "", type: "uint256" }] }] as const;
async function readBalances(addrs: Address[]) {
  const mc = sepolia.contracts.multicall3.address;
  const calls = addrs.flatMap((a) => [
    { address: mc, abi: multicall3Abi, functionName: "getEthBalance", args: [a] },
    { address: SEPOLIA_USDC.token, abi: erc20Abi, functionName: "balanceOf", args: [a] },
    { address: SEPOLIA_WETH.token, abi: erc20Abi, functionName: "balanceOf", args: [a] },
  ] as const);
  const res = await client.multicall({ contracts: calls, allowFailure: true });
  const out = new Map<Address, Balances>();
  addrs.forEach((a, i) => {
    const r = res.slice(i * 3, i * 3 + 3);
    // A failed read is not a zero balance: leave the account out (PirStore re-queues it).
    if (r.every((x) => x.status === "success")) out.set(a, { eth: r[0].result as bigint, usdc: r[1].result as bigint, weth: r[2].result as bigint });
  });
  return out;
}
const seeds = (process.env.PIR_SEED ?? "").split(",").map((s) => s.trim()).filter((s): s is Address => isAddress(s));
// Directory + history survive restarts: kept outside the code folder, which deploys replace wholesale.
const PIR_STATE = process.env.PIR_STATE ?? join(homedir(), ".bina-relay", "pir-state.json");
const pirOpts = { seeds, max: Number(process.env.PIR_MAX ?? 1024), newPerBlock: Number(process.env.PIR_NEW_PER_BLOCK ?? 8) };
const pir = PirStore.restore(readBalances, pirOpts, await loadPirState(PIR_STATE));
console.log(`pir: ${pir.table()?.addresses.length ?? 0} addresses restored from ${PIR_STATE}`);
let saving = false;

const app = createApp({
  cache, spy, upstream, chainId,
  // Mempool feed source; set to a different provider so pending polling can't rate-limit block fetches.
  pendingUpstream: process.env.PENDING_RPC ? new RpcClient(process.env.PENDING_RPC) : undefined,
  spyToken: process.env.SPY_TOKEN || undefined,
  enableNaive: process.env.ENABLE_NAIVE === "1",
  rateLimit: Number(process.env.RATE_LIMIT ?? 600),
  trustProxy: process.env.TRUST_PROXY === "1",
  pir,
});
// idleTimeout 0: keep SSE streams open. maxRequestBodySize: hard cap before the body is buffered.
const server = Bun.serve({
  port: PORT,
  // Behind a reverse proxy, bind to 127.0.0.1 (HOST) so the relay isn't reachable around the proxy.
  hostname: process.env.HOST ?? "0.0.0.0", idleTimeout: 0, maxRequestBodySize: MAX_PIR_BODY, fetch: (req, srv) => app(req, srv),
});

async function loop() {
  try {
    await cache.poll();
  } catch (e) {
    console.error("poll:", (e as Error).message);
  }
  setTimeout(loop, POLL_MS);
}
cache.onBlock((b) => {
  console.log(`block ${b.number} verified: ${b.bal.length} accounts, ${b.receipts.length} receipts`);
  pir.onBlock(b.number, b.bal)
    .then(async () => {
      if (saving) return; // one save at a time; the next block saves again
      saving = true;
      try { await savePirState(PIR_STATE, pir.dump()); } finally { saving = false; }
    })
    .catch((e) => console.error("pir:", (e as Error).message));
});
loop();
console.log(`relay on :${server.port}, chain ${chainId}, upstream ${new URL(UPSTREAM).host}`);
