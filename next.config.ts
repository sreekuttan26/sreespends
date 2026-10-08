import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Let phones on the local network load dev assets (otherwise the page never hydrates).
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.*.*.*"],
  cacheComponents: true,
  partialPrefetching: true,
  reactCompiler: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
