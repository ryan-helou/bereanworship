-- CreateEnum
CREATE TYPE "ArtistType" AS ENUM ('INDIVIDUAL', 'GROUP', 'MINISTRY', 'CHURCH', 'COLLECTIVE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "Recommendation" AS ENUM ('RECOMMENDED', 'RECOMMENDED_WITH_CAUTION', 'NOT_RECOMMENDED');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('UNREVIEWED', 'QUEUED', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'NEEDS_ATTENTION');

-- CreateEnum
CREATE TYPE "FindingType" AS ENUM ('STRENGTH', 'CONCERN');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('MINOR', 'MODERATE', 'MAJOR', 'SEVERE');

-- CreateEnum
CREATE TYPE "Centrality" AS ENUM ('CORE', 'IMPORTANT', 'PERIPHERAL');

-- CreateEnum
CREATE TYPE "ScoreComponent" AS ENUM ('THEOLOGICAL', 'COMMUNAL', 'CLARITY');

-- CreateEnum
CREATE TYPE "ArtistComponent" AS ENUM ('DOCTRINE', 'AFFILIATIONS', 'PUBLIC_TEACHING', 'MINISTRY_CONTEXT');

-- CreateEnum
CREATE TYPE "EvidenceGrade" AS ENUM ('DIRECT_STATEMENT', 'DOCUMENTED_FACT', 'CREDIBLE_REPORTING', 'ALLEGATION', 'INTERPRETATION', 'THEOLOGICAL_INFERENCE');

-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('OFFICIAL_WEBSITE', 'STATEMENT_OF_FAITH', 'INTERVIEW', 'SERMON', 'BOOK', 'PUBLICATION', 'ACADEMIC', 'THEOLOGICAL_ORGANIZATION', 'JOURNALISM', 'BLOG', 'SOCIAL_MEDIA', 'LYRICS_DATABASE', 'OTHER');

-- CreateEnum
CREATE TYPE "CredibilityTier" AS ENUM ('TIER_1', 'TIER_2', 'TIER_3', 'TIER_4');

-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('SONG_REVIEW', 'ARTIST_RESEARCH', 'ARTIST_REFRESH');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'RESEARCHING', 'ANALYZING', 'SCORING', 'COMPLETED', 'FAILED', 'NEEDS_REVIEW', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('PENDING', 'QUEUED', 'COMPLETED', 'ALREADY_REVIEWED', 'DUPLICATE', 'REJECTED');

-- CreateTable
CREATE TABLE "artists" (
    "id" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "canonicalName" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "type" "ArtistType" NOT NULL DEFAULT 'UNKNOWN',
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "country" TEXT,
    "foundedYear" INTEGER,
    "websiteUrl" TEXT,
    "bio" TEXT,
    "overallScore" INTEGER,
    "doctrineScore" INTEGER,
    "affiliationScore" INTEGER,
    "publicTeachingScore" INTEGER,
    "ministryContextScore" INTEGER,
    "recommendation" "Recommendation",
    "summary" TEXT,
    "evidenceCaveat" TEXT,
    "reviewStatus" "ReviewStatus" NOT NULL DEFAULT 'UNREVIEWED',
    "reviewVersion" TEXT,
    "scoringVersion" TEXT,
    "methodologyVersion" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "lastReviewedAt" TIMESTAMP(3),
    "reviewError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "artists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "artist_findings" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "type" "FindingType" NOT NULL,
    "component" "ArtistComponent" NOT NULL,
    "severity" "Severity" NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "evidence" TEXT,
    "evidenceGrade" "EvidenceGrade" NOT NULL DEFAULT 'INTERPRETATION',
    "contested" BOOLEAN NOT NULL DEFAULT false,
    "scoreImpact" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sourceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "artist_findings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "songs" (
    "id" TEXT NOT NULL,
    "displayTitle" TEXT NOT NULL,
    "canonicalTitle" TEXT NOT NULL,
    "normalizedTitle" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "album" TEXT,
    "releaseYear" INTEGER,
    "genre" TEXT,
    "ccliNumber" TEXT,
    "overallScore" INTEGER,
    "theologicalScore" INTEGER,
    "communalScore" INTEGER,
    "clarityScore" INTEGER,
    "recommendation" "Recommendation",
    "summary" TEXT,
    "reviewStatus" "ReviewStatus" NOT NULL DEFAULT 'UNREVIEWED',
    "reviewVersion" TEXT,
    "scoringVersion" TEXT,
    "methodologyVersion" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "lastReviewedAt" TIMESTAMP(3),
    "reviewError" TEXT,
    "needsAttention" BOOLEAN NOT NULL DEFAULT false,
    "attentionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "songs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "song_findings" (
    "id" TEXT NOT NULL,
    "songId" TEXT NOT NULL,
    "type" "FindingType" NOT NULL,
    "component" "ScoreComponent" NOT NULL,
    "severity" "Severity" NOT NULL,
    "centrality" "Centrality" NOT NULL DEFAULT 'IMPORTANT',
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "lyricExcerpt" TEXT,
    "scriptureReference" TEXT,
    "scriptureExcerpt" TEXT,
    "scriptureRationale" TEXT,
    "recurring" BOOLEAN NOT NULL DEFAULT false,
    "scoreImpact" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "song_findings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "song_scriptures" (
    "id" TEXT NOT NULL,
    "songId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "excerpt" TEXT,
    "relevance" TEXT NOT NULL,
    "ordering" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "song_scriptures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "themes" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "ordering" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "themes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "song_themes" (
    "songId" TEXT NOT NULL,
    "themeId" TEXT NOT NULL,

    CONSTRAINT "song_themes_pkey" PRIMARY KEY ("songId","themeId")
);

-- CreateTable
CREATE TABLE "sources" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "publisher" TEXT,
    "author" TEXT,
    "publicationDate" TIMESTAMP(3),
    "accessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceType" "SourceType" NOT NULL DEFAULT 'OTHER',
    "credibilityTier" "CredibilityTier" NOT NULL DEFAULT 'TIER_3',
    "summary" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "song_sources" (
    "songId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "relevance" TEXT,

    CONSTRAINT "song_sources_pkey" PRIMARY KEY ("songId","sourceId")
);

-- CreateTable
CREATE TABLE "artist_sources" (
    "artistId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "relevance" TEXT,

    CONSTRAINT "artist_sources_pkey" PRIMARY KEY ("artistId","sourceId")
);

-- CreateTable
CREATE TABLE "review_jobs" (
    "id" TEXT NOT NULL,
    "type" "JobType" NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "songId" TEXT,
    "artistId" TEXT,
    "payload" JSONB,
    "batchId" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "lastError" TEXT,
    "stageLog" JSONB,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "runAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "review_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_batches" (
    "id" TEXT NOT NULL,
    "label" TEXT,
    "submittedCount" INTEGER NOT NULL DEFAULT 0,
    "duplicateCount" INTEGER NOT NULL DEFAULT 0,
    "existingCount" INTEGER NOT NULL DEFAULT 0,
    "queuedCount" INTEGER NOT NULL DEFAULT 0,
    "invalidCount" INTEGER NOT NULL DEFAULT 0,
    "report" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "song_requests" (
    "id" TEXT NOT NULL,
    "rawTitle" TEXT NOT NULL,
    "rawArtist" TEXT,
    "notes" TEXT,
    "normalizedTitle" TEXT NOT NULL,
    "normalizedArtist" TEXT,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "songId" TEXT,
    "requestCount" INTEGER NOT NULL DEFAULT 1,
    "submitterHash" TEXT,
    "resolutionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "song_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_history" (
    "id" TEXT NOT NULL,
    "songId" TEXT,
    "artistId" TEXT,
    "reviewVersion" TEXT NOT NULL,
    "scoringVersion" TEXT NOT NULL,
    "methodologyVersion" TEXT NOT NULL,
    "overallScore" INTEGER,
    "snapshot" JSONB NOT NULL,
    "changeNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_audit_log" (
    "id" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "target" TEXT,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limit_buckets" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rate_limit_buckets_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "artists_normalizedName_key" ON "artists"("normalizedName");

-- CreateIndex
CREATE UNIQUE INDEX "artists_slug_key" ON "artists"("slug");

-- CreateIndex
CREATE INDEX "artists_normalizedName_idx" ON "artists"("normalizedName");

-- CreateIndex
CREATE INDEX "artists_overallScore_idx" ON "artists"("overallScore");

-- CreateIndex
CREATE INDEX "artists_reviewStatus_idx" ON "artists"("reviewStatus");

-- CreateIndex
CREATE INDEX "artists_reviewedAt_idx" ON "artists"("reviewedAt");

-- CreateIndex
CREATE INDEX "artists_createdAt_idx" ON "artists"("createdAt");

-- CreateIndex
CREATE INDEX "artists_slug_idx" ON "artists"("slug");

-- CreateIndex
CREATE INDEX "artist_findings_artistId_idx" ON "artist_findings"("artistId");

-- CreateIndex
CREATE INDEX "artist_findings_artistId_type_idx" ON "artist_findings"("artistId", "type");

-- CreateIndex
CREATE INDEX "artist_findings_component_idx" ON "artist_findings"("component");

-- CreateIndex
CREATE INDEX "artist_findings_severity_idx" ON "artist_findings"("severity");

-- CreateIndex
CREATE UNIQUE INDEX "songs_slug_key" ON "songs"("slug");

-- CreateIndex
CREATE INDEX "songs_normalizedTitle_idx" ON "songs"("normalizedTitle");

-- CreateIndex
CREATE INDEX "songs_artistId_idx" ON "songs"("artistId");

-- CreateIndex
CREATE INDEX "songs_overallScore_idx" ON "songs"("overallScore");

-- CreateIndex
CREATE INDEX "songs_theologicalScore_idx" ON "songs"("theologicalScore");

-- CreateIndex
CREATE INDEX "songs_communalScore_idx" ON "songs"("communalScore");

-- CreateIndex
CREATE INDEX "songs_clarityScore_idx" ON "songs"("clarityScore");

-- CreateIndex
CREATE INDEX "songs_reviewStatus_idx" ON "songs"("reviewStatus");

-- CreateIndex
CREATE INDEX "songs_recommendation_idx" ON "songs"("recommendation");

-- CreateIndex
CREATE INDEX "songs_reviewedAt_idx" ON "songs"("reviewedAt");

-- CreateIndex
CREATE INDEX "songs_createdAt_idx" ON "songs"("createdAt");

-- CreateIndex
CREATE INDEX "songs_displayTitle_idx" ON "songs"("displayTitle");

-- CreateIndex
CREATE UNIQUE INDEX "songs_artistId_normalizedTitle_key" ON "songs"("artistId", "normalizedTitle");

-- CreateIndex
CREATE INDEX "song_findings_songId_idx" ON "song_findings"("songId");

-- CreateIndex
CREATE INDEX "song_findings_songId_type_idx" ON "song_findings"("songId", "type");

-- CreateIndex
CREATE INDEX "song_findings_component_idx" ON "song_findings"("component");

-- CreateIndex
CREATE INDEX "song_findings_severity_idx" ON "song_findings"("severity");

-- CreateIndex
CREATE INDEX "song_findings_category_idx" ON "song_findings"("category");

-- CreateIndex
CREATE INDEX "song_scriptures_songId_idx" ON "song_scriptures"("songId");

-- CreateIndex
CREATE UNIQUE INDEX "song_scriptures_songId_reference_key" ON "song_scriptures"("songId", "reference");

-- CreateIndex
CREATE UNIQUE INDEX "themes_name_key" ON "themes"("name");

-- CreateIndex
CREATE UNIQUE INDEX "themes_slug_key" ON "themes"("slug");

-- CreateIndex
CREATE INDEX "themes_slug_idx" ON "themes"("slug");

-- CreateIndex
CREATE INDEX "song_themes_themeId_idx" ON "song_themes"("themeId");

-- CreateIndex
CREATE UNIQUE INDEX "sources_url_key" ON "sources"("url");

-- CreateIndex
CREATE INDEX "sources_credibilityTier_idx" ON "sources"("credibilityTier");

-- CreateIndex
CREATE INDEX "sources_sourceType_idx" ON "sources"("sourceType");

-- CreateIndex
CREATE INDEX "sources_publisher_idx" ON "sources"("publisher");

-- CreateIndex
CREATE INDEX "song_sources_sourceId_idx" ON "song_sources"("sourceId");

-- CreateIndex
CREATE INDEX "artist_sources_sourceId_idx" ON "artist_sources"("sourceId");

-- CreateIndex
CREATE INDEX "review_jobs_status_runAfter_idx" ON "review_jobs"("status", "runAfter");

-- CreateIndex
CREATE INDEX "review_jobs_status_idx" ON "review_jobs"("status");

-- CreateIndex
CREATE INDEX "review_jobs_type_idx" ON "review_jobs"("type");

-- CreateIndex
CREATE INDEX "review_jobs_batchId_idx" ON "review_jobs"("batchId");

-- CreateIndex
CREATE INDEX "review_jobs_songId_idx" ON "review_jobs"("songId");

-- CreateIndex
CREATE INDEX "review_jobs_artistId_idx" ON "review_jobs"("artistId");

-- CreateIndex
CREATE INDEX "review_jobs_createdAt_idx" ON "review_jobs"("createdAt");

-- CreateIndex
CREATE INDEX "import_batches_createdAt_idx" ON "import_batches"("createdAt");

-- CreateIndex
CREATE INDEX "song_requests_status_idx" ON "song_requests"("status");

-- CreateIndex
CREATE INDEX "song_requests_createdAt_idx" ON "song_requests"("createdAt");

-- CreateIndex
CREATE INDEX "song_requests_songId_idx" ON "song_requests"("songId");

-- CreateIndex
CREATE UNIQUE INDEX "song_requests_normalizedTitle_normalizedArtist_key" ON "song_requests"("normalizedTitle", "normalizedArtist");

-- CreateIndex
CREATE INDEX "review_history_songId_idx" ON "review_history"("songId");

-- CreateIndex
CREATE INDEX "review_history_artistId_idx" ON "review_history"("artistId");

-- CreateIndex
CREATE INDEX "review_history_createdAt_idx" ON "review_history"("createdAt");

-- CreateIndex
CREATE INDEX "admin_audit_log_createdAt_idx" ON "admin_audit_log"("createdAt");

-- CreateIndex
CREATE INDEX "admin_audit_log_action_idx" ON "admin_audit_log"("action");

-- CreateIndex
CREATE INDEX "rate_limit_buckets_expiresAt_idx" ON "rate_limit_buckets"("expiresAt");

-- AddForeignKey
ALTER TABLE "artist_findings" ADD CONSTRAINT "artist_findings_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "artists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artist_findings" ADD CONSTRAINT "artist_findings_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "songs" ADD CONSTRAINT "songs_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "artists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "song_findings" ADD CONSTRAINT "song_findings_songId_fkey" FOREIGN KEY ("songId") REFERENCES "songs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "song_scriptures" ADD CONSTRAINT "song_scriptures_songId_fkey" FOREIGN KEY ("songId") REFERENCES "songs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "song_themes" ADD CONSTRAINT "song_themes_songId_fkey" FOREIGN KEY ("songId") REFERENCES "songs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "song_themes" ADD CONSTRAINT "song_themes_themeId_fkey" FOREIGN KEY ("themeId") REFERENCES "themes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "song_sources" ADD CONSTRAINT "song_sources_songId_fkey" FOREIGN KEY ("songId") REFERENCES "songs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "song_sources" ADD CONSTRAINT "song_sources_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artist_sources" ADD CONSTRAINT "artist_sources_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "artists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artist_sources" ADD CONSTRAINT "artist_sources_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_jobs" ADD CONSTRAINT "review_jobs_songId_fkey" FOREIGN KEY ("songId") REFERENCES "songs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_jobs" ADD CONSTRAINT "review_jobs_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "artists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "song_requests" ADD CONSTRAINT "song_requests_songId_fkey" FOREIGN KEY ("songId") REFERENCES "songs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_history" ADD CONSTRAINT "review_history_songId_fkey" FOREIGN KEY ("songId") REFERENCES "songs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_history" ADD CONSTRAINT "review_history_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "artists"("id") ON DELETE CASCADE ON UPDATE CASCADE;
