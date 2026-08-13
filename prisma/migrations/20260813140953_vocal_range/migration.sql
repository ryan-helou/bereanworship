-- Vocal range: measured pitches plus a congregational difficulty score.
--
-- Deliberately NOT part of overallScore. Range is a property of the key an
-- arrangement is published in, not of the song — transpose down a tone and the
-- same song becomes singable — so folding it into a permanent verdict would be
-- a category error. It is reported alongside song validity instead.
--
-- NOTE: Prisma's generated version of this migration also proposed dropping the
-- pg_trgm indexes from the `search` migration, because it cannot express
-- gin_trgm_ops in schema.prisma and therefore reads them as drift. Those DROP
-- statements have been deliberately removed. See docs/ARCHITECTURE.md ("Raw SQL
-- indexes"); scripts/ensure-search-indexes.mjs also restores them on deploy.

-- AlterTable
ALTER TABLE "songs" ADD COLUMN     "rangeHighest" TEXT,
ADD COLUMN     "rangeKey" TEXT,
ADD COLUMN     "rangeLowest" TEXT,
ADD COLUMN     "rangeNote" TEXT,
ADD COLUMN     "rangeScore" INTEGER,
ADD COLUMN     "rangeSource" TEXT,
ADD COLUMN     "rangeTessituraHigh" TEXT,
ADD COLUMN     "rangeTessituraLow" TEXT;

-- CreateIndex
CREATE INDEX "songs_rangeScore_idx" ON "songs"("rangeScore");
