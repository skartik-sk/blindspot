// One long-lived Anon-RPC worker for the whole app. Every network call in the app goes through `anonFetch`.
import { AnonRpcWorker } from "@anon-rpc/browser-harness";
import { RpcClient, type AnonFetch } from "@bina/sdk";
import { NETWORK_KEY, config, isLocal, type NetworkName } from "./config";
import { FALLBACK_TO, initialBoot, onFailure, onSuccess, type BootState } from "./fallback";
import { logRequest } from "./reqlog";

interface Network {
  label: string;
  /** Short name for tight spots. */
  short: string;
  /** Specifier contract address. */
  address: string;
  /** Chain the specifier contract lives on. */
  chain: "mainnet" | "sepolia";
  config?: unknown;
  anonymous: boolean;
  /** How long one request may take before we give up and retry (Nym reads take 10–35 s per EF). */
  timeoutMs: number;
}

// From https://ethereum.github.io/anon-rpc/wallets/ (Nov 2026).
export const NETWORKS: Record<NetworkName, Network> = {
  tor: {
    label: "Tor",
    short: "Tor",
    address: "0x700dA3193D35fA54Cd3fBf29B66f2a2A0385659e",
    chain: "mainnet",
    config: {
      gateways: (import.meta.env.VITE_TOR_GATEWAYS ?? "152.236.3.22:12298:uEiCH0VdbhryzJcMtCfB0vLA4sOvHdQ4hq5w7CopcwU59bQ").split(","),
      logLevel: import.meta.env.VITE_TOR_LOG ?? "info",
    },
    anonymous: true,
    timeoutMs: 60_000,
  },
  sphinx: {
    label: "Nox (Sphinx mixnet, Sepolia)",
    short: "Nox",
    address: "0x35133267A8F7EC35046a83DCA0f4Ca8A6e1b7A9A",
    chain: "sepolia",
    anonymous: true,
    timeoutMs: 25_000,
  },
  nym: {
    label: "Nym mixnet (Ethereum mainnet specifier)",
    short: "Nym",
    address: "0x3aCD9742C68F6d993066Ae25533e09b9e1f60eD0",
    chain: "mainnet",
    anonymous: true,
    timeoutMs: 60_000,
  },
  passthrough: {
    label: "Passthrough (NOT anonymous, dev only)",
    short: "Passthrough",
    address: "0x4fd77be300f31c5fe6ab266d35d27750a3478d27",
    chain: "mainnet",
    anonymous: false,
    timeoutMs: 25_000,
  },
};

let worker: AnonRpcWorker | undefined;

/**
 * The worker reads its specifier contract through this provider (directly; it's public chain data, the same for
 * every user). One public node rate-limiting us would take the whole privacy path down, so try several in turn.
 */
function bootstrapProvider(urls: string[]) {
  let start = 0;
  return {
    request: async ({ method, params }: { method: string; params?: unknown[] }) => {
      let last: unknown;
      for (let i = 0; i < urls.length; i++) {
        const url = urls[(start + i) % urls.length];
        logRequest(url, { method: "POST", body: JSON.stringify({ method, params }) }, "bootstrap");
        try {
          const r = await fetch(url, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: params ?? [] }),
            signal: AbortSignal.timeout(10_000),
          });
          const j = await r.json();
          if (j.error) throw new Error(typeof j.error === "string" ? j.error : j.error.message);
          start = (start + i) % urls.length; // stick with the one that worked
          return j.result;
        } catch (e) {
          last = e;
        }
      }
      throw last;
    },
  };
}

/**
 * Safety net for the traffic share: any request this page sends directly that wasn't logged above (the worker
 * downloading its network bundle, or anything unexpected) is counted as not-through-Anon-RPC. App assets from our
 * own origin, and hosts already logged (bootstrap providers, the relay's opt-in demo lane, localhost), are skipped.
 */
let watching = false;
function countUnloggedDirectRequests() {
  if (watching || typeof PerformanceObserver === "undefined") return;
  watching = true;
  const host = (u: string) => { try { return new URL(u).host; } catch { return ""; } };
  const logged = new Set([location.host, ...config.bootstrap.mainnet.map(host), ...config.bootstrap.sepolia.map(host),
    ...(config.relayUrl ? [host(config.relayUrl)] : [])]);
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      if (!/^https?:/.test(e.name) || logged.has(host(e.name)) || isLocal(e.name)) continue;
      logRequest(e.name, { method: "GET" }, "bootstrap");
    }
  }).observe({ type: "resource", buffered: true });
}

// Which network this tab is really using: the configured one, unless Nox couldn't boot here (see fallback.ts).
const FALLBACK_KEY = "bp.fallback";
const read = (store: () => Storage, k: string) => { try { return store().getItem(k); } catch { return null; } };
let boot: BootState = initialBoot(config.network, !!read(() => localStorage, NETWORK_KEY), read(() => sessionStorage, FALLBACK_KEY) === FALLBACK_TO);
const bootSubs = new Set<() => void>();
/** Observable boot state, for the "using Nym" banner. */
export const bootState = {
  get: () => boot,
  subscribe: (f: () => void) => (bootSubs.add(f), () => bootSubs.delete(f)),
};

export function getWorker(name: NetworkName = boot.network) {
  if (worker) return worker;
  countUnloggedDirectRequests();
  const n = NETWORKS[name];
  worker = new AnonRpcWorker({
    address: n.address,
    config: n.config as any,
    preExisting: { rpcProvider: bootstrapProvider(config.bootstrap[n.chain]) },
  });
  return worker;
}

export const network = () => NETWORKS[boot.network];

/** An RpcClient on the anonymous path whose time limit follows the network in use, even after a fallback switch. */
export function anonRpc(url: string, isolationKey: string): RpcClient {
  const c = new RpcClient(url, anonFetch, isolationKey);
  Object.defineProperty(c, "timeoutMs", { get: () => network().timeoutMs });
  return c;
}

/**
 * The app's only network path. Every request is recorded for the Spy Panel exactly as the server receives it.
 * A relay on localhost is the one disclosed exception: exits can't reach it, so it's fetched directly.
 */
export const anonFetch: AnonFetch = (url, init) => {
  const direct = isLocal(url);
  logRequest(url, init, direct ? "direct" : "mixnet");
  if (direct) {
    const { anonOptions: _, ...rest } = init;
    return fetch(url, rest);
  }
  const w = getWorker();
  // Dev-only: ?simulate-nox-fail reproduces the iPhone Safari boot error, to exercise the fallback on desktop.
  const simulated = import.meta.env.DEV && boot.network === "sphinx" && location.search.includes("simulate-nox-fail")
    ? Promise.reject(new Error("NoxWorkerError: kps.exchange.failed /topology: TOPOLOGY_FETCH_FAILED (simulated)")) : undefined;
  return (simulated ?? w.fetch(url, init)).then(
    (r) => {
      if (worker === w && boot.successes === 0) boot = onSuccess(boot);
      return r;
    },
    (e) => {
      if (worker !== w) throw e; // a request from a worker we already replaced
      const { state, switchTo } = onFailure(boot, String((e as Error)?.message ?? e), (n) => NETWORKS[n].anonymous);
      boot = state;
      if (!switchTo) throw e;
      // One Anon-RPC worker per page: remember the switch for this tab and restart cleanly on the fallback network.
      // After the reload this tab starts on Nym (fellBack), so it can't loop. Nothing is ever retried directly.
      try { sessionStorage.setItem(FALLBACK_KEY, switchTo); } catch {}
      bootSubs.forEach((f) => f());
      location.reload();
      throw e;
    },
  );
};

export function resetWorker() {
  worker?.close();
  worker = undefined;
}
