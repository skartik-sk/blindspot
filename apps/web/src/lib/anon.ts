// Every network call in the app goes through `anonFetch`, over one of two anonymous networks ("lanes", see lanes.ts):
// the preferred one (Nox by default) and a standby (Nym) that starts as soon as the preferred one struggles. Both
// can run at once in one page, so switching is instant: no reload, no lost state. Nothing is ever sent directly.
import { AnonRpcWorker } from "@anon-rpc/browser-harness";
import { RpcClient, type AnonFetch } from "@blindspot/sdk";
import { NETWORK_KEY, config, isLocal, type NetworkName } from "./config";
import { activeLane, hedgeAfter, keepWarmDue, newLane, onResult, order, probeDue, started, wantStandby, type Lane } from "./lanes";
import { logRequest } from "./reqlog";
import { forgetPin, hasPin, pinnedProvider, refreshPin } from "./specifier";

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
  /** How long one request may take on this network before it counts as failed (Nym reads take 10–35 s per EF). */
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

/** The standby for each network: the other mixnet. Tor and passthrough have none. */
const STANDBY: Partial<Record<NetworkName, NetworkName>> = { sphinx: "nym", nym: "sphinx" };

const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const siteBase = () => new URL(import.meta.env.BASE_URL, location.origin).toString();

/** The network the user prefers (picked on the Network page) or the configured default. */
const chosen = !!read(NETWORK_KEY);
const preferred: NetworkName = config.network;
/** A network the user picked explicitly runs alone: we never route their traffic over a network they didn't pick. */
const laneIds: NetworkName[] = chosen || !STANDBY[preferred] ? [preferred] : [preferred, STANDBY[preferred]!];

let lanes: Lane[] = laneIds.map(newLane);
const workers = new Map<NetworkName, AnonRpcWorker>();
/** Networks whose pinned specifier failed to boot this session: they boot with a live (direct, counted) read. */
const livePin = new Set<NetworkName>();
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
const lane = (id: NetworkName) => lanes.find((l) => l.id === id)!;
const setLane = (id: NetworkName, f: (l: Lane) => Lane) => { lanes = lanes.map((l) => (l.id === id ? f(l) : l)); emit(); };

/** Reads the specifier directly. Only used when a network has no pin, or its pin failed to boot. */
function directProvider(urls: string[]) {
  return {
    request: async ({ method, params }: { method: string; params?: unknown[] }) => {
      let last: unknown;
      for (const url of urls) {
        logRequest(url, { method: "POST", body: JSON.stringify({ method, params }) }, "bootstrap");
        try {
          const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: params ?? [] }), signal: AbortSignal.timeout(10_000) });
          const j = await r.json();
          if (j.error) throw new Error(typeof j.error === "string" ? j.error : j.error.message);
          return j.result;
        } catch (e) { last = e; }
      }
      throw last;
    },
  };
}

/**
 * Safety net for the traffic share: any request this page sends directly that wasn't logged above is counted as
 * not-through-Anon-RPC. App assets from our own origin (including the self-hosted worker code), hosts already
 * logged (startup providers, the relay's opt-in demo lane) and localhost are skipped.
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

function startLane(id: NetworkName) {
  if (workers.has(id)) return workers.get(id)!;
  countUnloggedDirectRequests();
  const n = NETWORKS[id];
  const pinned = hasPin(id) && !livePin.has(id);
  const w = new AnonRpcWorker({
    address: n.address,
    config: n.config as any,
    preExisting: { rpcProvider: pinned ? pinnedProvider(id, n.address, siteBase()) : directProvider(config.bootstrap[n.chain]) },
  });
  workers.set(id, w);
  setLane(id, (l) => started(l, Date.now()));
  // A pinned boot that fails (the network shipped a new worker since our pin) retries once with a live read.
  w.ready.catch((e: unknown) => {
    const msg = String((e as Error)?.message ?? e);
    if (pinned && /hash|bundle|resolver|specifier/i.test(msg)) {
      forgetPin(id);
      livePin.add(id);
      restartLane(id);
    } else setLane(id, (l) => onResult(l, false, 0, Date.now(), msg));
  });
  return w;
}

function restartLane(id: NetworkName) {
  workers.get(id)?.close();
  workers.delete(id);
  startLane(id);
}

/** After a network first works, check its pin against the live specifier, through that network. */
const pinChecked = new Set<NetworkName>();
function checkPinLater(id: NetworkName) {
  if (pinChecked.has(id) || livePin.has(id)) return;
  pinChecked.add(id);
  const n = NETWORKS[id];
  const rpc = config.bootstrap[n.chain][0];
  const ethCall = async (to: string, data: string) => {
    const r = await sendOn(id, rpc, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to, data }, "latest"] }),
      anonOptions: { isolationKey: `pin-${id}` } });
    const j = await r.json();
    if (!j.result) throw new Error("no result");
    return j.result as string;
  };
  setTimeout(() => refreshPin(id, n.address, ethCall).catch(() => {}), 20_000);
}

// Dev-only failure switches, to exercise the failover on a desktop:
// ?simulate-nox-fail (Nox never starts, like iPhone Safari) and ?simulate-nox-stall (Nox stops after 20 s).
const t0 = Date.now();
function simulated(id: NetworkName): Error | undefined {
  if (!import.meta.env.DEV || id !== "sphinx") return;
  if (location.search.includes("simulate-nox-fail")) return new Error("NoxWorkerError: kps.exchange.failed /topology: TOPOLOGY_FETCH_FAILED (simulated)");
  if (location.search.includes("simulate-nox-stall") && Date.now() - t0 > 20_000) return new Error("NoTunnelExitError: No exit offers TLS tunnels (simulated)");
}

type Init = Parameters<AnonFetch>[1] & { anonOptions?: { isolationKey?: string; hedge?: boolean } };

/** One attempt on one network, bounded by that network's time limit. Updates the lane's health. */
async function sendOn(id: NetworkName, url: string, init: Init): Promise<Response> {
  const w = startLane(id);
  const { hedge: _, ...anonOptions } = init.anonOptions ?? {};
  const s = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const sim = simulated(id);
    if (sim) throw sim;
    const r = await Promise.race([
      w.fetch(url, { ...init, anonOptions }),
      new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new Error(`${NETWORKS[id].short}: no answer in ${NETWORKS[id].timeoutMs / 1000}s`)), NETWORKS[id].timeoutMs); }),
    ]);
    setLane(id, (l) => onResult(l, true, Date.now() - s, Date.now()));
    checkPinLater(id);
    return r;
  } catch (e) {
    setLane(id, (l) => onResult(l, false, 0, Date.now(), String((e as Error)?.message ?? e)));
    throw e;
  } finally {
    clearTimeout(timer);
    maintain();
  }
}

/** Keep the backup network running in the background, unless the browser asks to save data (it downloads up to
 *  18 MB of worker code the first time, cached after that). */
const warmStandby = () => !(navigator as { connection?: { saveData?: boolean } }).connection?.saveData;

/** Start the standby when needed, probe networks that went down, keep idle ones warm. Runs after every attempt
 *  and on a timer. */
function maintain() {
  // Nothing in the background while the app is hidden (it pauses; background watching sends its own reads).
  if (typeof document !== "undefined" && document.hidden) return;
  const now = Date.now();
  const [p, s] = [lane(laneIds[0]), laneIds[1] ? lane(laneIds[1]) : undefined];
  if (s && wantStandby(p, s, now, warmStandby())) startLane(s.id);
  for (const l of lanes) {
    if (!probeDue(l, now) && !keepWarmDue(l, now)) continue;
    setLane(l.id, (x) => ({ ...x, nextProbeAt: now + x.backoffMs })); // one probe at a time
    if (simulated(l.id)) { setLane(l.id, (x) => onResult(x, false, 0, Date.now(), "simulated")); continue; }
    if (/hash|bundle|TOPOLOGY|kps\.exchange/i.test(l.error ?? "")) restartLane(l.id); // a broken worker gets a fresh start
    const probe = config.relayUrl ? new URL("/health", config.relayUrl).toString() : config.feedUrl;
    sendOn(l.id, probe, config.relayUrl ? { method: "GET", anonOptions: { isolationKey: `probe-${l.id}` } }
      : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }), anonOptions: { isolationKey: `probe-${l.id}` } })
      .catch(() => {});
  }
}
if (typeof window !== "undefined") setInterval(maintain, 5_000);

/**
 * The app's only network path. Every attempt is recorded for the Spy panel exactly as the server receives it.
 * - Tries the best working network first, then the other one if it fails (never a direct connection).
 * - Address-free reads (anonOptions.hedge) are also sent on the second network if the first is slow; the first
 *   answer wins. Reads that name an address are never hedged.
 * - A relay on localhost is the one disclosed exception: exits can't reach it, so it's fetched directly.
 */
export const anonFetch: AnonFetch = (url, init: Init) => {
  if (isLocal(url)) {
    logRequest(url, init, "direct");
    const { anonOptions: _, ...rest } = init;
    return fetch(url, rest);
  }
  const ids = order(lanes, preferred);
  const hedge = !!init.anonOptions?.hedge && ids.length > 1;
  return new Promise<Response>((resolve, reject) => {
    let settled = false, pending = 0, next = 0, lastErr: unknown;
    const launch = () => {
      if (settled || next >= ids.length) return false;
      const id = ids[next++];
      pending++;
      logRequest(url, init, "mixnet");
      sendOn(id, url, init).then(
        (r) => { if (!settled) { settled = true; resolve(r); } },
        (e) => { lastErr = e; pending--; if (!settled && !launch() && pending === 0) { settled = true; reject(lastErr); } },
      );
      return true;
    };
    launch();
    if (hedge) setTimeout(() => { if (!settled) launch(); }, hedgeAfter(lane(ids[0])));
  });
};

/** An RpcClient on the anonymous path. Address-free clients (block feed, anchor, relay data) may be hedged. */
export function anonRpc(url: string, isolationKey: string, opts: { hedge?: boolean } = { hedge: true }): RpcClient {
  const c = new RpcClient(url, (u, i) => anonFetch(u, { ...i, anonOptions: { ...i.anonOptions, hedge: opts.hedge } }), isolationKey);
  // Covers a slow first network plus a retry on the second one.
  c.timeoutMs = 95_000;
  return c;
}

// ---- What the UI shows ----

const active = () => activeLane(lanes, preferred);
/** The network carrying traffic right now (or the preferred one while nothing is up yet). */
export const network = () => NETWORKS[active() ?? preferred];
/** The worker of the network in use, for its log on the Network page. */
export const getWorker = () => startLane(active() ?? preferred);

export type FailoverNotice = { kind: "switched" | "suggest" | "stuck"; text: string; to?: NetworkName } | undefined;
let notice: FailoverNotice;
let everUp = false;
function computeNotice(): FailoverNotice {
  const a = active();
  if (a) everUp = true;
  const p = lane(preferred);
  if (a && a !== preferred) return { kind: "switched", text: `${NETWORKS[preferred].short} isn't responding` };
  if (!a && chosen && p.status === "down" && STANDBY[preferred]) return { kind: "suggest", text: `${NETWORKS[preferred].short} isn't responding`, to: STANDBY[preferred] };
  if (!a && everUp && lanes.every((l) => l.status === "down" || l.status === "idle"))
    return { kind: "stuck", text: lanes.filter((l) => l.status === "down").map((l) => NETWORKS[l.id].short).join(" and ") + " aren't responding" };
}
subs.add(() => { const n = computeNotice(); if (JSON.stringify(n) !== JSON.stringify(notice)) notice = n; });
/** Observable failover notice, for the banner and the Network page. */
export const failoverState = {
  get: () => notice,
  subscribe: (f: () => void) => (subs.add(f), () => subs.delete(f)),
};
/** Both networks and their health, for the Network page. */
export const lanesState = {
  get: () => lanes,
  subscribe: (f: () => void) => (subs.add(f), () => subs.delete(f)),
};
/** No network is up right now but one is starting, after the app had been working: show "Switching network…". */
export const isSwitching = () => everUp && !active() && lanes.some((l) => l.status === "booting");
/** Kept for the Network page's picker: which network is preferred and whether the user chose it. */
export const bootState = {
  get: () => bootSnapshot,
  subscribe: (f: () => void) => (subs.add(f), () => subs.delete(f)),
};
const bootSnapshot = { network: preferred, chosen };

// The block loop reports progress; lanes track health from every request, so these are now no-ops kept for callers.
export function noteProgress() {}
export function resetHealth() {}
export function checkFailover() { maintain(); }
