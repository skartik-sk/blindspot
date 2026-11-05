// HTTP surface of the relay.
//   POST /        JSON-RPC (address-free methods only), served from the verified cache
//   GET  /stream  SSE: every new block, pushed identically to every client
//   POST /naive   "normal wallet" passthrough to upstream, read-only allowlist; logged for the Spy Panel
//   GET  /spy     SSE: spy log (what a provider sees from each lane)
import { RpcClient, toHex } from "@bina/sdk";
import type { BlockCache, CachedBlock } from "./relay";
import type { SpyLog } from "./spy";

const BINA_METHODS = new Set(["eth_blockNumber", "eth_chainId", "eth_getBlockByNumber", "eth_getBlockAccessList"]);
const NAIVE_METHODS = new Set([
  "eth_blockNumber", "eth_chainId", "eth_getBalance", "eth_call", "eth_getTransactionCount", "eth_getLogs",
]);
export const MAX_BODY = 16 * 1024;
const MAX_LOG_RANGE = 10n;
const BLOCK_RE = /^0x[0-9a-f]{1,16}$/i;

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...cors } });
const rpcErr = (id: unknown, code: number, message: string) => json({ jsonrpc: "2.0", id, error: { code, message } });

function sse(subscribe: (send: (data: unknown) => void) => () => void, initial: unknown[] = []) {
  let unsub = () => {};
  const stream = new ReadableStream({
    start(c) {
      const enc = new TextEncoder();
      const send = (d: unknown) => c.enqueue(enc.encode(`data: ${JSON.stringify(d, big)}\n\n`));
      initial.forEach(send);
      unsub = subscribe(send);
    },
    cancel: () => unsub(),
  });
  return new Response(stream, {
    headers: { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive", ...cors },
  });
}
const big = (_k: string, v: unknown) => (typeof v === "bigint" ? toHex(v) : v);

async function readBody(req: Request): Promise<any> {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_BODY) throw new Error("body too large");
  const text = await req.text();
  if (text.length > MAX_BODY) throw new Error("body too large");
  return JSON.parse(text);
}

export interface AppOptions {
  cache: BlockCache;
  spy: SpyLog;
  upstream: RpcClient;
  chainId: string;
  /** Required to read /spy. If unset, /spy is only served to localhost. */
  spyToken?: string;
  /** Serve the /naive demo lane. Off by default in production. */
  enableNaive?: boolean;
  /** Requests per IP per minute across both lanes. */
  rateLimit?: number;
  /** Trust x-forwarded-for (only behind a proxy you control). */
  trustProxy?: boolean;
}

const LOCAL = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

export function createApp(opts: AppOptions) {
  const { cache, spy, upstream, chainId, spyToken, enableNaive = false, rateLimit = 600, trustProxy = false } = opts;
  const ipOf = (req: Request, server: any): string =>
    (trustProxy && req.headers.get("x-forwarded-for")?.split(",")[0].trim()) ||
    server?.requestIP?.(req)?.address ||
    "?";

  // Raw IPs never enter the spy log: a salted short tag still shows "same client" vs "different client".
  const salt = crypto.getRandomValues(new Uint8Array(16)).join(",");
  const tag = (ip: string) =>
    new Bun.CryptoHasher("sha256").update(salt + ip).digest("hex").slice(0, 8);

  // Fixed-window per-IP rate limit.
  const hits = new Map<string, { n: number; reset: number }>();
  const limited = (ip: string) => {
    const now = Date.now();
    const h = hits.get(ip);
    if (!h || now > h.reset) {
      if (hits.size > 10_000) hits.clear();
      hits.set(ip, { n: 1, reset: now + 60_000 });
      return false;
    }
    return ++h.n > rateLimit;
  };

  const spyAllowed = (req: Request, ip: string) => {
    if (spyToken) return new URL(req.url).searchParams.get("token") === spyToken;
    return LOCAL.has(ip);
  };

  async function bina(body: any, client: string) {
    const { id, method, params = [] } = body ?? {};
    if (!BINA_METHODS.has(method)) return rpcErr(id, -32601, `method not served by relay: ${method}`);
    spy.add({ t: Date.now(), lane: "bina", client, method, params });
    if (method === "eth_chainId") return json({ jsonrpc: "2.0", id, result: chainId });
    if (method === "eth_blockNumber") return json({ jsonrpc: "2.0", id, result: toHex(cache.head) });
    const tag = params[0];
    if (typeof tag !== "string" || !(BLOCK_RE.test(tag) || tag === "latest"))
      return rpcErr(id, -32602, "block must be a hex number or 'latest'");
    const n = tag === "latest" ? cache.head : BigInt(tag);
    let b: CachedBlock | undefined;
    try {
      b = cache.get(n) ?? (n <= cache.head ? await cache.load(n) : undefined);
    } catch (e) {
      return rpcErr(id, -32000, `upstream: ${(e as Error).message}`);
    }
    const result = !b ? null : method === "eth_getBlockAccessList" ? b.bal : b.header;
    return json({ jsonrpc: "2.0", id, result });
  }

  async function naive(body: any, client: string) {
    const { id, method, params = [] } = body ?? {};
    if (!NAIVE_METHODS.has(method) || !Array.isArray(params)) return rpcErr(id, -32601, `not allowed: ${method}`);
    if (method === "eth_getLogs") {
      const f = params[0] ?? {};
      const ok = [f.fromBlock, f.toBlock].every((b) => typeof b === "string" && BLOCK_RE.test(b));
      if (!ok || BigInt(f.toBlock) - BigInt(f.fromBlock) > MAX_LOG_RANGE)
        return rpcErr(id, -32602, `eth_getLogs needs hex fromBlock/toBlock within ${MAX_LOG_RANGE} blocks`);
    }
    spy.add({ t: Date.now(), lane: "naive", client, method, params });
    try {
      return json({ jsonrpc: "2.0", id, result: await upstream.call(method, params) });
    } catch (e) {
      return rpcErr(id, -32000, (e as Error).message);
    }
  }

  return async function fetch(req: Request, server?: unknown): Promise<Response> {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null, { headers: cors });
    const ip = ipOf(req, server);

    if (req.method === "GET" && url.pathname === "/health") return json({ ok: true, head: toHex(cache.head) });
    if (req.method === "GET" && url.pathname === "/stream")
      return sse((send) => cache.onBlock((b) => send({ number: b.number, header: b.header, bal: b.bal })));
    if (url.pathname.startsWith("/spy")) {
      if (!spyAllowed(req, ip)) return new Response("forbidden", { status: 403 });
      if (req.method === "GET" && url.pathname === "/spy") return sse((send) => spy.subscribe(send), spy.recent());
      if (req.method === "POST" && url.pathname === "/spy/clear") return spy.clear(), json({ ok: true });
    }

    if (req.method === "POST" && (url.pathname === "/" || url.pathname === "/naive")) {
      if (url.pathname === "/naive" && !enableNaive) return new Response("not found", { status: 404, headers: cors });
      if (limited(ip)) return rpcErr(null, -32005, "rate limited");
      let body: any;
      try {
        body = await readBody(req);
      } catch (e) {
        return rpcErr(null, -32700, (e as Error).message);
      }
      if (Array.isArray(body)) return rpcErr(null, -32600, "batch requests not supported");
      return url.pathname === "/" ? bina(body, tag(ip)) : naive(body, tag(ip));
    }
    return new Response("not found", { status: 404, headers: cors });
  };
}
