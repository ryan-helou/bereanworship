import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // A stray lockfile in $HOME makes Next infer the wrong workspace root.
  outputFileTracingRoot: __dirname,
  // Keep the server bundle honest: the Prisma client is a server-only dependency.
  serverExternalPackages: ['@prisma/client', '@anthropic-ai/sdk'],
  experimental: {
    optimizePackageImports: ['clsx', 'tailwind-merge'],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
          },
        ],
      },
      {
        // The admin area must never be cached by intermediaries.
        source: '/admin/:path*',
        headers: [{ key: 'Cache-Control', value: 'private, no-store, max-age=0' }],
      },
    ];
  },
};

export default nextConfig;
