import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { env, SITE_NAME } from '@/lib/env';
import { formatDate, hostname, humanize } from '@/lib/utils';
import { ARTIST_WEIGHTS } from '@/lib/scoring';
import { RecommendationCallout, ScoreBar, ScoreBlock } from '@/components/score';
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
    <article>
      <header className="band-dark border-b-4 border-volt-500">
        <div className="container-page py-12 lg:py-16">
          <nav aria-label="Breadcrumb" className="mb-10 text-xs font-bold uppercase tracking-[0.14em]">
            <ol className="flex flex-wrap items-center gap-3 text-indigo-400">
              <li>
                <Link href="/artists" className="transition-colors hover:text-volt-400">
                  Artists
                </Link>
              </li>
              <li aria-hidden="true">/</li>
              <li className="text-indigo-200">{artist.displayName}</li>
            </ol>
          </nav>

          <div className="grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-16">
        <div className="min-w-0">
          <h1 className="text-display-sm text-bone-100">{artist.displayName}</h1>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Badge tone="muted">{humanize(artist.type)}</Badge>
            {artist.country && <Badge tone="muted">{artist.country}</Badge>}
            {artist.foundedYear && <Badge tone="muted">Since {artist.foundedYear}</Badge>}
            <Badge tone="brand">
              {songs.total} reviewed {songs.total === 1 ? 'song' : 'songs'}
            </Badge>
          </div>

          {artist.bio && (
            <p className="mt-6 max-w-2xl font-serif text-lg leading-relaxed text-indigo-200">{artist.bio}</p>
          )}

          {researched ? (
            <>
              <div className="mt-8">
                <RecommendationCallout recommendation={artist.recommendation} onDark />
              </div>

              <div className="mt-12 max-w-xl space-y-8">
                <ScoreBar
                  label="Doctrinal soundness"
                  score={artist.doctrineScore}
                  weight={`${ARTIST_WEIGHTS.DOCTRINE * 100}%`}
                  description="Stated beliefs measured against Scripture."
                  onDark
                />
                <ScoreBar
                  label="Public teaching"
                  score={artist.publicTeachingScore}
                  weight={`${ARTIST_WEIGHTS.PUBLIC_TEACHING * 100}%`}
                  description="Sermons, books and published teaching."
                  onDark
                />
                <ScoreBar
                  label="Affiliations"
                  score={artist.affiliationScore}
                  weight={`${ARTIST_WEIGHTS.AFFILIATIONS * 100}%`}
                  description="Churches, movements and institutions they are formally tied to."
                  onDark
                />
                <ScoreBar
                  label="Ministry context"
                  score={artist.ministryContextScore}
                  weight={`${ARTIST_WEIGHTS.MINISTRY_CONTEXT * 100}%`}
                  description="The environment the music is produced within."
                  onDark
                />
              </div>
            </>
          ) : (
            <div className="mt-8 border-2 border-dashed border-indigo-600 px-6 py-7">
              <h2 className="text-xl font-bold text-bone-100">Artist research not yet published</h2>
              <p className="mt-3 text-[0.9375rem] leading-relaxed text-indigo-300">
                This artist’s songs have been reviewed, but their own theological assessment has not been completed.
                Song scores do not depend on it — the songs below are scored entirely on their own content.
              </p>
            </div>
          )}
        </div>

        {researched && (
          <div className="lg:sticky lg:top-28 lg:self-start">
            <ScoreBlock
              score={artist.overallScore}
              label="Artist validity"
              caption="Scored independently. Never affects any song’s score."
            />
          </div>
        )}
          </div>
        </div>
      </header>

      {isSample(artist.reviewVersion) && (
        <div className="band-bone border-b border-line">
          <div className="container-page py-6">
            <SampleDataNotice reviewVersion={artist.reviewVersion} />
          </div>
        </div>
      )}

      {artist.summary && researched && (
        <section className="band-bone-light border-b-2 border-ink-900">
          <div className="container-page py-16">
            <h2 className="eyebrow">Why this score?</h2>
            <p className="prose-review mt-6 max-w-4xl text-2xl leading-snug">{artist.summary}</p>
          </div>
        </section>
      )}

      {artist.evidenceCaveat && (
        <section className="band-bone border-b-2 border-ink-900">
          <div className="container-page py-10">
            <div className="border-l-8 border-ochre-600 bg-ochre-50 p-6">
              <h2 className="text-2xl font-bold text-ochre-800">Evidence is mixed</h2>
              <p className="mt-3 font-serif text-[1.0625rem] leading-relaxed text-ochre-800">{artist.evidenceCaveat}</p>
              <p className="mt-4 text-xs leading-relaxed text-ochre-700">
              Where credible sources genuinely disagree, BereanWorship records the disagreement rather than picking a
                side, and does not treat the contested claim as established fact.
              </p>
            </div>
          </div>
        </section>
      )}

      {researched && (
        <div className="band-bone border-b-2 border-ink-900">
          <div className="container-page grid grid-cols-1 gap-16 py-16 lg:grid-cols-2 lg:gap-12">
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
        </div>
      )}

      {/* --- Songs ------------------------------------------------------- */}
      <section className="band-bone-light border-b-2 border-ink-900">
        <div className="container-page py-16">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-display-sm">Songs by {artist.displayName}</h2>
            <p className="mt-4 text-[0.9375rem] text-ink-600">
              Each scored on its own content. This artist’s rating plays no part in these numbers.
            </p>
          </div>
          {songs.total > 0 && (
            <Link
              href={`/songs?q=${encodeURIComponent(artist.displayName)}`}
              className="text-sm font-bold uppercase tracking-[0.08em] text-volt-600 underline underline-offset-4"
            >
              Search all →
            </Link>
          )}
        </div>

        {songs.items.length === 0 ? (
          <p className="mt-8 border-2 border-dashed border-line-strong bg-bone-50 px-5 py-10 text-center text-sm font-semibold text-ink-500">
            No songs by this artist have been reviewed yet.
          </p>
        ) : (
          <div className="mt-8 border-2 border-ink-900 bg-bone-50 px-5">
            {songs.items.map((song) => (
              <SongRow key={song.id} song={song} />
            ))}
          </div>
        )}
        </div>
      </section>

      {/* --- Sources ----------------------------------------------------- */}
      {artist.sources.length > 0 && (
        <section className="band-bone border-b-2 border-ink-900">
          <div className="container-page py-16">
          <h2 className="text-display-sm">Sources</h2>
          <p className="mt-4 max-w-2xl text-[0.9375rem] text-ink-600">
            Every source consulted, with its credibility tier. Tier 4 material cannot on its own establish a serious
            claim.
          </p>

          <ul className="mt-8 border-2 border-ink-900">
            {artist.sources.map(({ source, relevance }) => (
              <li key={source.id} className="border-b border-line last:border-0">
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="flex items-start justify-between gap-4 bg-bone-50 p-5 transition-colors hover:bg-bone-200"
                >
                  <div className="min-w-0">
                    <div className="font-bold text-ink-900">{source.title}</div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold uppercase tracking-wider text-ink-400">
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
                  <Badge tone={source.credibilityTier === 'TIER_4' ? 'warn' : 'dark'}>
                    {source.credibilityTier.replace('_', ' ')}
                  </Badge>
                </a>
              </li>
            ))}
          </ul>
          </div>
        </section>
      )}

      {/* --- Metadata ---------------------------------------------------- */}
      {researched && (
        <section className="band-bone-light">
          <div className="container-page grid grid-cols-1 gap-8 py-16 md:grid-cols-2">
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
          </div>
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
