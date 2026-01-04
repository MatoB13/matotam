import type { NextConfig } from "next";
import path from "path";
import fs from "fs";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

function resolveLucidPlaceholder(): string {
  // This is allowed by exports (resolves to the public entry)
  const lucidEntry = require.resolve("lucid-cardano");

  // Typical entry is .../node_modules/lucid-cardano/esm/mod.js
  // We want .../node_modules/lucid-cardano/esm/src/core/libs/cardano_multiplatform_lib/__wbindgen_placeholder__.js
  const entryDir = path.dirname(lucidEntry);

  // If entryDir already ends with ".../lucid-cardano/esm", great.
  // If not, we still try to locate the "esm" folder relative to the entry.
  let esmDir = entryDir;

  // Walk up until we find an "esm" directory (max 3 levels, just in case)
  for (let i = 0; i < 4; i++) {
    const candidate = path.join(esmDir, "esm");
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      esmDir = candidate;
      break;
    }
    // If current dir already looks like ".../esm", stop
    if (path.basename(esmDir) === "esm") break;
    esmDir = path.dirname(esmDir);
  }

  // If we ended at ".../esm/src/..." entry, normalize to ".../esm"
  if (path.basename(esmDir) !== "esm") {
    // last attempt: if the entry itself is inside /esm/, cut up to /esm
    const parts = lucidEntry.split(path.sep);
    const esmIdx = parts.lastIndexOf("esm");
    if (esmIdx !== -1) {
      esmDir = parts.slice(0, esmIdx + 1).join(path.sep);
    }
  }

  const placeholderPath = path.join(
    esmDir,
    "src/core/libs/cardano_multiplatform_lib/__wbindgen_placeholder__.js"
  );

  if (!fs.existsSync(placeholderPath)) {
    throw new Error(
      `Could not find lucid-cardano placeholder at: ${placeholderPath}\n` +
        `Resolved lucid entry: ${lucidEntry}`
    );
  }

  return placeholderPath;
}

const nextConfig: NextConfig = {
  transpilePackages: ["lucid-cardano"],

  webpack: (config) => {
    config.experiments = {
      ...(config.experiments || {}),
      asyncWebAssembly: true,
      layers: true,
    };

    config.resolve = config.resolve || {};
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      "__wbindgen_placeholder__": resolveLucidPlaceholder(),
    };

    config.module.rules.push({
      test: /\.wasm$/,
      type: "webassembly/async",
    });

    return config;
  },
};

export default nextConfig;
