// Two anonymous networks side by side ("lanes"), so one stalling never stalls the app. Pure policy, no I/O, so it's
// testable; anon.ts owns the workers and calls these.
//
// What we learned from the Mumbai winners and do differently:
// - Atmos keeps a warm standby and fails over on a stall; we do the same across networks (Nox and Nym), which keeps
//   working when a whole mixnet has an outage (Nov 7: Nox exits stopped offering TLS tunnels for ~35 minutes).
// - A lane is trusted only after a real request through it succeeds (probe before trust).
// - Never a direct fallback: if no lane works, requests fail and the app says so.
import type { NetworkName } from "./config";

export type LaneStatus = "idle" | "booting" | "up" | "down";

export interface Lane {
  id: NetworkName;
  status: LaneStatus;
  /** Successful and failed requests since the lane started. */
  ok: number;
  fail: number;
  /** Failures in a row (reset by any success). */
  consec: number;
  startedAt?: number;
  lastOk?: number;
  lastFail?: number;
  /** Smoothed latency of successful requests, ms. */
  ewmaMs?: number;
  /** While down: when to probe again, and the current backoff. */
  nextProbeAt?: number;
  backoffMs: number;
  /** The last error, for the Network page. */
  error?: string;
}

/** A lane is declared down after this many failures in a row (or one boot-fatal error). */
export const DOWN_AFTER = 3;
/** Probe backoff for a down lane: 15 s, doubling to 5 min. */
export const PROBE_MIN_MS = 15_000;
export const PROBE_MAX_MS = 5 * 60_000;
/** Start the standby when the primary has given nothing for this long since it started. */
export const COLD_START_MS = 15_000;
/** A network still starting isn't declared down for ordinary timeouts this soon (Nym's first answer takes 17–60 s). */
export const BOOT_GRACE_MS = 90_000;
/** Warm standby: start the second network this long after the first one works, and keep it warm with a cheap
 *  request when it has been idle this long, so a switch takes one request instead of a 30–60 s start. */
export const WARM_AFTER_MS = 10_000;
export const KEEP_WARM_MS = 60_000;
/** Errors that mean the network can't work in this browser or right now; no point retrying the same lane soon. */
const FATAL = /TOPOLOGY_FETCH_FAILED|kps\.exchange\.failed|NoTunnelExitError|No exit offers|hash mismatch|bundle failed/i;

export const newLane = (id: NetworkName): Lane => ({ id, status: "idle", ok: 0, fail: 0, consec: 0, backoffMs: PROBE_MIN_MS });

export const started = (l: Lane, now: number): Lane => ({ ...l, status: "booting", startedAt: now, consec: 0 });

export function onResult(l: Lane, ok: boolean, ms: number, now: number, error?: string): Lane {
  if (ok) {
    const ewmaMs = l.ewmaMs === undefined ? ms : l.ewmaMs * 0.7 + ms * 0.3;
    return { ...l, status: "up", ok: l.ok + 1, consec: 0, lastOk: now, ewmaMs, backoffMs: PROBE_MIN_MS, nextProbeAt: undefined, error: undefined };
  }
  const consec = l.consec + 1;
  const fatal = !!error && FATAL.test(error);
  const inGrace = l.status === "booting" && l.startedAt !== undefined && now - l.startedAt < BOOT_GRACE_MS;
  if (fatal || (consec >= DOWN_AFTER && !inGrace)) {
    // Each time a lane goes down again, wait longer before probing it.
    const backoffMs = l.status === "down" ? Math.min(l.backoffMs * 2, PROBE_MAX_MS) : l.backoffMs;
    return { ...l, status: "down", fail: l.fail + 1, consec, lastFail: now, nextProbeAt: now + backoffMs, backoffMs, error };
  }
  return { ...l, fail: l.fail + 1, consec, lastFail: now, error };
}

/** Lanes to try for one request, best first. Down lanes are left out unless every lane is down (then try them all,
 *  so the app recovers as soon as any network does). Never includes a non-anonymous lane unless it's the only one. */
export function order(lanes: Lane[], preferred: NetworkName): NetworkName[] {
  const rank = (l: Lane) =>
    (l.status === "up" ? 0 : l.status === "booting" ? 1 : l.status === "idle" ? 2 : 3) * 10 + (l.id === preferred ? 0 : 1);
  const live = lanes.filter((l) => l.status !== "down" && l.status !== "idle");
  const pool = live.length ? live : lanes.filter((l) => l.status !== "idle");
  return [...(pool.length ? pool : lanes)].sort((a, b) => rank(a) - rank(b) || (a.ewmaMs ?? 9e9) - (b.ewmaMs ?? 9e9)).map((l) => l.id);
}

/** Should the standby network be started now? `warm`: start it early as a warm standby (off when saving data). */
export function wantStandby(primary: Lane, standby: Lane | undefined, now: number, warm = false): boolean {
  if (!standby || standby.status !== "idle") return false;
  if (primary.status === "down" || primary.consec > 0) return true;
  if (warm && primary.status === "up" && primary.lastOk !== undefined && primary.startedAt !== undefined && now - primary.startedAt >= WARM_AFTER_MS) return true;
  return primary.ok === 0 && primary.startedAt !== undefined && now - primary.startedAt >= COLD_START_MS;
}

/** A working network that has carried nothing for a while gets a cheap request, so its route stays open. */
export const keepWarmDue = (l: Lane, now: number) =>
  l.status === "up" && l.lastOk !== undefined && now - l.lastOk >= KEEP_WARM_MS && (l.nextProbeAt === undefined || now >= l.nextProbeAt);

/** A down lane whose backoff has passed gets one probe request. */
export const probeDue = (l: Lane, now: number) => l.status === "down" && l.nextProbeAt !== undefined && now >= l.nextProbeAt;

/** How long to wait on the first lane before also sending an address-free read on the second (hedging). */
export function hedgeAfter(l: Lane): number {
  if (l.ewmaMs === undefined) return l.id === "nym" ? 20_000 : 8_000;
  return Math.min(15_000, Math.max(3_000, l.ewmaMs * 3));
}

/** The lane that's actually carrying traffic right now (first in order that is up), if any. */
export function activeLane(lanes: Lane[], preferred: NetworkName): NetworkName | undefined {
  return order(lanes, preferred).find((id) => lanes.find((l) => l.id === id)?.status === "up");
}
