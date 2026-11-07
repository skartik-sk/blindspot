// One long-lived Anon-RPC worker for the whole app. Every network call in the app goes through `anonFetch`.
import { AnonRpcWorker } from "@anon-rpc/browser-harness";
import { RpcClient, type AnonFetch } from "@blindspot/sdk";
import { NETWORK_KEY, config, isLocal, type NetworkName } from "./config";
import { FALLBACK_TO, initialBoot, onFailure, onSuccess, type BootState } from "./fallback";
import { decide, initialFailover, onProgress, type Failover } from "./failover";
import { logRequest } from "./reqlog";
import { SEL_RESOLVERS, withLocalBundle } from "./resolvers";

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
          // Our own hash-checked copy of the worker code goes first in the download list (see resolvers.ts).
          const call = (params?.[0] ?? {}) as { to?: string; data?: string };
          if (method === "eth_call" && call.to && call.data?.startsWith(SEL_RESOLVERS))
            return withLocalBundle(call.to, j.result, new URL(import.meta.env.BASE_URL, location.origin).toString());
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

// Mid-session failover (see failover.ts), remembered for this tab across the reload a switch needs.
const FAILOVER_KEY = "bp.failover";
const parseFo = (): Failover | undefined => { try { return JSON.parse(read(() => sessionStorage, FAILOVER_KEY) ?? "null") ?? undefined; } catch { return undefined; } };
let fo: Failover = (!boot.chosen && parseFo()) || initialFailover(boot.network);
if (!boot.chosen && fo.active !== boot.network) boot = { ...boot, network: fo.active, fellBack: boot.fellBack && fo.active === FALLBACK_TO };
/** A retry of the home network, or a stay away from it, is in progress: the startup fallback rule stands aside. */
const inEpisode = () => fo.active !== fo.home || fo.probeAt !== undefined;
const saveFo = () => { try { sessionStorage.setItem(FAILOVER_KEY, JSON.stringify(fo)); } catch {} };
export type FailoverNotice = { kind: "switched" | "suggest" | "stuck"; text: string; to?: NetworkName; retryAt?: number } | undefined;
let notice: FailoverNotice = fo.active !== fo.home && fo.reason ? { kind: "switched", text: fo.reason, retryAt: fo.probeAt } : undefined;
const setNotice = (n: FailoverNotice) => { notice = n; bootSubs.forEach((f) => f()); };
/** A failover switch is in progress: the new network hasn't delivered a verified block yet. */
export const isSwitching = () => !!fo.pending;
/** Observable failover notice, for the banner and the Network page. */
export const failoverState = {
  get: () => notice,
  subscribe: (f: () => void) => (bootSubs.add(f), () => bootSubs.delete(f)),
};

const started = Date.now();
let failedReads = 0;
let lastProgress = Date.now();
/** The block loop (re)started: measure from now. */
export function resetHealth() { failedReads = 0; lastProgress = Date.now(); }
/** A verified block arrived. */
export function noteProgress() {
  failedReads = 0;
  lastProgress = Date.now();
  const was = fo;
  fo = onProgress(fo);
  if (fo.pending) fo = { ...fo, pending: false };
  if (fo !== was) { saveFo(); if (fo.active === fo.home) setNotice(undefined); else bootSubs.forEach((f) => f()); }
  else if (notice?.kind === "stuck" || notice?.kind === "suggest") setNotice(fo.reason ? { kind: "switched", text: fo.reason, retryAt: fo.probeAt } : undefined);
}
/** Called every few seconds while the block loop runs. Switches only between anonymous networks, by reloading. */
export function checkFailover() {
  const d = decide(fo, { failedReads, sinceProgressMs: Date.now() - lastProgress }, boot.chosen, (n) => NETWORKS[n].anonymous, Date.now());
  if (d.kind === "none") return;
  if (d.kind === "suggest") { if (notice?.kind !== "suggest") setNotice({ kind: "suggest", text: d.reason, to: d.to }); return; }
  if (d.kind === "stuck") { if (notice?.kind !== "stuck") setNotice({ kind: "stuck", text: d.reason }); return; }
  fo = { ...d.next, pending: true };
  saveFo();
  try { sessionStorage.removeItem(FALLBACK_KEY); } catch {}
  setNotice({ kind: "switched", text: d.reason, retryAt: fo.probeAt });
  location.reload(); // one Anon-RPC worker per page: restart cleanly on the other network
}
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
    ? Promise.reject(new Error("NoxWorkerError: kps.exchange.failed /topology: TOPOLOGY_FETCH_FAILED (simulated)"))
    // Dev-only: ?simulate-nox-stall makes Nox stop answering after it has worked, to exercise the mid-session failover.
    : import.meta.env.DEV && boot.network === "sphinx" && boot.successes > 0 && Date.now() - started > 20_000 && location.search.includes("simulate-nox-stall")
      ? Promise.reject(new Error("NoxWorkerError: NoTunnelExitError: No exit offers TLS tunnels (simulated)")) : undefined;
  return (simulated ?? w.fetch(url, init)).then(
    (r) => {
      if (worker === w) { failedReads = 0; if (boot.successes === 0) boot = onSuccess(boot); }
      return r;
    },
    (e) => {
      if (worker !== w) throw e; // a request from a worker we already replaced
      failedReads++;
      if (inEpisode()) throw e; // mid-session failover is in charge (checkFailover)
      const { state, switchTo } = onFailure(boot, String((e as Error)?.message ?? e), (n) => NETWORKS[n].anonymous);
      boot = state;
      if (!switchTo) throw e;
      // One Anon-RPC worker per page: remember the switch for this tab and restart cleanly on the fallback network.
      // After the reload this tab starts on Nym (fellBack), so it can't loop. Nothing is ever retried directly.
      try { sessionStorage.setItem(FALLBACK_KEY, switchTo); } catch {}
      fo = initialFailover(switchTo); // Nox can't start here: Nym is this tab's home now, no retries of Nox
      saveFo();
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
