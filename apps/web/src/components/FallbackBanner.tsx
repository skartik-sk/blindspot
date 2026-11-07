import { useSyncExternalStore } from "react";
import { bootState, failoverState } from "../lib/anon";
import { NETWORK_KEY } from "../lib/config";
import { failoverLabel } from "../lib/failover";

const time = (t?: number) => (t ? new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "");

/**
 * Which anonymous network this tab is on, when that isn't the usual one: Nox couldn't start here (startup fallback),
 * or it stopped responding mid-session (failover). Never a direct connection.
 */
export default function FallbackBanner({ className = "fallback-banner" }: { className?: string }) {
  const boot = useSyncExternalStore(bootState.subscribe, bootState.get);
  const notice = useSyncExternalStore(failoverState.subscribe, failoverState.get);
  const now = failoverLabel(boot.network);
  if (notice?.kind === "switched") {
    return (
      <div className={className} role="status">
        <strong>{notice.text.startsWith("Trying") ? `${notice.text}.` : `Switched to ${now} because ${notice.text}.`}</strong>
        <span> Still private: every request goes through a mixnet, never directly.{notice.retryAt ? ` Trying the usual network again around ${time(notice.retryAt)}.` : ""}</span>
      </div>
    );
  }
  if (notice?.kind === "suggest" && notice.to) {
    const to = notice.to;
    const pick = () => { try { localStorage.setItem(NETWORK_KEY, to); sessionStorage.removeItem("bp.fallback"); } catch {} location.reload(); };
    return (
      <div className={className} role="status">
        <strong>{notice.text}.</strong>
        <span> You picked {now} on the Network page, so the app won't switch by itself. </span>
        <button type="button" className="btn small" onClick={pick}>Switch to {failoverLabel(to)}</button>
      </div>
    );
  }
  if (notice?.kind === "stuck") {
    return (
      <div className={className} role="status">
        <strong>{notice.text}.</strong>
        <span> The app keeps retrying through the mixnet and never connects directly. Alerts resume when one recovers.</span>
      </div>
    );
  }
  if (!boot.fellBack) return null;
  return (
    <div className={className} role="status">
      <strong>Nox isn't available in this browser, using Nym (slower alerts).</strong>
      <span> Still private: every request goes through a mixnet, never directly.</span>
    </div>
  );
}
