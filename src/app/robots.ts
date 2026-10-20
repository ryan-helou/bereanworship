import type { MetadataRoute } from 'next';
import { env } from '@/lib/env';

// Read per request: the gate can be switched on or off without a rebuild.
export const dynamic = 'force-dynamic';

export default function robots(): MetadataRoute.Robots {
  const gated = env.siteGateEnabled;
  return {
    rules: [
      {
        userAgent: '*',
        allow: gated ? undefined : '/',
        // The admin area and internal APIs are never crawlable. Access control
        // is enforced server-side; this only keeps them out of indexes.
        disallow: gated ? ['/', '/admin', '/admin/', '/api/'] : ['/admin', '/admin/', '/api/'],
      },
    ],
    // With the gate on the sitemap is behind the password, so advertising it helps no one.
    sitemap: gated ? undefined : `${env.siteUrl}/sitemap.xml`,
    host: env.siteUrl,
  };
}
