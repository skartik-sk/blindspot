// Opt-in background watching. Off by default: the app pauses while hidden (no downloads). When on (desktop), it keeps
// following blocks while the tab is hidden and shows a local notification when a watched wallet trades. Nothing new
// is sent anywhere: the same block-number requests continue, and notifications are built from data already on the device.
export const BG_KEY = "bp.background.v1";

/** On only while notifications are still allowed: if permission is later revoked, the app pauses again. */
export function keepWatching(): boolean {
  try {
    return localStorage.getItem(BG_KEY) === "1" && typeof Notification !== "undefined" && Notification.permission === "granted";
  } catch { return false; }
}
export function saveKeepWatching(on: boolean) {
  try { if (on) localStorage.setItem(BG_KEY, "1"); else localStorage.removeItem(BG_KEY); } catch {}
}

/** What the block loop does when the tab's visibility changes. Pure, so it can be tested. */
export function onVisibility(hidden: boolean, keep: boolean, running: boolean): "pause" | "resume" | "none" {
  if (hidden) return keep || !running ? "none" : "pause";
  return running ? "none" : "resume";
}

export type Perm = NotificationPermission | "unsupported";
export type ToggleResult = { on: boolean; perm: Perm; note?: string };

/** Turning the toggle on asks for notification permission (only then), and stays off unless it's granted. */
export async function turnOn(perm: Perm, request: () => Promise<NotificationPermission>): Promise<ToggleResult> {
  if (perm === "unsupported") return { on: false, perm, note: "This browser can't show notifications." };
  const p = perm === "default" ? await request().catch(() => "denied" as const) : perm;
  if (p === "granted") return { on: true, perm: p };
  return { on: false, perm: p, note: "Notifications are blocked for this site. Allow them in the browser's site settings, then try again." };
}
