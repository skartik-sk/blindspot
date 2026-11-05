// Runtime config from Vite env. Nothing secret lives here: these are public endpoints.
const env = import.meta.env;

export type NetworkName = "tor" | "sphinx" | "passthrough";

export const config = {
  network: (env.VITE_ANON_NETWORK ?? "sphinx") as NetworkName,
  /**
   * Where block access lists come from: our BAL relay once deployed (must be public https for mixnet/Tor
   * exits to reach it), else any node serving eth_getBlockAccessList. Reads are address-free either way.
   */
  relayUrl: env.VITE_RELAY_URL ?? "https://ethereum-sepolia-rpc.publicnode.com",
  /** Independent provider (different operator from relayUrl) used to anchor hit blocks' hashes. */
  anchorUrl: env.VITE_ANCHOR_URL ?? "https://sepolia.gateway.tenderly.co",
  /** Where transactions are sent. */
  sendUrl: env.VITE_SEND_URL ?? "https://ethereum-sepolia-rpc.publicnode.com",
  /** Bootstrap providers: used once, only to read the Anon-RPC specifier contract. */
  bootstrap: {
    mainnet: env.VITE_BOOTSTRAP_MAINNET ?? "https://ethereum-rpc.publicnode.com",
    sepolia: env.VITE_BOOTSTRAP_SEPOLIA ?? "https://ethereum-sepolia-rpc.publicnode.com",
  },
};
