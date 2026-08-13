-- Search infrastructure.
--
-- Two complementary mechanisms:
--   1. tsvector + GIN  → ranked full-text matching on whole words.
--   2. pg_trgm + GIN   → prefix, substring and typo-tolerant matching, which
--                        is what makes "amazing" find "Amazing Grace" and
--                        "tomlin" find "Chris Tomlin".
--
-- The tsvector columns are populated by triggers rather than generated
-- columns: the artist vector needs to fold in the `aliases` array, and array
-- functions are not immutable enough for a GENERATED ALWAYS expression.

-- Trusted extensions: creatable by the database owner, no superuser required.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- AlterTable
ALTER TABLE "artists" ADD COLUMN     "searchVector" tsvector;

-- AlterTable
ALTER TABLE "songs" ADD COLUMN     "searchVector" tsvector;

-- CreateIndex
CREATE INDEX "artists_searchVector_idx" ON "artists" USING GIN ("searchVector");

-- CreateIndex
CREATE INDEX "songs_searchVector_idx" ON "songs" USING GIN ("searchVector");

-- ---------------------------------------------------------------------------
-- Song search vector
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION bw_songs_search_vector() RETURNS trigger AS $$
BEGIN
  NEW."searchVector" :=
      setweight(to_tsvector('english', coalesce(NEW."displayTitle", '')), 'A')
   || setweight(to_tsvector('simple',  coalesce(NEW."normalizedTitle", '')), 'A')
   || setweight(to_tsvector('english', coalesce(NEW."album", '')), 'C')
   || setweight(to_tsvector('simple',  coalesce(NEW."genre", '')), 'D');
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER songs_search_vector_trigger
BEFORE INSERT OR UPDATE OF "displayTitle", "normalizedTitle", "album", "genre"
ON "songs"
FOR EACH ROW EXECUTE FUNCTION bw_songs_search_vector();

-- ---------------------------------------------------------------------------
-- Artist search vector
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION bw_artists_search_vector() RETURNS trigger AS $$
BEGIN
  NEW."searchVector" :=
      setweight(to_tsvector('english', coalesce(NEW."displayName", '')), 'A')
   || setweight(to_tsvector('simple',  coalesce(NEW."normalizedName", '')), 'A')
   || setweight(to_tsvector('english', coalesce(NEW."canonicalName", '')), 'B')
   || setweight(to_tsvector('simple',  coalesce(array_to_string(NEW."aliases", ' '), '')), 'B');
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER artists_search_vector_trigger
BEFORE INSERT OR UPDATE OF "displayName", "normalizedName", "canonicalName", "aliases"
ON "artists"
FOR EACH ROW EXECUTE FUNCTION bw_artists_search_vector();

-- ---------------------------------------------------------------------------
-- Trigram indexes: partial-word and fuzzy matching
-- ---------------------------------------------------------------------------
CREATE INDEX "songs_displayTitle_trgm_idx"    ON "songs"   USING GIN ("displayTitle" gin_trgm_ops);
CREATE INDEX "songs_normalizedTitle_trgm_idx" ON "songs"   USING GIN ("normalizedTitle" gin_trgm_ops);
CREATE INDEX "songs_album_trgm_idx"           ON "songs"   USING GIN ("album" gin_trgm_ops);
CREATE INDEX "artists_displayName_trgm_idx"   ON "artists" USING GIN ("displayName" gin_trgm_ops);
CREATE INDEX "artists_normalizedName_trgm_idx" ON "artists" USING GIN ("normalizedName" gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- Backfill any rows that pre-date the triggers
-- ---------------------------------------------------------------------------
UPDATE "songs"   SET "displayTitle" = "displayTitle";
UPDATE "artists" SET "displayName"  = "displayName";
