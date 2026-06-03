import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    PORT: '3001',
  },
  experimental: {
    workerThreads: false,
    cpus: 1,
  },
};

export default nextConfig;
