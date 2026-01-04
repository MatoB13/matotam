import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["lucid-cardano"],

  webpack: (config) => {
    // WASM support
    config.experiments = {
      ...(config.experiments || {}),
      asyncWebAssembly: true,
      layers: true,
    };

    // FIX: wasm-bindgen placeholder used by lucid-cardano CML
    config.resolve = config.resolve || {};
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      "__wbindgen_placeholder__": require.resolve(
        "lucid-cardano/esm/src/core/libs/cardano_multiplatform_lib/__wbindgen_placeholder__.js"
      ),
    };

    // Make sure .wasm is handled as async wasm
    config.module.rules.push({
      test: /\.wasm$/,
      type: "webassembly/async",
    });

    return config;
  },
};

export default nextConfig;
