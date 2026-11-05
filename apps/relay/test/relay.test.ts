import { describe, expect, test } from "bun:test";
import { RpcClient } from "@bina/sdk";
import fx from "../../../packages/sdk/test/fixtures/block.json";
import { createApp, type AppOptions } from "../src/app";
import { BlockCache } from "../src/relay";
import { SpyLog } from "../src/spy";

const N = BigInt(fx.header.number);

function setup(over: Partial<AppOptions> = {}, tamper = false) {
  const upstreamCalls: string[] = [];
  const upstream = new RpcClient("http://up", async (_u, init) => {
    const { method, params } = JSON.parse(String(init.body));
    upstreamCalls.push(method);
    const result =
      method === "eth_blockNumber" ? fx.header.number
      : BigInt(params[0]) !== N ? null
      : method === "eth_getBlockByNumber" ? fx.header
      : method === "eth_getBlockAccessList" ? (tamper ? fx.bal.slice(1) : fx.bal)
      : "0x0";
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }));
  });
  const cache = new BlockCache(upstream);
  const spy = new SpyLog();
  const app = createApp({ cache, spy, upstream, chainId: "0xaa36a7", ...over });
  const local = { requestIP: () => ({ address: "127.0.0.1" }) };
  const remote = { requestIP: () => ({ address: "203.0.113.9" }) };
  const post = (path: string, body: unknown, srv = remote) =>
    app(new Request(`http://r${path}`, { method: "POST", body: JSON.stringify(body) }), srv).then((r) => r.json() as any);
  const rpc = (method: string, params: unknown[] = []) => post("/", { jsonrpc: "2.0", id: 1, method, params });
  return { app, cache, spy, post, rpc, local, remote, upstreamCalls };
}

describe("relay", () => {
  test("serves the verified list and header for a polled block", async () => {
    const { cache, rpc } = setup();
    await cache.poll();
    expect((await rpc("eth_getBlockAccessList", [fx.header.number])).result.length).toBe(fx.bal.length);
    expect((await rpc("eth_getBlockByNumber", ["latest", false])).result.hash).toBe(fx.header.hash);
  });

  test("fetches each block from upstream only once", async () => {
    const { cache, rpc, upstreamCalls } = setup();
    await cache.poll();
    for (let i = 0; i < 5; i++) await rpc("eth_getBlockAccessList", [fx.header.number]);
    expect(upstreamCalls.filter((m) => m === "eth_getBlockAccessList").length).toBe(1);
  });

  test("refuses to cache a list that fails the hash check", async () => {
    const { cache } = setup({}, true);
    await expect(cache.poll()).rejects.toThrow();
    expect(cache.get(N)).toBeUndefined();
  });

  test("refuses address-carrying methods on the private lane", async () => {
    const { rpc } = setup();
    const r = await rpc("eth_getBalance", ["0x000000000000000000000000000000000000dEaD", "latest"]);
    expect(r.error.code).toBe(-32601);
  });

  test("spy log stores a salted tag, never the raw IP", async () => {
    const { rpc, spy } = setup();
    await rpc("eth_blockNumber");
    const [e] = spy.recent();
    expect(e.client).toMatch(/^[0-9a-f]{8}$/);
    expect(JSON.stringify(e)).not.toContain("203.0.113.9");
  });

  test("/spy is forbidden to remote clients without a token", async () => {
    const { app, remote, local } = setup();
    expect((await app(new Request("http://r/spy"), remote)).status).toBe(403);
    expect((await app(new Request("http://r/spy"), local)).status).toBe(200);
  });

  test("/spy accepts the configured token", async () => {
    const { app, remote } = setup({ spyToken: "s3cret" });
    expect((await app(new Request("http://r/spy?token=nope"), remote)).status).toBe(403);
    expect((await app(new Request("http://r/spy?token=s3cret"), remote)).status).toBe(200);
  });

  test("/naive is off unless enabled, and caps eth_getLogs ranges", async () => {
    const off = setup();
    expect((await off.app(new Request("http://r/naive", { method: "POST", body: "{}" }), off.remote)).status).toBe(404);
    const on = setup({ enableNaive: true });
    const r = await on.post("/naive", { id: 1, method: "eth_getLogs", params: [{ fromBlock: "0x0", toBlock: "0xffff" }] });
    expect(r.error.code).toBe(-32602);
  });

  test("rate limits per client", async () => {
    const { rpc } = setup({ rateLimit: 3 });
    for (let i = 0; i < 3; i++) expect((await rpc("eth_blockNumber")).error).toBeUndefined();
    expect((await rpc("eth_blockNumber")).error.code).toBe(-32005);
  });
});
