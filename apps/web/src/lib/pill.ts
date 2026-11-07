// The status pill's text. Display only; pure so it's testable.
export const WAIT_MS = 60_000;

export interface PillIn {
  phase: "idle" | "connecting" | "live" | "error" | "paused";
  head?: string;
  /** When the last verified block arrived on this device (ms since epoch). */
  lastAt?: number;
  now: number;
  /** A failover network switch is in progress (no verified block on the new network yet). */
  switching: boolean;
}
export interface Pill { phase: string; text: string; long?: string }

export function pill(p: PillIn): Pill {
  if (p.phase === "paused") return { phase: "paused", text: "Paused" };
  if (p.switching) return { phase: "connecting", text: "Switching network…" };
  if (p.phase === "live") {
    if (p.lastAt !== undefined && p.now - p.lastAt >= WAIT_MS)
      return { phase: "waiting", text: `Waiting · last block ${Math.round((p.now - p.lastAt) / 1000)}s ago` };
    return { phase: "live", text: "Live", long: ` · block ${p.head ?? ""}` };
  }
  return { phase: p.phase, text: p.phase === "connecting" ? "Connecting" : p.phase === "error" ? "Reconnecting" : "Idle" };
}
