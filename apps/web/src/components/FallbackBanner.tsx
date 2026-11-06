import { useSyncExternalStore } from "react";
import { bootState } from "../lib/anon";

/** Shown only when Nox couldn't boot in this browser and the app switched to Nym (still anonymous, slower). */
export default function FallbackBanner({ className = "fallback-banner" }: { className?: string }) {
  const boot = useSyncExternalStore(bootState.subscribe, bootState.get);
  if (!boot.fellBack) return null;
  return (
    <div className={className} role="status">
      <strong>Nox isn't available in this browser, using Nym (slower alerts).</strong>
      <span> Still private: every request goes through a mixnet, never directly.</span>
    </div>
  );
}
