export const WALLET_LABELS: Record<string, string> = {
  nami: "Nami",
  eternl: "Eternl",
  lace: "Lace",
  vespr: "VESPR",
  flint: "Flint",
};

// Prefer explicit env, otherwise choose a safe default based on NEXT_PUBLIC_NETWORK.
// IMPORTANT: Do not silently default prod to preprod.
const NETWORK_ENV = (process.env.NEXT_PUBLIC_NETWORK || "").toLowerCase();

export const CARDANO_NETWORK = (() => {
  if (NETWORK_ENV === "mainnet") return "Mainnet";
  if (NETWORK_ENV === "preview") return "Preview";
  if (NETWORK_ENV === "preprod") return "Preprod";
  // Safer default for local dev (change if you want):
  return "Preprod";
})() as "Mainnet" | "Preprod" | "Preview";

// Real Blockfrost credentials. These are SERVER-ONLY (no NEXT_PUBLIC_ prefix),
// so they are never inlined into client JS bundles. Only import these from
// server code (API routes) — never from a "use client" component.
export const BLOCKFROST_SERVER_API =
  process.env.BLOCKFROST_API?.trim() ||
  (CARDANO_NETWORK === "Mainnet"
    ? "https://cardano-mainnet.blockfrost.io/api/v0"
    : CARDANO_NETWORK === "Preview"
    ? "https://cardano-preview.blockfrost.io/api/v0"
    : "https://cardano-preprod.blockfrost.io/api/v0");

export const BLOCKFROST_SERVER_KEY = process.env.BLOCKFROST_KEY?.trim() || "";

// Client-safe values: point at our own same-origin proxy route
// (src/app/api/blockfrost/[...path]/route.ts) instead of blockfrost.io
// directly, so the real project_id key never reaches the browser.
// The proxy ignores whatever project_id header the client sends and
// attaches BLOCKFROST_SERVER_KEY itself.
export const BLOCKFROST_API = "/api/blockfrost";
export const BLOCKFROST_KEY = "via-server-proxy";

// ADA Handle mainnet policy
export const ADA_HANDLE_POLICY_ID =
  "f0ff48bbb7bbe9d59a40f1ce90e9e9d0ff5002ec48f232b49ca0fb9a";

export const DEV_ADDRESS =
  "addr1q8d5hu0c0x9vyklqdshkx6t0mw3t9tv46c6g4wvqecduqq2e9wy54x7ffcdly855h96s805k9e3z4pgpmeyu5tjfudfsksgfnq";

  export const TEST_ADDRESSES: string[] = [
  "addr1qxfvr8gtytlueqs4mn4f43k0kuvxhwzvs79llh3z7nxgjesn5gqsvff7hy9jypg65z529ad3ldauxmsajylwvj7e6lpqkuq6qs", // mato 2025
  "addr1q94fu2pex5yctced6cln7f76yewpryjrcrr2c7044uv24dcw9q3xhq624fulr06kk88h22ethjcr0cz7yv6vxkjrrrzskn5juu", // slovak
  "addr1q9nfaxtq4q7qycu6qpv8rhuanshjhxrpa84lv99ng2pxeg9dwtkpzdtlhxpjr3aahkn080zw5r02p9zwx3nssxxr995syhd2ku", // matodux
  "addr1qx6y87n39wtm4jdz0a36n6rxx8m0992tdee9sscrhsqqtddzwq2076l4hd7pemhh9wv4nw7sjtnlvf9qk7hcu0mc55zsg7vrhn", // mato new
];

