
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },

  // Prevent production browser source maps from being published.
  productionBrowserSourceMaps: false,
};

export default nextConfig;
