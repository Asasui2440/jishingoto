import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["kuromoji"],
  outputFileTracingIncludes: {
    "/api/readings": ["./node_modules/kuromoji/dict/**/*"],
    "/api/room/aftermath": ["./public/illustrations/room-style-reference.jpeg"],
  },
};

export default nextConfig;
