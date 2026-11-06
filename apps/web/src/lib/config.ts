// Runtime config from Vite env. Nothing secret lives here: these are public endpoints.
const env = import.meta.env;

export type NetworkName = "tor" | "sphinx" | "passthrough";

const relay = env.VITE_RELAY_URL as string | undefined;
const list = (v: string | undefined, fallback: string[]) => (v ? v.split(",").map((s: string) => s.trim()).filter(Boolean) : fallback);

export const config = {
  network: (env.VITE_ANON_NETWORK ?? "sphinx") as NetworkName,
  /**
   * Our relay (public https in production: mixnet/Tor exits only reach https hosts on :443).
   * Serves verified blocks, compact receipts and PIR. Unset: blocks come straight from publicnode.
   */
  relayUrl: relay,
  /** Where blocks (header, access list, receipts) are read. Reads are address-free either way. */
  feedUrl: relay ?? "https://ethereum-sepolia-rpc.publicnode.com",
  /** The relay serves receipts without blooms (~3x smaller); publicnode serves eth_getBlockReceipts. */
  feedCompact: !!relay,
  /** Independent provider (different operator from feedUrl): every followed block's hash is checked here. */
  anchorUrl: env.VITE_ANCHOR_URL ?? "https://sepolia.gateway.tenderly.co",
  /** Reads that name an address (your own balances when PIR can't help, nonce, gas). Fresh route each time. */
  readUrl: env.VITE_READ_URL ?? "https://ethereum-sepolia-rpc.publicnode.com",
  /**
   * Private send: a builder RPC that keeps the tx out of the public mempool (Flashbots Protect on mainnet:
   * https://rpc.flashbots.net/fast). Sepolia has none as of Nov 2026 (Flashbots removed its Sepolia DNS), so it's
   * unset by default and the app checks availability before offering it.
   */
  privateSendUrl: env.VITE_SEND_URL as string | undefined,
  /** Bootstrap providers, tried in order: only used to read the Anon-RPC specifier contract (public data). */
  bootstrap: {
    mainnet: list(env.VITE_BOOTSTRAP_MAINNET, ["https://ethereum-rpc.publicnode.com", "https://eth.drpc.org", "https://1rpc.io/eth"]),
    sepolia: list(env.VITE_BOOTSTRAP_SEPOLIA, ["https://ethereum-sepolia-rpc.publicnode.com", "https://sepolia.gateway.tenderly.co", "https://sepolia.drpc.org", "https://1rpc.io/sepolia"]),
  },
};

/** Only a relay on this machine is reached without the mixnet (exits can't reach localhost). Shown in the UI. */
export const isLocal = (url: string) => /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(url);
