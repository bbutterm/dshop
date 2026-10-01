import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  async rewrites() {
    // презентация для инвесторов — статичный HTML в public/pitch
    return [{ source: "/pitch", destination: "/pitch/index.html" }];
  },
};

export default nextConfig;
