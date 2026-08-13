import type { MetadataRoute } from 'next';
import { prisma } from '@/lib/db';
import { env } from '@/lib/env';

/**
 * Sitemap.
 *
 * Only completed reviews are listed — an unreviewed stub has nothing to index
 * and would only dilute the site's crawl budget.
 */

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = env.siteUrl;

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: base, lastModified: new Date(), changeFrequency: 'daily', priority: 1 },
    { url: `${base}/songs`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.9 },
    { url: `${base}/artists`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.8 },
    { url: `${base}/methodology`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.7 },
    { url: `${base}/request`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
  ];

  try {
    const [songs, artists] = await Promise.all([
      prisma.song.findMany({
        where: { reviewStatus: 'COMPLETED' },
        select: { slug: true, reviewedAt: true, updatedAt: true },
        orderBy: { reviewedAt: 'desc' },
        take: 20_000,
      }),
      prisma.artist.findMany({
        where: { reviewStatus: 'COMPLETED' },
        select: { slug: true, reviewedAt: true, updatedAt: true },
        orderBy: { reviewedAt: 'desc' },
        take: 20_000,
      }),
    ]);

    return [
      ...staticRoutes,
      ...songs.map((song) => ({
        url: `${base}/songs/${song.slug}`,
        lastModified: song.reviewedAt ?? song.updatedAt,
        changeFrequency: 'monthly' as const,
        priority: 0.8,
      })),
      ...artists.map((artist) => ({
        url: `${base}/artists/${artist.slug}`,
        lastModified: artist.reviewedAt ?? artist.updatedAt,
        changeFrequency: 'monthly' as const,
        priority: 0.6,
      })),
    ];
  } catch {
    // A database blip should still yield a valid sitemap of the static pages.
    return staticRoutes;
  }
}
