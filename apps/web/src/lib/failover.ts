// Mid-session failover between the two anonymous networks (Nox <-> Nym). Pure logic, no I/O, so it's testable.
// fallback.ts handles "Nox can't start in this browser"; this handles "the network stopped delivering later".
// Rules: only ever switch to the other anonymous network, never to a direct connection; never override a network
// the user picked (suggest instead); retry the home network on a backoff; stop flapping when both are down.
import type { NetworkName } from "./config";

export const MAX_FAILED_READS = 3;
/** No verified block for this long counts as "stopped responding". Nym starts slower, so it gets longer. */
export const STALL_MS: Record<NetworkName, number> = { sphinx: 60_000, nym: 120_000, tor: 120_000, passthrough: 60_000 };
/** First retry of the home network after a switch; doubles after each failed retry, up to the cap. */
export const PROBE_MS = 10 * 60_000;
export const PROBE_CAP_MS = 40 * 60_000;
/** At most this many automatic switches in WINDOW_MS; after that, stay put (both networks are probably down). */
export const MAX_SWITCHES = 4;
export const WINDOW_MS = 15 * 60_000;

export const PAIR: Partial<Record<NetworkName, NetworkName>> = { sphinx: "nym", nym: "sphinx" };

export interface Failover {
  /** The network this tab started on (where it returns when that works again). */
  home: NetworkName;
  active: NetworkName;
  reason?: string;
  /** When to try the home network again (ms since epoch), while away from it. */
  probeAt?: number;
  /** How many times a return to the home network has failed (sets the backoff). */
  probes: number;
  /** Times of recent automatic switches. */
  recent: number[];
}

export const initialFailover = (home: NetworkName): Failover => ({ home, active: home, probes: 0, recent: [] });

export type Decision =
  | { kind: "none" }
  | { kind: "suggest"; to: NetworkName; reason: string }
  | { kind: "stuck"; reason: string }
  | { kind: "switch"; to: NetworkName; reason: string; next: Failover };

export interface Health { failedReads: number; sinceProgressMs: number }

const label = (n: NetworkName) => (n === "sphinx" ? "Nox" : n === "nym" ? "Nym" : n === "tor" ? "Tor" : n);

/** Called regularly while the block loop runs. */
export function decide(s: Failover, h: Health, chosen: boolean, anonymous: (n: NetworkName) => boolean, now: number): Decision {
  const stalled = h.failedReads >= MAX_FAILED_READS || h.sinceProgressMs >= (STALL_MS[s.active] ?? 60_000);
  const to = PAIR[s.active];
  if (stalled) {
    if (!to || !anonymous(to)) return { kind: "none" }; // never fall back to a direct, non-anonymous connection
    const reason = `${label(s.active)} stopped responding`;
    if (chosen) return { kind: "suggest", to, reason };
    const recent = s.recent.filter((t) => now - t < WINDOW_MS);
    if (recent.length >= MAX_SWITCHES) return { kind: "stuck", reason: `${label(s.active)} and ${label(to)} both stopped responding` };
    // Leaving home: start the retry clock. Leaving after a failed retry of home: back off.
    const probes = s.active === s.home && s.probeAt !== undefined ? s.probes + 1 : s.probes;
    const wait = Math.min(PROBE_MS * 2 ** probes, PROBE_CAP_MS);
    const next: Failover = { ...s, active: to, reason, probes, probeAt: to === s.home ? undefined : now + wait, recent: [...recent, now] };
    return { kind: "switch", to, reason, next };
  }
  // Healthy. Away from home and the retry is due: go back and see if home works again.
  if (!chosen && s.active !== s.home && s.probeAt !== undefined && now >= s.probeAt && anonymous(s.home)) {
    const next: Failover = { ...s, active: s.home, reason: `Trying ${label(s.home)} again`, probeAt: now, recent: s.recent };
    return { kind: "switch", to: s.home, reason: next.reason!, next };
  }
  return { kind: "none" };
}

/** A verified block arrived on the active network: if that's home, the episode is over. */
export function onProgress(s: Failover): Failover {
  return s.active === s.home ? { ...s, reason: undefined, probeAt: undefined, probes: 0 } : s;
}

export const failoverLabel = label;
