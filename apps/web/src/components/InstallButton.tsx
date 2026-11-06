import { install, useInstallable } from "../lib/pwa";

/** Shown only when the browser can install the app. */
export default function InstallButton({ className = "btn small" }: { className?: string }) {
  const can = useInstallable();
  if (!can) return null;
  return <button type="button" className={className} onClick={install}>Install app</button>;
}
