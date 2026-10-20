-- Private notes: the owner's own writing, sorted into three buckets. Never an
-- input to any score. A note outlives the song it is about (ON DELETE SET NULL).

-- CreateEnum
CREATE TYPE "NoteBucket" AS ENUM ('APPROVED', 'MAYBE', 'REJECTED');

-- CreateTable
CREATE TABLE "notes" (
    "id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "bucket" "NoteBucket" NOT NULL,
    "subject" TEXT,
    "songId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notes_bucket_createdAt_idx" ON "notes"("bucket", "createdAt");

-- CreateIndex
CREATE INDEX "notes_songId_idx" ON "notes"("songId");

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_songId_fkey" FOREIGN KEY ("songId") REFERENCES "songs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
