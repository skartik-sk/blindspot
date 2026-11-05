import { RpcClient } from "@bina/sdk";
import { MAX_BODY, createApp } from "./app";
import { BlockCache } from "./relay";
import { SpyLog } from "./spy";

const UPSTREAM = process.env.UPSTREAM_RPC ?? "https://ethereum-sepolia-rpc.publicnode.com";
const PORT = Number(process.env.PORT ?? 8787);
const POLL_MS = Number(process.env.POLL_MS ?? 4000);

const upstream = new RpcClient(UPSTREAM);
const cache = new BlockCache(upstream);
const spy = new SpyLog();
const chainId = await upstream.call<string>("eth_chainId");

const app = createApp({
  cache, spy, upstream, chainId,
  spyToken: process.env.SPY_TOKEN || undefined,
  enableNaive: process.env.ENABLE_NAIVE === "1",
  rateLimit: Number(process.env.RATE_LIMIT ?? 600),
  trustProxy: process.env.TRUST_PROXY === "1",
});
// idleTimeout 0: keep SSE streams open. maxRequestBodySize: hard cap before the body is buffered.
const server = Bun.serve({
  port: PORT, idleTimeout: 0, maxRequestBodySize: MAX_BODY, fetch: (req, srv) => app(req, srv),
});

async function loop() {
  try {
    await cache.poll();
  } catch (e) {
    console.error("poll:", (e as Error).message);
  }
  setTimeout(loop, POLL_MS);
}
cache.onBlock((b) => console.log(`block ${b.number} verified, ${b.bal.length} accounts`));
loop();
console.log(`BAL relay on :${server.port}, chain ${chainId}, upstream ${new URL(UPSTREAM).host}`);
