-- Two axes instead of one.
--
-- The rubric that shipped in 2.0.0 answered "how wrong is this?" and "how much
-- is here?" with a single number, and the catalogue showed the cost: across
-- thirteen reviews, Communal used 2 of its 11 levels and every worst-concern
-- was Minor or Moderate. Merit was really counting how many strengths a
-- reviewer wrote, which is a fact about the reviewer.
--
-- `subst*` replaces that count with seven fixed yes/no tests about content.
-- Stored individually rather than totalled so a page can say what is missing
-- rather than only how much.
--
-- `likelihood` is Kauflin's test: would an ordinary singer take the wrong
-- meaning, or does that reading need straining against the rest of the song?
-- The two should not cost a song the same amount.
--
-- Both are nullable / defaulted, so reviews published under 2.0.0 keep loading
-- until they are re-filed.

-- AlterTable
ALTER TABLE "song_findings" ADD COLUMN     "likelihood" TEXT NOT NULL DEFAULT 'POSSIBLE';

-- AlterTable
ALTER TABLE "songs" ADD COLUMN     "substBeyondTheSelf" BOOLEAN,
ADD COLUMN     "substEngagesScripture" BOOLEAN,
ADD COLUMN     "substGroundsClaims" BOOLEAN,
ADD COLUMN     "substNamesGod" BOOLEAN,
ADD COLUMN     "substSaysSomethingNew" BOOLEAN,
ADD COLUMN     "substStatesAnAct" BOOLEAN,
ADD COLUMN     "substTeachesDoctrine" BOOLEAN;
