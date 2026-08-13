#!/usr/bin/env node
/**
 * Empties the catalogue.
 *
 *   node scripts/purge-data.mjs --sample-only   remove seeded sample records
 *   node scripts/purge-data.mjs --all           remove every song and artist
 *
 * Themes are reference data the review pipeline depends on, so they are never
 * touched. Cascading deletes take findings, scripture, themes links, sources
 * links and review history with their parent rows.
 *
 * Deliberately requires an explicit flag: there is no default mode, so a
 * mistyped invocation deletes nothing.
 */
import { PrismaClient } from '@prisma/client';

process.loadEnvFile?.();

const prisma = new PrismaClient();
const mode = process.argv.includes('--all')
  ? 'all'
  : process.argv.includes('--sample-only')
    ? 'sample'
    : null;

if (!mode) {
  console.error('Usage: node scripts/purge-data.mjs (--all | --sample-only)');
  process.exit(1);
}

async function main() {
  const target = process.env.DATABASE_URL?.match(/\/([^/?]+)(\?|$)/)?.[1] ?? 'unknown';
  console.log(`Purging (${mode}) from database "${target}"…`);

  const before = {
    songs: await prisma.song.count(),
    artists: await prisma.artist.count(),
    sources: await prisma.source.count(),
    jobs: await prisma.reviewJob.count(),
    requests: await prisma.songRequest.count(),
  };

  if (mode === 'all') {
    // Order matters only for rows without a cascade path back to a parent.
    await prisma.reviewJob.deleteMany({});
    await prisma.songRequest.deleteMany({});
    await prisma.importBatch.deleteMany({});
    await prisma.reviewHistory.deleteMany({});
    await prisma.song.deleteMany({});
    await prisma.artist.deleteMany({});
    await prisma.source.deleteMany({});
    await prisma.adminAuditLog.deleteMany({});
    await prisma.rateLimitBucket.deleteMany({});
  } else {
    // Seeded records are identifiable by their review version.
    const songs = await prisma.song.findMany({
      where: { reviewVersion: { startsWith: 'sample' } },
      select: { id: true, artistId: true },
    });
    const artists = await prisma.artist.findMany({
      where: { reviewVersion: { startsWith: 'sample' } },
      select: { id: true },
    });

    const songIds = songs.map((s) => s.id);
    const artistIds = artists.map((a) => a.id);

    await prisma.reviewJob.deleteMany({
      where: { OR: [{ songId: { in: songIds } }, { artistId: { in: artistIds } }] },
    });
    await prisma.songRequest.deleteMany({ where: { songId: { in: songIds } } });
    await prisma.song.deleteMany({ where: { id: { in: songIds } } });
    // Only remove a seeded artist once nothing else depends on them.
    for (const id of artistIds) {
      const remaining = await prisma.song.count({ where: { artistId: id } });
      if (remaining === 0) await prisma.artist.delete({ where: { id } }).catch(() => undefined);
    }
  }

  const after = {
    songs: await prisma.song.count(),
    artists: await prisma.artist.count(),
    sources: await prisma.source.count(),
    jobs: await prisma.reviewJob.count(),
    requests: await prisma.songRequest.count(),
    themes: await prisma.theme.count(),
  };

  console.log('  songs    ', before.songs, '→', after.songs);
  console.log('  artists  ', before.artists, '→', after.artists);
  console.log('  sources  ', before.sources, '→', after.sources);
  console.log('  jobs     ', before.jobs, '→', after.jobs);
  console.log('  requests ', before.requests, '→', after.requests);
  console.log('  themes   ', after.themes, '(reference data, untouched)');
}

main()
  .catch((error) => {
    console.error('purge failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
