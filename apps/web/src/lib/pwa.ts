// Installable app: register the service worker (production only) and expose the browser's install prompt.
import { useSyncExternalStore } from "react";

type Prompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
let deferred: Prompt | undefined;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

export function initPwa() {
  if (import.meta.env.PROD && "serviceWorker" in navigator)
    addEventListener("load", () => navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL }).catch(() => {}));
  addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e as Prompt; emit(); });
  addEventListener("appinstalled", () => { deferred = undefined; emit(); });
}

/** True when the browser offers installation (Chrome/Edge/Android). iOS installs via Share -> Add to Home Screen. */
export const useInstallable = () => useSyncExternalStore((f) => (subs.add(f), () => subs.delete(f)), () => !!deferred);

export async function install() {
  if (!deferred) return;
  await deferred.prompt();
  await deferred.userChoice.catch(() => undefined);
  deferred = undefined;
  emit();
}
