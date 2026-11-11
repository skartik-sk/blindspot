import { describe, expect, test } from "bun:test";
import { createProvider } from "../src/provider";

const { header } = await Bun.file(`${import.meta.dir}/fixtures/block.json`).json();
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
