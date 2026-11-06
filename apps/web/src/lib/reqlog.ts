// Every request this app sends, as the receiving server sees it. Feeds the Spy Panel's right-hand column.
export interface ReqEntry {
  id: number;
  t: number;
  host: string;
  /** mixnet = through Anon-RPC; direct = relay on this machine; bootstrap = the worker reading its specifier contract. */
  route: "mixnet" | "direct" | "bootstrap";
  /** First chars of the isolation key: same key = same route, different key = unlinkable. */
  key: string;
  method: string;
  /** Params exactly as sent (truncated for display). */
  detail: string;
}

let entries: ReqEntry[] = [];
let seq = 0;
/** Running totals since load (the visible log keeps only the last 300). */
const totals: Record<ReqEntry["route"], number> = { mixnet: 0, direct: 0, bootstrap: 0 };
const subs = new Set<() => void>();

function describe(body: unknown): { method: string; detail: string } {
  if (typeof body !== "string") return { method: "GET", detail: "" };
  try {
    const j = JSON.parse(body);
    if (j.method) return { method: j.method, detail: JSON.stringify(j.params ?? []).slice(0, 160) };
    if (Array.isArray(j.q)) return { method: "pir_query", detail: `epoch ${j.epoch}, ${j.q.length} encrypted selectors` };
  } catch {}
  return { method: "POST", detail: `${body.length} bytes` };
}

export function logRequest(url: string, init: RequestInit & { anonOptions?: { isolationKey?: string } }, route: ReqEntry["route"]) {
  const { method, detail } = init.method === "GET" || !init.body ? { method: "GET " + new URL(url).pathname, detail: "" } : describe(init.body);
  totals[route]++;
  entries = [
    ...entries.slice(-299),
    { id: ++seq, t: Date.now(), host: new URL(url).host, route, key: init.anonOptions?.isolationKey?.slice(0, 6) ?? "shared", method, detail },
  ];
  subs.forEach((f) => f());
}

/**
 * Traffic share: of every RPC/HTTP request this app made since load, the % that went through Anon-RPC.
 * Counts every logged request, including the worker's own bootstrap reads (sent directly; public chain data).
 */
export function trafficShare() {
  const total = totals.mixnet + totals.direct + totals.bootstrap;
  return { total, ...totals, pct: total ? (100 * totals.mixnet) / total : 0 };
}

export const reqlog = {
  get: () => entries,
  subscribe: (f: () => void) => (subs.add(f), () => subs.delete(f)),
  clear: () => ((entries = []), subs.forEach((f) => f())),
};
