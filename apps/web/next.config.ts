import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Type checking runs once for every workspace in `bun run check`.
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
