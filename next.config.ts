import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 室内体験の確認サーバーを、他の開発・ビルドの出力と分離する。
  distDir: process.env.ROOM_DEV_SERVER === "1" ? ".next-room-dev" : ".next",
  async headers() {
    return ["/offline-evac/sw.js", "/sw.js"].map(source => ({ source, headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }] }));
  },
  serverExternalPackages: ["kuromoji"],
  outputFileTracingIncludes: {
    "/api/readings": ["./node_modules/kuromoji/dict/**/*"],
    "/api/room/aftermath": ["./public/illustrations/room-style-reference.jpeg"],
  },
};

export default nextConfig;
