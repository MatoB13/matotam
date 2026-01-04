import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pomáha Nextu spracovať ESM balík lucid-cardano korektne
  transpilePackages: ["lucid-cardano"],

  webpack: (config) => {
    // Enable async WebAssembly (potrebné pre CML WASM v Lucid-e)
    config.experiments = {
      ...(config.experiments || {}),
      asyncWebAssembly: true,
      layers: true,
    };

    // Ensure .wasm files are treated as async wasm modules
    config.module.rules.push({
      test: /\.wasm$/,
      type: "webassembly/async",
    });

    return config;
  },
};

export default nextConfig;
