import type { NextConfig } from 'next';

const config: NextConfig = {
  experimental: { turbopackFileSystemCacheForBuild: false },
  poweredByHeader: false,
  output: "standalone",
  deploymentId: process.env.RESPONSEABLE_DEPLOYMENT_ID,
  serverExternalPackages: ["pg"],
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'Referrer-Policy', value: 'no-referrer' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Cache-Control', value: 'private, no-store' },
      ],
    }];
  },
};

export default config;
