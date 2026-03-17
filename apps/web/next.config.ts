import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: ["@nexus/shared", "@nexus/sdk", "@nexus/ui"],
  experimental: {
    typedRoutes: true,
  },
};

export default config;
