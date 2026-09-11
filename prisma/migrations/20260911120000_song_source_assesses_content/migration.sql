-- A song's source says whether it examined what the song teaches. Only such a
-- source can vouch for a clean theological record: a biography establishes who
-- wrote a song, not whether it is sound.
ALTER TABLE "song_sources" ADD COLUMN "assessesContent" BOOLEAN NOT NULL DEFAULT false;
