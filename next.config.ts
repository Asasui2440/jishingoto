import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["kuromoji"],
  outputFileTracingIncludes: { "/api/readings": ["./node_modules/kuromoji/dict/**/*"] },
};

export default nextConfig;
