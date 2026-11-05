// One long-lived Anon-RPC worker for the whole app. Every network call in the app goes through `anonFetch`.
import { AnonRpcWorker } from "@anon-rpc/browser-harness";
import type { AnonFetch } from "@bina/sdk";
import { config, type NetworkName } from "./config";

interface Network {
  label: string;
  /** Specifier contract address. */
  address: string;
  /** Chain the specifier contract lives on. */
  chain: "mainnet" | "sepolia";
  config?: unknown;
  anonymous: boolean;
}

// From https://ethereum.github.io/anon-rpc/wallets/ (Nov 2026).
export const NETWORKS: Record<NetworkName, Network> = {
  tor: {
    label: "Tor",
    address: "0x700dA3193D35fA54Cd3fBf29B66f2a2A0385659e",
    chain: "mainnet",
    config: { gateways: ["152.236.3.22:12298:uEiCH0VdbhryzJcMtCfB0vLA4sOvHdQ4hq5w7CopcwU59bQ"] },
    anonymous: true,
  },
  sphinx: {
    label: "Sphinx mixnet (Sepolia)",
    address: "0x35133267A8F7EC35046a83DCA0f4Ca8A6e1b7A9A",
    chain: "sepolia",
    anonymous: true,
  },
  passthrough: {
    label: "Passthrough (NOT anonymous, dev only)",
    address: "0x4fd77be300f31c5fe6ab266d35d27750a3478d27",
    chain: "mainnet",
    anonymous: false,
  },
};

let worker: AnonRpcWorker | undefined;

function bootstrapProvider(url: string) {
  return {
    request: async ({ method, params }: { method: string; params?: unknown[] }) => {
      const r = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: params ?? [] }),
      });
      const j = await r.json();
      if (j.error) throw new Error(j.error.message);
      return j.result;
    },
  };
}

export function getWorker(name: NetworkName = config.network) {
  if (worker) return worker;
  const n = NETWORKS[name];
  worker = new AnonRpcWorker({
    address: n.address,
    config: n.config as any,
    preExisting: { rpcProvider: bootstrapProvider(config.bootstrap[n.chain]) },
  });
  return worker;
}

export const network = () => NETWORKS[config.network];

/** The app's only network path. */
export const anonFetch: AnonFetch = (url, init) => getWorker().fetch(url, init);

export function resetWorker() {
  worker?.close();
  worker = undefined;
}
