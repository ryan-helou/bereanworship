#!/usr/bin/env node
/**
 * Seeds the theme vocabulary — reference data the review pipeline depends on,
 * so it must exist in production, unlike the development sample dataset.
 * Idempotent: safe to run on every deploy.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const THEMES = [
  'God', 'Trinity', 'Christ', 'Cross', 'Resurrection', 'Grace', 'Salvation', 'Sin',
  'Repentance', 'Faith', 'Holiness', 'Worship', 'Prayer', 'Suffering', 'Hope', 'Heaven',
  'Mission', 'Church', 'Thanksgiving', 'Creation', 'Scripture', 'Sovereignty',
  'Providence', 'Assurance', 'Lament', 'Advent', 'Communion', 'Baptism',
];

const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

async function main() {
  for (const [index, name] of THEMES.entries()) {
    await prisma.theme.upsert({
      where: { name },
      create: { name, slug: slugify(name), ordering: index },
      update: { ordering: index },
    });
  }
  console.log(`Themes ready (${THEMES.length}).`);
}

main()
  .catch((e) => { console.error('seed-themes failed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
