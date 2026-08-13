#!/usr/bin/env node
/**
 * Recreates the raw-SQL search infrastructure if it is ever missing.
 *
 * Why this exists: the pg_trgm indexes and the tsvector triggers are created
 * in the `search` migration with hand-written SQL, because Prisma's schema
 * language cannot express `gin_trgm_ops` operator classes or trigger
 * functions. As a consequence, `prisma migrate dev` sees them as drift and
 * will happily propose DROP INDEX statements in *any* future migration.
 *
 * Rather than rely on catching that in review every single time, this script
 * runs on every deploy and restores anything that has gone missing. It is
 * fully idempotent — on a healthy database it does nothing.
 *
 * Run with: node scripts/ensure-search-indexes.mjs
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const STATEMENTS = [
  `CREATE EXTENSION IF NOT EXISTS pg_trgm`,
  `CREATE EXTENSION IF NOT EXISTS unaccent`,

  `CREATE OR REPLACE FUNCTION bw_songs_search_vector() RETURNS trigger AS $$
   BEGIN
     NEW."searchVector" :=
         setweight(to_tsvector('english', coalesce(NEW."displayTitle", '')), 'A')
      || setweight(to_tsvector('simple',  coalesce(NEW."normalizedTitle", '')), 'A')
      || setweight(to_tsvector('english', coalesce(NEW."album", '')), 'C')
      || setweight(to_tsvector('simple',  coalesce(NEW."genre", '')), 'D');
     RETURN NEW;
   END
   $$ LANGUAGE plpgsql`,

  `CREATE OR REPLACE FUNCTION bw_artists_search_vector() RETURNS trigger AS $$
   BEGIN
     NEW."searchVector" :=
         setweight(to_tsvector('english', coalesce(NEW."displayName", '')), 'A')
      || setweight(to_tsvector('simple',  coalesce(NEW."normalizedName", '')), 'A')
      || setweight(to_tsvector('english', coalesce(NEW."canonicalName", '')), 'B')
      || setweight(to_tsvector('simple',  coalesce(array_to_string(NEW."aliases", ' '), '')), 'B');
     RETURN NEW;
   END
   $$ LANGUAGE plpgsql`,

  `DROP TRIGGER IF EXISTS songs_search_vector_trigger ON "songs"`,
  `CREATE TRIGGER songs_search_vector_trigger
     BEFORE INSERT OR UPDATE OF "displayTitle", "normalizedTitle", "album", "genre"
     ON "songs" FOR EACH ROW EXECUTE FUNCTION bw_songs_search_vector()`,

  `DROP TRIGGER IF EXISTS artists_search_vector_trigger ON "artists"`,
  `CREATE TRIGGER artists_search_vector_trigger
     BEFORE INSERT OR UPDATE OF "displayName", "normalizedName", "canonicalName", "aliases"
     ON "artists" FOR EACH ROW EXECUTE FUNCTION bw_artists_search_vector()`,

  `CREATE INDEX IF NOT EXISTS "songs_displayTitle_trgm_idx"     ON "songs"   USING GIN ("displayTitle" gin_trgm_ops)`,
  `CREATE INDEX IF NOT EXISTS "songs_normalizedTitle_trgm_idx"  ON "songs"   USING GIN ("normalizedTitle" gin_trgm_ops)`,
  `CREATE INDEX IF NOT EXISTS "songs_album_trgm_idx"            ON "songs"   USING GIN ("album" gin_trgm_ops)`,
  `CREATE INDEX IF NOT EXISTS "artists_displayName_trgm_idx"    ON "artists" USING GIN ("displayName" gin_trgm_ops)`,
  `CREATE INDEX IF NOT EXISTS "artists_normalizedName_trgm_idx" ON "artists" USING GIN ("normalizedName" gin_trgm_ops)`,
  `CREATE INDEX IF NOT EXISTS "songs_searchVector_idx"          ON "songs"   USING GIN ("searchVector")`,
  `CREATE INDEX IF NOT EXISTS "artists_searchVector_idx"        ON "artists" USING GIN ("searchVector")`,

  // Repopulate any vectors left NULL by rows written while a trigger was absent.
  `UPDATE "songs"   SET "displayTitle" = "displayTitle" WHERE "searchVector" IS NULL`,
  `UPDATE "artists" SET "displayName"  = "displayName"  WHERE "searchVector" IS NULL`,
];

async function main() {
  console.log('Ensuring search indexes, triggers and extensions…');

  for (const statement of STATEMENTS) {
    try {
      await prisma.$executeRawUnsafe(statement);
    } catch (error) {
      // A single failing statement should not abort a deploy: the site is
      // still fully functional with degraded search ranking.
      console.error(`  ! failed: ${statement.slice(0, 70).replace(/\s+/g, ' ')}…`);
      console.error(`    ${error.message?.split('\n')[0]}`);
    }
  }

  const [{ count: indexCount }] = await prisma.$queryRawUnsafe(
    `SELECT count(*)::int AS count FROM pg_indexes WHERE indexname LIKE '%trgm%' OR indexname LIKE '%searchVector%'`,
  );
  const [{ count: triggerCount }] = await prisma.$queryRawUnsafe(
    `SELECT count(*)::int AS count FROM pg_trigger WHERE tgname LIKE '%search_vector%'`,
  );

  console.log(`  ${indexCount} search indexes, ${triggerCount} triggers in place.`);

  if (indexCount < 7 || triggerCount < 2) {
    console.warn('  ! Search infrastructure is incomplete. Search will still work but ranking may be degraded.');
  }
}

main()
  .catch((error) => {
    console.error('ensure-search-indexes failed:', error);
    // Never fail the deploy over this.
    process.exit(0);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
