-- Make SongRequest.normalizedArtist NOT NULL.
--
-- Why: Postgres treats NULLs as distinct in a unique index, so
-- @@unique([normalizedTitle, normalizedArtist]) did NOT prevent duplicate
-- requests when no artist was supplied — two submissions of the same
-- artist-less title would both insert. An empty string collides correctly.
--
-- NOTE: Prisma's auto-generated version of this migration also contained
-- DROP INDEX statements for the pg_trgm indexes created in the `search`
-- migration. Prisma cannot express `gin_trgm_ops` in schema.prisma, so it
-- believes those indexes are drift and proposes removing them. They have been
-- deliberately removed from this file. See docs/ARCHITECTURE.md ("Raw SQL
-- indexes") — `scripts/ensure-search-indexes.mjs` runs on every deploy and
-- recreates them if a future migration ever removes them.

-- Backfill before tightening the constraint.
UPDATE "song_requests" SET "normalizedArtist" = '' WHERE "normalizedArtist" IS NULL;

-- AlterTable
ALTER TABLE "song_requests" ALTER COLUMN "normalizedArtist" SET NOT NULL,
ALTER COLUMN "normalizedArtist" SET DEFAULT '';
