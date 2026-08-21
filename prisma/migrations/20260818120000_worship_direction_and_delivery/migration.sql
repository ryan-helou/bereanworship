-- Weight what worship actually is.
--
-- Feedback from a reader, and all three points were structurally true rather
-- than matters of taste:
--
--   1. `performanceOrientation` was captured on every review and never reached
--      the score at all. A song built around a lead voice and a big climax
--      scored the same as one written for a room.
--   2. Repetition was a paragraph of free text, so eight minutes carried by one
--      repeated line cost a song nothing.
--   3. Corporate voice was filed as a MINOR/PERIPHERAL concern every single
--      time — ten out of ten across the catalogue — which is the weakest grade
--      the model has. Worship is directed to God and sung by a congregation;
--      that was being treated as a footnote.
--
-- So `beyondTheSelf` and `saysSomethingNew` (1 point each, the two vaguest
-- tests) give way to `godDirected` (2) and `corporateVoice` (1), and
-- `repetition` becomes a graded field that moves the communal level.

-- AlterTable
ALTER TABLE "songs" DROP COLUMN "substBeyondTheSelf",
DROP COLUMN "substSaysSomethingNew",
ADD COLUMN     "substGodDirected" BOOLEAN,
ADD COLUMN     "substCorporateVoice" BOOLEAN,
ADD COLUMN     "repetition" TEXT;

-- performanceOrientation was collected by the schema on every review and never
-- given a column, so it could not have reached the score even in principle.
ALTER TABLE "songs" ADD COLUMN "performanceOrientation" TEXT;
