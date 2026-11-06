// When Nox can't boot in this browser (EF, Nov 6: on iPhone Safari with harness 0.4.0 the KPS dial succeeds, then
// kps.exchange.failed on /topology -> TOPOLOGY_FETCH_FAILED), switch to Nym. Pure logic, no I/O, so it's testable.
// Rules: decide from the failure itself, never the browser name; only before Nox has ever worked in this session;
// only to another anonymous network, never to a direct connection.
import type { NetworkName } from "./config";

export const FALLBACK_FROM: NetworkName = "sphinx";
export const FALLBACK_TO: NetworkName = "nym";
/** Without a recognisable boot error, this many failures in a row (no success yet) also count as "can't boot". */
export const MAX_BOOT_FAILURES = 3;
const BOOT_ERROR = /TOPOLOGY_FETCH_FAILED|kps\.exchange\.failed|topology/i;

export interface BootState {
  network: NetworkName;
  /** True if the user picked this network on the Network page: never override a deliberate choice. */
  chosen: boolean;
  successes: number;
  failures: number;
  fellBack: boolean;
}

/** A network the user picked always wins over an earlier automatic fallback. */
export const initialBoot = (network: NetworkName, chosen: boolean, fellBack = false): BootState =>
  fellBack && !chosen ? { network: FALLBACK_TO, chosen, successes: 0, failures: 0, fellBack: true } : { network, chosen, successes: 0, failures: 0, fellBack: false };

export const onSuccess = (s: BootState): BootState => ({ ...s, successes: s.successes + 1, failures: 0 });

/** Returns the next state and, if the app should switch networks now, which one. */
export function onFailure(s: BootState, message: string, anonymous: (n: NetworkName) => boolean): { state: BootState; switchTo?: NetworkName } {
  const failures = s.failures + 1;
  const eligible = s.network === FALLBACK_FROM && !s.chosen && !s.fellBack && s.successes === 0;
  if (!eligible || !anonymous(FALLBACK_TO)) return { state: { ...s, failures } };
  if (BOOT_ERROR.test(message) || failures >= MAX_BOOT_FAILURES)
    return { state: { ...s, network: FALLBACK_TO, failures: 0, fellBack: true }, switchTo: FALLBACK_TO };
  return { state: { ...s, failures } };
}
