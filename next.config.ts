import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Emit a self-contained server bundle (.next/standalone) so the Docker
  // runtime stage can run with a minimal footprint and no dev dependencies.
  output: "standalone",
};

export default nextConfig;
