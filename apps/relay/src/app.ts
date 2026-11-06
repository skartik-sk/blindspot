// HTTP surface of the relay.
//   POST /        JSON-RPC (address-free methods only), served from the verified cache.
//                 bina_getReceipts(n): the block's receipts minus blooms/hashes (clients check receiptsRoot)
//   GET  /stream  SSE: every new block, pushed identically to every client
//   POST /naive   "normal wallet" passthrough to upstream, read-only allowlist; logged for the Spy Panel
//   GET  /spy     SSE: spy log (what a provider sees from each lane)
//   GET  /pir     PIR table: public address directory + layout (no balances)
//   POST /pir     PIR query: encrypted selectors in, encrypted rows out; the index never leaves the client
import { RpcClient, toHex } from "@bina/sdk";
import type { PirStore } from "./pirstore";
import type { BlockCache, CachedBlock } from "./relay";
import type { SpyLog } from "./spy";

const BINA_METHODS = new Set(["eth_blockNumber", "eth_chainId", "eth_getBlockByNumber", "eth_getBlockAccessList", "bina_getReceipts"]);
const NAIVE_METHODS = new Set([
  "eth_blockNumber", "eth_chainId", "eth_getBalance", "eth_call", "eth_getTransactionCount", "eth_getLogs",
]);
export const MAX_BODY = 16 * 1024;
/** PIR queries carry one ciphertext per column (~17 KB at 1024-bit keys, ~33 KB at 2048). */
export const MAX_PIR_BODY = 64 * 1024;
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

async function readBody(req: Request, max = MAX_BODY): Promise<any> {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > max) throw new Error("body too large");
  const text = await req.text();
  if (text.length > max) throw new Error("body too large");
  return JSON.parse(text);
}

export interface AppOptions {
  cache: BlockCache;
  spy: SpyLog;
  upstream: RpcClient;
  chainId: string;
  /** Required to read /spy (?token=). If unset, /spy is disabled. */
  spyToken?: string;
  /** Serve the /naive demo lane. Off by default in production. */
  enableNaive?: boolean;
  /** Requests per IP per minute across both lanes. */
  rateLimit?: number;
  /** Trust x-forwarded-for (only behind a proxy you control). */
  trustProxy?: boolean;
  /** Serve PIR balance lookups. */
  pir?: PirStore;
}

// Rate-limit key: IPv4 as-is; IPv6 normalised to its /64, so one host can't rotate addresses to dodge the limit.
export function bucket(ip: string): string {
  ip = ip.split("%")[0].toLowerCase(); // drop zone id
  const v4 = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (v4) return v4[1];
  if (!ip.includes(":")) return ip;
  const [head, tail = ""] = ip.split("::");
  const h = head ? head.split(":") : [];
  const t = ip.includes("::") && tail ? tail.split(":") : [];
  if (!ip.includes("::") && h.length !== 8) return ip;
  const groups = [...h, ...Array(8 - h.length - t.length).fill("0"), ...t];
  return groups.slice(0, 4).map((g) => parseInt(g || "0", 16).toString(16)).join(":") + "::/64";
}

const MAX_TRACKED = 10_000;

export function createApp(opts: AppOptions) {
  const { cache, spy, upstream, chainId, spyToken, enableNaive = false, rateLimit = 600, trustProxy = false, pir } = opts;
  // PIR answers cost ~1-2 s of CPU each (synchronous, so they run one at a time): own, much lower limit.
  const pirHits = new Map<string, number[]>();
  const pirLimited = (key: string, perMin = 10) => {
    const now = Date.now();
    const recent = (pirHits.get(key) ?? []).filter((t) => now - t < 60_000);
    pirHits.delete(key);
    while (pirHits.size >= MAX_TRACKED) pirHits.delete(pirHits.keys().next().value!);
    pirHits.set(key, [...recent, now]);
    return recent.length >= perMin;
  };
  // Global budget too: mixnet users share exit IPs, and one client could rotate exits.
  let pirWindow = { start: 0, n: 0 };
  const PIR_GLOBAL_PER_MIN = 40;
  const pirOverBudget = () => {
    const now = Date.now();
    if (now - pirWindow.start > 60_000) pirWindow = { start: now, n: 0 };
    return ++pirWindow.n > PIR_GLOBAL_PER_MIN;
  };
  // Behind a trusted proxy, the right-most XFF entry is the one that proxy appended; the rest are client-controlled.
  const ipOf = (req: Request, server: any): string =>
    (trustProxy && req.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim()) ||
    server?.requestIP?.(req)?.address ||
    "?";

  // Raw IPs never enter the spy log: a salted short tag still shows "same client" vs "different client".
  const salt = crypto.getRandomValues(new Uint8Array(16)).join(",");
  const tag = (ip: string) =>
    new Bun.CryptoHasher("sha256").update(salt + ip).digest("hex").slice(0, 8);

  // Fixed-window per-client rate limit with a hard size cap. Map keeps insertion order, so the first key
  // is the oldest window: evicting it is O(1) and the map can never exceed MAX_TRACKED.
  const hits = new Map<string, { n: number; reset: number }>();
  const limited = (key: string) => {
    const now = Date.now();
    const h = hits.get(key);
    if (h && now <= h.reset) return ++h.n > rateLimit;
    hits.delete(key); // re-insert at the end so order tracks window start
    while (hits.size >= MAX_TRACKED) hits.delete(hits.keys().next().value!);
    hits.set(key, { n: 1, reset: now + 60_000 });
    return false;
  };

  const spyAllowed = (req: Request) => !!spyToken && new URL(req.url).searchParams.get("token") === spyToken;

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
    const result = !b ? null
      : method === "eth_getBlockAccessList" ? b.bal
      : method === "bina_getReceipts" ? b.receipts
      : b.header;
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
      // Tiny "new block" signal, identical for everyone; clients then fetch and verify the block itself.
      return sse((send) => cache.onBlock((b) => send({ number: b.number, hash: b.header.hash, txs: b.receipts.length })));
    if (url.pathname.startsWith("/spy")) {
      if (!spyAllowed(req)) return new Response("forbidden", { status: 403 });
      if (req.method === "GET" && url.pathname === "/spy") return sse((send) => spy.subscribe(send), spy.recent());
      if (req.method === "POST" && url.pathname === "/spy/clear") return spy.clear(), json({ ok: true });
    }

    if (url.pathname === "/pir" && pir) {
      if (req.method === "GET") {
        const t = pir.table();
        return t ? json(t) : json({ error: "table not ready" }, 503);
      }
      if (req.method === "POST") {
        if (pirLimited(bucket(ip))) return json({ error: "rate limited" }, 429);
        let q: any;
        try {
          q = await readBody(req, MAX_PIR_BODY);
        } catch (e) {
          return json({ error: (e as Error).message }, 400);
        }
        // Only well-formed queries for the live table spend the shared CPU budget.
        const live = pir.table();
        if (!live || !Array.isArray(q?.q) || q.q.length !== live.cols) return json({ error: "stale or malformed query" }, 400);
        if (pirOverBudget()) return json({ error: "busy, try again in a minute" }, 503);
        // What the operator sees: an epoch and a pile of ciphertexts. No address, no index.
        spy.add({ t: Date.now(), lane: "bina", client: tag(ip), method: "pir_query",
          params: [`epoch ${q?.epoch}`, `${Array.isArray(q?.q) ? q.q.length : 0} ciphertexts`] });
        try {
          return json({ answers: pir.answer(q) });
        } catch (e) {
          return json({ error: (e as Error).message }, 400);
        }
      }
    }

    if (req.method === "POST" && (url.pathname === "/" || url.pathname === "/naive")) {
      if (url.pathname === "/naive" && !enableNaive) return new Response("not found", { status: 404, headers: cors });
      if (limited(bucket(ip))) return rpcErr(null, -32005, "rate limited");
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
