import { useSyncExternalStore } from "react";
import { failoverState } from "../lib/anon";
import { NETWORK_KEY } from "../lib/config";

const label = (n?: string) => (n === "sphinx" ? "Nox" : n === "nym" ? "Nym" : n === "tor" ? "Tor" : n ?? "");

/**
 * Which anonymous network carries traffic, when it isn't the usual one. Both networks run side by side, so a switch
 * is instant; this only explains it. Never a direct connection.
 */
export default function FallbackBanner({ className = "fallback-banner" }: { className?: string }) {
  const notice = useSyncExternalStore(failoverState.subscribe, failoverState.get);
  if (!notice) return null;
  if (notice.kind === "switched") {
    return (
      <div className={className} role="status">
        <strong>Using {notice.to ? label(notice.to) : "the backup network"} because {notice.text}.</strong>
        <span> Still private: every request goes through an anonymity network, never directly. The usual network is checked again in the background.</span>
      </div>
    );
  }
  if (notice.kind === "suggest" && notice.to) {
    const to = notice.to;
    const pick = () => { try { localStorage.setItem(NETWORK_KEY, to); } catch {} location.reload(); };
    return (
      <div className={className} role="status">
        <strong>{notice.text}.</strong>
        <span> You picked it on the Network page, so the app won't switch by itself. </span>
        <button type="button" className="btn small" onClick={pick}>Switch to {label(to)}</button>
      </div>
    );
  }
  return (
    <div className={className} role="status">
      <strong>{notice.text}.</strong>
      <span> The app keeps retrying through the mixnet and never connects directly. Alerts resume when one recovers.</span>
    </div>
  );
}
