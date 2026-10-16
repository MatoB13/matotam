const path = require("path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["lucid-cardano"],

  // Same value in the page bundle and in /api/version, so an open page can tell a newer deploy is live.
  env: {
    APP_BUILD_ID: process.env.VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_DEPLOYMENT_ID || String(Date.now()),
  },

  webpack: (config) => {
    config.experiments = {
      ...(config.experiments || {}),
      asyncWebAssembly: true,
      layers: true,
    };

    config.resolve = config.resolve || {};
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      "__wbindgen_placeholder__": path.resolve(
        __dirname,
        "src/__wbindgen_placeholder__.js"
      ),
    };

    config.module.rules.push({
      test: /\.wasm$/,
      type: "asset/resource",
    });


    return config;
  },
};

module.exports = nextConfig;
