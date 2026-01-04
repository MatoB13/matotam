import type { NextConfig } from "next";
import path from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

const nextConfig: NextConfig = {
  transpilePackages: ["lucid-cardano"],

  webpack: (config) => {
    config.experiments = {
      ...(config.experiments || {}),
      asyncWebAssembly: true,
      layers: true,
    };

    // ---- WASM-bindgen placeholder fix (without violating "exports") ----
    const lucidPkgJson = require.resolve("lucid-cardano/package.json");
    const lucidDir = path.dirname(lucidPkgJson);

    const placeholderPath = path.join(
      lucidDir,
      "esm/src/core/libs/cardano_multiplatform_lib/__wbindgen_placeholder__.js"
    );

    config.resolve = config.resolve || {};
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      "__wbindgen_placeholder__": placeholderPath,
    };

    config.module.rules.push({
      test: /\.wasm$/,
      type: "webassembly/async",
    });

    return config;
  },
};

export default nextConfig;
