import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return ["/offline-evac/sw.js", "/sw.js"].map(source => ({ source, headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }] }));
  },
  serverExternalPackages: ["kuromoji"],
  outputFileTracingIncludes: {
    "/api/room/analyze": ["./knowledge/SOURCES.md", "./knowledge/earthquake/*.md", "./knowledge/cases/*.md"],
    "/api/readings": ["./node_modules/kuromoji/dict/**/*"],
    "/api/room/aftermath": ["./public/illustrations/room-style-reference.jpeg"],
  },
};

export default nextConfig;
