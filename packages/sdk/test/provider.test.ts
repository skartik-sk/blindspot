import { describe, expect, test } from "bun:test";
import { createProvider } from "../src/provider";

const { header } = await Bun.file(`${import.meta.dir}/fixtures/block.json`).json();
const full = await Bun.file(`${import.meta.dir}/fixtures/block-fulltx.json`).json();
const head = (await Bun.file(`${import.meta.dir}/fixtures/lc/exec-header.json`).json()).result;
const [parent, grandparent] = await Bun.file(`${import.meta.dir}/fixtures/lc/ancestors.json`).json();
const calls: string[] = [];
const fakeFetch = (answer: (method: string) => unknown) => (async (_url: string, init: RequestInit) => {
  const { method, id } = JSON.parse(String(init.body));
  calls.push(method);
  return new Response(JSON.stringify({ jsonrpc: "2.0", id, result: answer(method) }));
}) as any;

describe("EIP-1193 provider", () => {
  test("answers chain id locally and refuses anything that signs", async () => {
    const p = createProvider({ url: "https://rpc.example", fetch: fakeFetch(() => null), chainId: 11155111 });
    calls.length = 0;
    expect(await p.request({ method: "eth_chainId" })).toBe("0xaa36a7");
    expect(await p.request({ method: "eth_accounts" })).toEqual([]);
    for (const m of ["eth_sendTransaction", "personal_sign", "eth_signTypedData_v4", "eth_requestAccounts"])
      await expect(p.request({ method: m })).rejects.toMatchObject({ code: 4200 });
    expect(calls).toEqual([]); // nothing left the device
  });

  test("verifies block headers against their hash, and passes other reads through the anonymous fetch", async () => {
    const p = createProvider({ url: "https://rpc.example", fetch: fakeFetch((m) => (m === "eth_getBlockByNumber" ? header : "0x1")), chainId: 11155111 });
    expect((await p.request({ method: "eth_getBlockByNumber", params: [header.number, false] }) as any).hash).toBe(header.hash);
    expect(await p.request({ method: "eth_getBalance", params: ["0x0000000000000000000000000000000000000001", "latest"] })).toBe("0x1");
  });

  test("rejects a block whose fields were edited", async () => {
    const forged = { ...header, gasUsed: "0x1" };
    const p = createProvider({ url: "https://rpc.example", fetch: fakeFetch(() => forged), chainId: 11155111 });
    await expect(p.request({ method: "eth_getBlockByNumber", params: [header.number, false] })).rejects.toThrow();
  });
});

// A fake RPC that answers block reads from a set of real blocks (by number or hash).
const blockRpc = (blocks: any[], tamper: (b: any) => any = (b) => b) => (async (_url: string, init: RequestInit) => {
  const { method, params, id } = JSON.parse(String(init.body));
  const b = blocks.find((x) => (method === "eth_getBlockByHash" ? x.hash === params[0] : BigInt(x.number) === BigInt(params[0])));
  return new Response(JSON.stringify({ jsonrpc: "2.0", id, result: b ? tamper(b) : null }));
}) as any;

describe("provider: the block returned is the block asked for", () => {
  const other = { ...header };
  test("a valid block at a different number is rejected", async () => {
    const p = createProvider({ url: "https://rpc.example", fetch: fakeFetch(() => other), chainId: 11155111 });
    await expect(p.request({ method: "eth_getBlockByNumber", params: ["0x1", false] })).rejects.toThrow(/different block/);
    await expect(p.request({ method: "eth_getBlockByHash", params: ["0x" + "11".repeat(32), false] })).rejects.toThrow(/different block/);
  });
});

describe("provider: full-transaction blocks", () => {
  const block = full.result ?? full;
  test("a real block with 430 transactions matches its transactionsRoot", async () => {
    const p = createProvider({ url: "https://rpc.example", fetch: blockRpc([block]), chainId: 11155111 });
    expect(((await p.request({ method: "eth_getBlockByNumber", params: [block.number, true] })) as any).transactions.length).toBe(block.transactions.length);
  });
  test("a dropped or edited transaction is caught", async () => {
    const drop = createProvider({ url: "https://rpc.example", fetch: blockRpc([block], (b) => ({ ...b, transactions: b.transactions.slice(1) })), chainId: 11155111 });
    await expect(drop.request({ method: "eth_getBlockByNumber", params: [block.number, true] })).rejects.toThrow(/transactionsRoot/);
    const edit = createProvider({ url: "https://rpc.example", fetch: blockRpc([block], (b) => ({ ...b, transactions: [{ ...b.transactions[0], value: "0x1" }, ...b.transactions.slice(1)] })), chainId: 11155111 });
    await expect(edit.request({ method: "eth_getBlockByNumber", params: [block.number, true] })).rejects.toThrow(/transactionsRoot/);
  });
});

describe("provider: blocks proven by the light client", () => {
  const lightClient = { latest: async () => ({ hash: head.hash.toLowerCase(), number: BigInt(head.number) }) as any };
  const chain = [head, parent, grandparent];

  test("latest is the signed head; an ancestor is proven by walking parent hashes", async () => {
    const p = createProvider({ url: "https://rpc.example", fetch: blockRpc(chain), chainId: 11155111, lightClient });
    expect(((await p.request({ method: "eth_getBlockByNumber", params: ["latest", false] })) as any).hash).toBe(head.hash);
    expect(((await p.request({ method: "eth_getBlockByNumber", params: [grandparent.number, false] })) as any).hash).toBe(grandparent.hash);
  });

  test("a block above the signed head isn't proven yet", async () => {
    const p = createProvider({ url: "https://rpc.example", fetch: blockRpc([...chain, header]), chainId: 11155111, lightClient: { latest: async () => ({ hash: grandparent.hash, number: BigInt(grandparent.number) }) as any } });
    await expect(p.request({ method: "eth_getBlockByNumber", params: [parent.number, false] })).rejects.toThrow(/isn't proven yet/);
  });

  test("an old block can't be proven: rejected, not passed through", async () => {
    const p = createProvider({ url: "https://rpc.example", fetch: blockRpc([head, header]), chainId: 11155111, lightClient });
    await expect(p.request({ method: "eth_getBlockByHash", params: [header.hash, false] })).rejects.toThrow(/more than 64/);
  });

  test("a valid header that isn't the signed head's parent breaks the walk", async () => {
    // The RPC answers "block head-1" with an unrelated (self-consistent) block.
    const swap = (b: any) => (b === parent ? header : b);
    const p = createProvider({ url: "https://rpc.example", fetch: blockRpc(chain, swap), chainId: 11155111, lightClient });
    await expect(p.request({ method: "eth_getBlockByNumber", params: [grandparent.number, false] })).rejects.toThrow(/ancestor/);
  });
});
