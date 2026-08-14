-- Finding provenance: where in the song a finding comes from.
--
-- Quoting used to be the only way a reader could check a finding, which made
-- every finding want a quote — and thirty-nine ten-word quotes reassemble the
-- song they were meant to be commenting on. Locating breaks that: a finding
-- names its spot, the reader opens their own copy, and the review spends its
-- small quotation budget only where the exact wording is the point.
--
-- Text rather than a DB enum on purpose. The vocabulary will grow (interludes,
-- vamps, a fifth verse) and Zod already validates it at the boundary, so a
-- migration per addition would buy nothing.
--
-- Written by hand and applied with `migrate deploy` rather than `migrate dev`:
-- Prisma's diff also proposes dropping the pg_trgm indexes it cannot express
-- in schema.prisma. See the note in 20260813140953_vocal_range.

-- AlterTable
ALTER TABLE "song_findings" ADD COLUMN     "songLocation" TEXT NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN     "locationDetail" TEXT;
