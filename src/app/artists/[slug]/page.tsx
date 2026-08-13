import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { env, SITE_NAME } from '@/lib/env';
import { formatDate, hostname, humanize } from '@/lib/utils';
import { ARTIST_WEIGHTS } from '@/lib/scoring';
import { RecommendationCallout, ScoreBar, ScoreDial } from '@/components/score';
import { ArtistFindingItem, FindingGroup } from '@/components/findings';
import { SongRow } from '@/components/cards';
import { Badge, DataRow, Panel, SampleDataNotice, isSample } from '@/components/ui';
import { searchSongs } from '@/lib/search';

/**
 * Artist detail.
 *
 * Every claim here carries its evidence grade on its face, and anything
 * contested says so. The independence of this score from song scores is
 * stated at the top rather than buried in the methodology page.
 */

export const revalidate = 3600;

type Params = Promise<{ slug: string }>;

async function getArtist(slug: string) {
  return prisma.artist.findUnique({
    where: { slug },
    include: {
      findings: { orderBy: [{ type: 'asc' }, { severity: 'desc' }], include: { source: true } },
      sources: { include: { source: true } },
      history: {
        orderBy: { createdAt: 'desc' },
        select: { id: true, reviewVersion: true, overallScore: true, createdAt: true },
      },
    },
  });
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const artist = await getArtist(slug);
  if (!artist) return { title: 'Artist not found', robots: { index: false, follow: false } };

  const description =
    artist.summary?.slice(0, 180) ??
    `Theological assessment of ${artist.displayName}, evaluated on publicly documented beliefs, teaching and affiliations.`;

  return {
    title: artist.displayName,
    description,
    alternates: { canonical: `/artists/${artist.slug}` },
    openGraph: {
      type: 'profile',
      title:
        artist.overallScore !== null
          ? `${artist.displayName} — artist validity ${artist.overallScore}/100`
          : artist.displayName,
      description,
      url: `${env.siteUrl}/artists/${artist.slug}`,
      siteName: SITE_NAME,
    },
  };
}

export default async function ArtistPage({ params }: { params: Params }) {
  const { slug } = await params;
  const artist = await getArtist(slug);
  if (!artist) notFound();

  const songs = await searchSongs({ artistSlug: slug, perPage: 60, sort: 'score_desc' });
  const researched = artist.reviewStatus === 'COMPLETED' && artist.overallScore !== null;

  // A reviewed song must never lead to a dead artist page, so this renders
  // even when the artist's own research has not been produced yet.
  if (!researched && songs.items.length === 0) notFound();

  const strengths = artist.findings.filter((f) => f.type === 'STRENGTH');
  const concerns = artist.findings.filter((f) => f.type === 'CONCERN');

  return (
    <article className="container-page py-10 sm:py-14">
      <nav aria-label="Breadcrumb" className="mb-8 text-sm">
        <ol className="flex flex-wrap items-center gap-2 text-ink-400">
          <li>
            <Link href="/artists" className="transition-colors hover:text-ink-700">
              Artists
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li className="text-ink-600">{artist.displayName}</li>
        </ol>
      </nav>

      {isSample(artist.reviewVersion) && (
        <div className="mb-8">
          <SampleDataNotice reviewVersion={artist.reviewVersion} />
        </div>
      )}

      <header className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start lg:gap-16">
        <div className="min-w-0">
          <h1 className="text-3xl font-semibold leading-tight tracking-tight sm:text-[2.5rem]">
            {artist.displayName}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge tone="muted">{humanize(artist.type)}</Badge>
            {artist.country && <Badge tone="muted">{artist.country}</Badge>}
            {artist.foundedYear && <Badge tone="muted">Since {artist.foundedYear}</Badge>}
            <Badge tone="neutral">
              {songs.total} reviewed {songs.total === 1 ? 'song' : 'songs'}
            </Badge>
          </div>

          {artist.bio && <p className="mt-5 max-w-2xl text-[0.9375rem] leading-relaxed text-ink-600">{artist.bio}</p>}

          {researched ? (
            <>
              <div className="mt-6">
                <RecommendationCallout recommendation={artist.recommendation} />
              </div>

              <div className="mt-8 max-w-xl space-y-5">
                <ScoreBar
                  label="Doctrinal soundness"
                  score={artist.doctrineScore}
                  weight={`${ARTIST_WEIGHTS.DOCTRINE * 100}%`}
                  description="Stated beliefs measured against Scripture."
                />
                <ScoreBar
                  label="Public teaching"
                  score={artist.publicTeachingScore}
                  weight={`${ARTIST_WEIGHTS.PUBLIC_TEACHING * 100}%`}
                  description="Sermons, books and published teaching."
                />
                <ScoreBar
                  label="Affiliations"
                  score={artist.affiliationScore}
                  weight={`${ARTIST_WEIGHTS.AFFILIATIONS * 100}%`}
                  description="Churches, movements and institutions they are formally tied to."
                />
                <ScoreBar
                  label="Ministry context"
                  score={artist.ministryContextScore}
                  weight={`${ARTIST_WEIGHTS.MINISTRY_CONTEXT * 100}%`}
                  description="The environment the music is produced within."
                />
              </div>
            </>
          ) : (
            <div className="mt-6 rounded-xl border border-dashed border-line-strong bg-surface-50 px-5 py-6">
              <h2 className="text-base font-semibold text-ink-800">Artist research not yet published</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-500">
                This artist’s songs have been reviewed, but their own theological assessment has not been completed.
                Song scores do not depend on it — the songs below are scored entirely on their own content.
              </p>
            </div>
          )}
        </div>

        {researched && (
          <div className="lg:sticky lg:top-24">
            <div className="rounded-2xl border border-line bg-surface-50 px-8 py-8">
              <ScoreDial
                score={artist.overallScore}
                label="Artist validity"
                caption="Scored independently. Never affects any song's score."
              />
            </div>
          </div>
        )}
      </header>

      {artist.summary && researched && (
        <section className="mt-14 border-t border-line pt-10">
          <h2 className="eyebrow">Why this score?</h2>
          <p className="prose-review mt-4 max-w-3xl text-lg">{artist.summary}</p>
        </section>
      )}

      {artist.evidenceCaveat && (
        <section className="mt-8">
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
            <h2 className="text-sm font-semibold text-amber-900">Evidence is mixed</h2>
            <p className="mt-2 text-sm leading-relaxed text-amber-900">{artist.evidenceCaveat}</p>
            <p className="mt-3 text-xs leading-relaxed text-amber-800">
              Where credible sources genuinely disagree, BereanWorship records the disagreement rather than picking a
              side, and does not treat the contested claim as established fact.
            </p>
          </div>
        </section>
      )}

      {researched && (
        <div className="mt-14 grid grid-cols-1 gap-12 border-t border-line pt-10 lg:grid-cols-2 lg:gap-10">
          <FindingGroup
            title="Strengths"
            description="Documented doctrinal strengths, with the evidence grade for each."
            count={strengths.length}
            emptyMessage="No specific strengths were recorded."
          >
            {strengths.map((finding) => (
              <ArtistFindingItem key={finding.id} finding={finding} source={finding.source} />
            ))}
          </FindingGroup>

          <FindingGroup
            title="Concerns"
            description="Documented concerns. Claims resting on weak or contested evidence are marked and scored down accordingly."
            count={concerns.length}
            emptyMessage="No concerns were identified in this research."
          >
            {concerns.map((finding) => (
              <ArtistFindingItem key={finding.id} finding={finding} source={finding.source} />
            ))}
          </FindingGroup>
        </div>
      )}

      {/* --- Songs ------------------------------------------------------- */}
      <section className="mt-16 border-t border-line pt-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Songs by {artist.displayName}</h2>
            <p className="mt-1.5 text-sm text-ink-500">
              Each scored on its own content. This artist’s rating plays no part in these numbers.
            </p>
          </div>
          {songs.total > 0 && (
            <Link
              href={`/songs?q=${encodeURIComponent(artist.displayName)}`}
              className="text-sm font-medium text-brand-700 underline-offset-4 hover:underline"
            >
              Search all →
            </Link>
          )}
        </div>

        {songs.items.length === 0 ? (
          <p className="mt-6 rounded-xl border border-dashed border-line-strong bg-surface-50 px-5 py-8 text-center text-sm text-ink-500">
            No songs by this artist have been reviewed yet.
          </p>
        ) : (
          <div className="mt-4">
            {songs.items.map((song) => (
              <SongRow key={song.id} song={song} />
            ))}
          </div>
        )}
      </section>

      {/* --- Sources ----------------------------------------------------- */}
      {artist.sources.length > 0 && (
        <section className="mt-16 border-t border-line pt-10">
          <h2 className="text-xl font-semibold tracking-tight">Sources</h2>
          <p className="mt-1.5 text-sm text-ink-500">
            Every source consulted, with its credibility tier. Tier 4 material cannot on its own establish a serious
            claim.
          </p>

          <ul className="mt-6 space-y-3">
            {artist.sources.map(({ source, relevance }) => (
              <li key={source.id}>
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="card-hover flex items-start justify-between gap-4 rounded-lg border border-line bg-surface-0 p-4"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-ink-800">{source.title}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-ink-400">
                      <span>{source.publisher ?? hostname(source.url)}</span>
                      <span aria-hidden="true">·</span>
                      <span>{humanize(source.sourceType)}</span>
                      {source.publicationDate && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{formatDate(source.publicationDate)}</span>
                        </>
                      )}
                    </div>
                    {(relevance ?? source.summary) && (
                      <p className="mt-2 text-xs leading-relaxed text-ink-500">{relevance ?? source.summary}</p>
                    )}
                  </div>
                  <Badge tone={source.credibilityTier === 'TIER_4' ? 'warn' : 'muted'}>
                    {source.credibilityTier.replace('_', ' ')}
                  </Badge>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* --- Metadata ---------------------------------------------------- */}
      {researched && (
        <section className="mt-16 grid grid-cols-1 gap-6 border-t border-line pt-10 md:grid-cols-2">
          <Panel>
            <h2 className="text-base font-semibold">Research details</h2>
            <dl className="mt-4">
              <DataRow label="Researched">{formatDate(artist.reviewedAt)}</DataRow>
              <DataRow label="Review version">{artist.reviewVersion ?? '—'}</DataRow>
              <DataRow label="Scoring version">{artist.scoringVersion ?? '—'}</DataRow>
              <DataRow label="Findings">{artist.findings.length}</DataRow>
              <DataRow label="Sources">{artist.sources.length}</DataRow>
            </dl>
            {artist.websiteUrl && (
              <a
                href={artist.websiteUrl}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="mt-4 inline-block text-sm text-brand-700 underline-offset-4 hover:underline"
              >
                Official website →
              </a>
            )}
          </Panel>

          <Panel>
            <h2 className="text-base font-semibold">How this score works</h2>
            <p className="mt-3 text-sm leading-relaxed text-ink-600">
              Artist validity weighs doctrinal soundness (45%), public teaching (25%), affiliations (20%) and ministry
              context (10%). Findings are graded by how well each claim is actually evidenced; allegations and
              interpretations cannot carry the weight of documented fact.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-ink-600">
              This score is calculated entirely separately from song scores and never contributes to them.
            </p>
            <Link
              href="/methodology#artist"
              className="mt-4 inline-block text-sm text-brand-700 underline-offset-4 hover:underline"
            >
              Read the artist methodology →
            </Link>

            {artist.history.length > 0 && (
              <div className="mt-6">
                <div className="eyebrow mb-2.5">Previous versions</div>
                <ul className="space-y-1.5 text-sm text-ink-500">
                  {artist.history.map((entry) => (
                    <li key={entry.id} className="flex justify-between gap-4 tnum">
                      <span>{entry.reviewVersion}</span>
                      <span>
                        {entry.overallScore ?? '—'}/100 · {formatDate(entry.createdAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Panel>
        </section>
      )}
    </article>
  );
}

/** Tolerant of a database that is not yet reachable — see the note in songs/[slug]. */
export async function generateStaticParams() {
  try {
    const artists = await prisma.artist.findMany({
      where: { reviewStatus: 'COMPLETED' },
      select: { slug: true },
      take: 500,
      orderBy: { reviewedAt: 'desc' },
    });
    return artists.map((artist) => ({ slug: artist.slug }));
  } catch {
    return [];
  }
}
