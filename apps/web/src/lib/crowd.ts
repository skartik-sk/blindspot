// Who to hide among when downloading an address's history. Pure (no I/O) so it can be tested.
// The relay built the activity index, so it knows every address's blocks. Fetching the union of this address's
// history and other real addresses' histories makes the request fit all of them equally (k-anonymity).
import type { Address } from "viem";

/** Target crowd: this address plus up to 7 others. */
export const ANONYMITY = 8;
/** Hard cap on blocks per lookup (~330 KB each): bounds phone data (~16 MB) and the relay's upstream fetches. */
export const MAX_BLOCKS = 48;

export type Cover = { address: Address; history: number[] };

/** Uniform random integer in [0, n) from the platform CSPRNG. */
export const cryptoRand = (n: number) => crypto.getRandomValues(new Uint32Array(1))[0] % n;

/**
 * Pick up to ANONYMITY-1 cover histories at random, skipping any that would push the union past MAX_BLOCKS.
 * `crowd` is the number actually achieved, which is what the UI shows.
 */
export function crowdFor(real: number[], cover: Cover[], rand: (n: number) => number = cryptoRand) {
  const pool = [...cover];
  const picked: Cover[] = [];
  let blocks = new Set(real);
  while (picked.length < ANONYMITY - 1 && pool.length) {
    const c = pool.splice(rand(pool.length), 1)[0];
    const next = new Set([...blocks, ...c.history]);
    if (next.size > MAX_BLOCKS) continue;
    picked.push(c);
    blocks = next;
  }
  return { picked, crowd: 1 + picked.length, blocks: [...blocks] };
}
