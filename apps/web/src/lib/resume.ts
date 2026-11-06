// Where to restart block following after the app was hidden. Pure, so it can be tested.
// Catch up on what was missed, but at most MAX_CATCH_UP blocks (each is ~250–330 KB): after a long break, the oldest
// missed blocks are skipped instead of downloading hours of history at once.
export const BLOCK_MS = 12_000;
export const MAX_CATCH_UP = 30;

/** undefined = no block seen yet: start at the chain head. */
export function resumeFrom(lastBlock: bigint | undefined, hiddenMs: number): { from?: bigint; skipped: number } {
  if (lastBlock === undefined) return { skipped: 0 };
  const missed = Math.max(0, Math.floor(hiddenMs / BLOCK_MS));
  const skipped = Math.max(0, missed - MAX_CATCH_UP);
  return { from: lastBlock + 1n + BigInt(skipped), skipped };
}
