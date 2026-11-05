// Runtime config from Vite env. Nothing secret lives here: these are public endpoints.
const env = import.meta.env;

export type NetworkName = "tor" | "sphinx" | "passthrough";

export const config = {
  network: (env.VITE_ANON_NETWORK ?? "tor") as NetworkName,
  /** Our BAL relay (must be public https for Tor/mixnet exits to reach it). */
  relayUrl: env.VITE_RELAY_URL ?? "http://localhost:8787/",
  /** Independent provider used to anchor hit blocks; also the upstream for sending. */
  anchorUrl: env.VITE_ANCHOR_URL ?? "https://ethereum-sepolia-rpc.publicnode.com",
  /** Bootstrap providers: used once, only to read the Anon-RPC specifier contract. */
  bootstrap: {
    mainnet: env.VITE_BOOTSTRAP_MAINNET ?? "https://ethereum-rpc.publicnode.com",
    sepolia: env.VITE_BOOTSTRAP_SEPOLIA ?? "https://ethereum-sepolia-rpc.publicnode.com",
  },
};
