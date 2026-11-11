// Refresh the pinned Anon-RPC specifiers: `bun run pin` (in apps/web).
// For each network it reads workerHash() and workerResolvers() from the specifier contract, downloads the worker
// bundle, checks keccak256(bytes) == workerHash, saves it to public/w/<hash>.js (served first, from our own site),
// and writes src/lib/pins.json. At runtime the app answers the harness's two specifier reads from these pins, so it
// makes no direct (non-anonymous) request at startup. The app still re-checks the live specifier later, through the
// mixnet, and boots with a live read if a pin goes stale.
import { createPublicClient, http, keccak256, parseAbi, type Address, type Hex } from "viem";
import { mainnet, sepolia } from "viem/chains";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const abi = parseAbi(["function workerHash() view returns (bytes32)", "function workerResolvers() view returns (string[])"]);
const NETS: { id: string; address: Address; chain: typeof mainnet | typeof sepolia; rpc: string }[] = [
  { id: "sphinx", address: "0x35133267A8F7EC35046a83DCA0f4Ca8A6e1b7A9A", chain: sepolia, rpc: "https://ethereum-sepolia-rpc.publicnode.com" },
  { id: "nym", address: "0x3aCD9742C68F6d993066Ae25533e09b9e1f60eD0", chain: mainnet, rpc: "https://ethereum-rpc.publicnode.com" },
  { id: "tor", address: "0x700dA3193D35fA54Cd3fBf29B66f2a2A0385659e", chain: mainnet, rpc: "https://ethereum-rpc.publicnode.com" },
];

const pins: Record<string, { address: Address; workerHash: Hex; resolvers: string[]; checkedAt: string; selfHosted: boolean }> = {};
mkdirSync(join(ROOT, "public/w"), { recursive: true });
for (const n of NETS) {
  const c = createPublicClient({ chain: n.chain, transport: http(n.rpc) });
  const workerHash = (await c.readContract({ address: n.address, abi, functionName: "workerHash" })) as Hex;
  const resolvers = [...((await c.readContract({ address: n.address, abi, functionName: "workerResolvers" })) as string[])];
  const file = join(ROOT, "public/w", `${workerHash.slice(2)}.js`);
  let selfHosted = existsSync(file) && keccak256(readFileSync(file)) === workerHash;
  // Tor's bundle is only fetched on demand (Tor isn't offered by default), so it's pinned but not copied.
  if (!selfHosted && n.id !== "tor") {
    for (const url of resolvers) {
      try {
        const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
        if (keccak256(bytes) !== workerHash) { console.warn(`${n.id}: ${url} hash mismatch, skipped`); continue; }
        writeFileSync(file, bytes);
        selfHosted = true;
        break;
      } catch (e) {
        console.warn(`${n.id}: ${url} failed: ${(e as Error).message}`);
      }
    }
  }
  pins[n.id] = { address: n.address, workerHash, resolvers, checkedAt: new Date().toISOString().slice(0, 10), selfHosted };
  console.log(`${n.id}: ${workerHash} · ${resolvers.length} resolvers · self-hosted ${selfHosted}`);
}
// The light client starts from a recent finalized beacon block root: the trust root for every block the app shows.
// Checked here three ways before it's pinned (and the app checks the bootstrap again at startup):
// 1. the bootstrap header the light-client API serves hashes to that root, 2. its sync committee is proven by a
// Merkle branch into that header's state root, 3. an independent beacon API (another operator) agrees on the root.
const BEACON = process.env.VITE_BEACON_URLS?.split(",")[0] ?? "https://lodestar-sepolia.chainsafe.io";
const CROSS = process.env.BEACON_CROSSCHECK ?? "https://ethereum-sepolia-beacon-api.publicnode.com";
const fin = (await (await fetch(`${BEACON}/eth/v1/beacon/headers/finalized`)).json()).data;
const boot = (await (await fetch(`${BEACON}/eth/v1/beacon/light_client/bootstrap/${fin.root}`)).json())?.data;
const { beaconRoot, checkBootstrap } = await import("@blindspot/sdk");
if (!boot?.header?.beacon) throw new Error("beacon API didn't serve a bootstrap for the finalized root");
const root = "0x" + Buffer.from(beaconRoot(boot.header.beacon)).toString("hex");
if (root !== fin.root.toLowerCase()) throw new Error(`bootstrap header hashes to ${root}, not the finalized root ${fin.root}`);
if (!checkBootstrap(boot)) throw new Error("bootstrap sync committee branch doesn't verify");
const other = (await (await fetch(`${CROSS}/eth/v1/beacon/headers/${fin.header.message.slot}`)).json())?.data;
if (other?.root?.toLowerCase() !== fin.root.toLowerCase()) throw new Error(`${CROSS} disagrees on the block root at slot ${fin.header.message.slot}: ${other?.root}`);
const beacon = { checkpoint: fin.root as Hex, slot: Number(fin.header.message.slot), checkedAt: new Date().toISOString().slice(0, 10), crossCheckedWith: new URL(CROSS).host };
console.log(`beacon checkpoint: ${beacon.checkpoint} (slot ${beacon.slot}), cross-checked with ${beacon.crossCheckedWith}`);
// Beacon APIs stop serving a bootstrap within hours, so the verified bootstrap ships with the app.
writeFileSync(join(ROOT, "src/lib/lc-bootstrap.json"), JSON.stringify(boot) + "\n");
writeFileSync(join(ROOT, "src/lib/pins.json"), JSON.stringify({ ...pins, beacon }, null, 2) + "\n");
console.log("wrote src/lib/pins.json");
