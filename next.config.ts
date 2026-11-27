import type { NextConfig } from "next";
import { MOVED_PAGES } from "./src/lib/old-addresses";

const nextConfig: NextConfig = {
  devIndicators: false,
  poweredByHeader: false,
  // A small self-contained server for the Docker image the shop server runs.
  output: "standalone",
  cacheComponents: true,
  partialPrefetching: true,
  allowedDevOrigins: ["127.0.0.1"],
  // Pages that moved into Settings (DAN-33). Temporary (307), not permanent: a
  // permanent forward is remembered by browsers for good, and these addresses
  // may be wanted again. The query string goes with it.
  async redirects() {
    return MOVED_PAGES.map(({ from, to }) => ({ source: from, destination: to, permanent: false }));
  },
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
