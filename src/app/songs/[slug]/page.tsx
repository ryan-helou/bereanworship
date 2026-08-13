import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { env, SITE_NAME } from '@/lib/env';
import { formatDate, hostname, humanize } from '@/lib/utils';
import { RECOMMENDATION_LABEL, SONG_WEIGHTS, scoreLabel } from '@/lib/scoring';
import { RecommendationCallout, ScoreBar, ScoreDial, ScorePill } from '@/components/score';
import { FindingGroup, SongFindingItem } from '@/components/findings';
import { Badge, DataRow, Panel, SampleDataNotice, isSample } from '@/components/ui';

/**
 * Song detail — the page the whole product exists to produce.
 *
 * Order of argument: the verdict, then the breakdown, then the summary, then
 * the evidence that produced it, then the Scripture behind it, and only then
 * the artist — kept visually and verbally separate so the two ratings are
 * never confused for one another.
 */

export const revalidate = 3600;

type Params = Promise<{ slug: string }>;

async function getSong(slug: string) {
  return prisma.song.findUnique({
    where: { slug },
    include: {
      artist: {
        select: {
          id: true,
          displayName: true,
          slug: true,
          overallScore: true,
          recommendation: true,
          summary: true,
          reviewStatus: true,
          type: true,
        },
      },
      findings: { orderBy: [{ type: 'asc' }, { severity: 'desc' }] },
      scriptures: { orderBy: { ordering: 'asc' } },
      themes: { include: { theme: true } },
      sources: { include: { source: true } },
      history: { orderBy: { createdAt: 'desc' }, select: { id: true, reviewVersion: true, overallScore: true, createdAt: true } },
    },
  });
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const song = await getSong(slug);

  if (!song || song.reviewStatus !== 'COMPLETED') {
    return { title: 'Song not found', robots: { index: false, follow: false } };
  }

  const title = `${song.displayTitle} — ${song.artist.displayName}`;
  const description =
    song.summary?.slice(0, 180) ??
    `${song.displayTitle} by ${song.artist.displayName}: ${song.overallScore}/100 for biblical soundness, congregational suitability and clarity.`;

  return {
    title,
    description,
    alternates: { canonical: `/songs/${song.slug}` },
    openGraph: {
      type: 'article',
      title: `${title} — ${song.overallScore}/100`,
      description,
      url: `${env.siteUrl}/songs/${song.slug}`,
      siteName: SITE_NAME,
    },
    twitter: { card: 'summary_large_image', title: `${title} — ${song.overallScore}/100`, description },
  };
}

export default async function SongPage({ params }: { params: Params }) {
  const { slug } = await params;
  const song = await getSong(slug);

  if (!song || song.reviewStatus !== 'COMPLETED' || song.overallScore === null) notFound();

  const strengths = song.findings.filter((f) => f.type === 'STRENGTH');
  const concerns = song.findings.filter((f) => f.type === 'CONCERN');
  const sample = isSample(song.reviewVersion);

  // Structured data: song reviews are exactly what Review markup is for.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Review',
    itemReviewed: {
      '@type': 'MusicComposition',
      name: song.displayTitle,
      composer: { '@type': 'Person', name: song.artist.displayName },
      ...(song.releaseYear ? { datePublished: String(song.releaseYear) } : {}),
    },
    reviewRating: {
      '@type': 'Rating',
      ratingValue: song.overallScore,
      bestRating: 100,
      worstRating: 0,
      alternateName: scoreLabel(song.overallScore),
    },
    author: { '@type': 'Organization', name: SITE_NAME, url: env.siteUrl },
    datePublished: song.reviewedAt?.toISOString(),
    reviewBody: song.summary ?? undefined,
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <article className="container-page py-10 sm:py-14">
        <nav aria-label="Breadcrumb" className="mb-8 text-sm">
          <ol className="flex flex-wrap items-center gap-2 text-ink-400">
            <li>
              <Link href="/songs" className="transition-colors hover:text-ink-700">
                Songs
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li className="text-ink-600">{song.displayTitle}</li>
          </ol>
        </nav>

        {sample && (
          <div className="mb-8">
            <SampleDataNotice reviewVersion={song.reviewVersion} />
          </div>
        )}

        {/* --- Verdict ---------------------------------------------------- */}
        <header className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start lg:gap-16">
          <div className="min-w-0">
            <h1 className="text-3xl font-semibold leading-tight tracking-tight sm:text-[2.5rem]">
              {song.displayTitle}
            </h1>
            <p className="mt-2 text-lg text-ink-500">
              <Link href={`/artists/${song.artist.slug}`} className="transition-colors hover:text-ink-800">
                {song.artist.displayName}
              </Link>
            </p>

            <div className="mt-6">
              <RecommendationCallout recommendation={song.recommendation} />
            </div>

            <div className="mt-8 max-w-xl space-y-5">
              <ScoreBar
                label="Biblical / Theological"
                score={song.theologicalScore}
                weight={`${SONG_WEIGHTS.THEOLOGICAL * 100}%`}
                description="Doctrinal soundness measured against Scripture."
              />
              <ScoreBar
                label="Communal Worship"
                score={song.communalScore}
                weight={`${SONG_WEIGHTS.COMMUNAL * 100}%`}
                description="Whether a real congregation can sing this together."
              />
              <ScoreBar
                label="Clarity"
                score={song.clarityScore}
                weight={`${SONG_WEIGHTS.CLARITY * 100}%`}
                description="Whether people understand what they are affirming."
              />
            </div>
          </div>

          <div className="lg:sticky lg:top-24">
            <div className="rounded-2xl border border-line bg-surface-50 px-8 py-8">
              <ScoreDial score={song.overallScore} label="Song validity" />
            </div>
          </div>
        </header>

        {/* --- Summary ---------------------------------------------------- */}
        {song.summary && (
          <section className="mt-14 border-t border-line pt-10">
            <h2 className="eyebrow">Summary</h2>
            <p className="prose-review mt-4 max-w-3xl text-lg">{song.summary}</p>
          </section>
        )}

        {/* --- Findings --------------------------------------------------- */}
        <div className="mt-14 grid grid-cols-1 gap-12 border-t border-line pt-10 lg:grid-cols-2 lg:gap-10">
          <FindingGroup
            title="Strengths"
            description="What raises this song's score, and why it matters."
            count={strengths.length}
            emptyMessage="No specific strengths were recorded for this song."
          >
            {strengths.map((finding) => (
              <SongFindingItem key={finding.id} finding={finding} />
            ))}
          </FindingGroup>

          <FindingGroup
            title="Concerns"
            description="What lowers this song's score, graded by severity and how central the doctrine is."
            count={concerns.length}
            emptyMessage="No concerns were identified in this review."
          >
            {concerns.map((finding) => (
              <SongFindingItem key={finding.id} finding={finding} />
            ))}
          </FindingGroup>
        </div>

        {/* --- Scripture -------------------------------------------------- */}
        {song.scriptures.length > 0 && (
          <section className="mt-16 border-t border-line pt-10">
            <h2 className="text-xl font-semibold tracking-tight">Scripture</h2>
            <p className="mt-1.5 text-sm text-ink-500">
              Passages that bear on this song’s content. Quotations are from the ESV and kept brief — the reasoning
              matters more than the quoted text.
            </p>

            <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2">
              {song.scriptures.map((scripture) => (
                <div key={scripture.id} className="rounded-xl border border-line bg-surface-0 p-5">
                  <h3 className="text-sm font-semibold text-brand-800">{scripture.reference}</h3>
                  {scripture.excerpt && <p className="scripture mt-3 text-sm">{scripture.excerpt}</p>}
                  <p className="mt-3 text-sm leading-relaxed text-ink-600">{scripture.relevance}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* --- Artist: emphatically separate ------------------------------ */}
        <section className="mt-16 border-t border-line pt-10">
          <h2 className="text-xl font-semibold tracking-tight">Artist</h2>

          <div className="mt-6 rounded-xl border border-line bg-surface-0 p-6">
            <div className="flex flex-wrap items-start justify-between gap-6">
              <div className="min-w-0 flex-1">
                <Link
                  href={`/artists/${song.artist.slug}`}
                  className="text-lg font-semibold text-ink-900 transition-colors hover:text-brand-700"
                >
                  {song.artist.displayName}
                </Link>
                <p className="mt-1 text-sm text-ink-400">{humanize(song.artist.type)}</p>
                {song.artist.summary && (
                  <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-600">
                    {song.artist.summary.length > 320
                      ? `${song.artist.summary.slice(0, 320).trimEnd()}…`
                      : song.artist.summary}
                  </p>
                )}
              </div>

              <div className="text-right">
                <div className="eyebrow">Artist validity</div>
                <div className="mt-1.5 flex justify-end">
                  <ScorePill score={song.artist.overallScore} />
                </div>
              </div>
            </div>

            {/* The single most important clarification on the page. */}
            <p className="mt-5 rounded-lg border border-brand-100 bg-brand-50 px-4 py-3 text-sm leading-relaxed text-brand-900">
              <span className="font-semibold">Artist validity is independent of song validity.</span> It does not affect
              this song’s score in any way. A theologically troubled ministry can write a doctrinally excellent song, and
              a sound one can write a careless song — so the two are evaluated, and scored, entirely separately.
            </p>
          </div>
        </section>

        {/* --- Sources ---------------------------------------------------- */}
        {song.sources.length > 0 && (
          <section className="mt-16 border-t border-line pt-10">
            <h2 className="text-xl font-semibold tracking-tight">Sources</h2>
            <p className="mt-1.5 text-sm text-ink-500">Material consulted while researching this song.</p>

            <ul className="mt-6 space-y-3">
              {song.sources.map(({ source }) => (
                <li key={source.id}>
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="card-hover flex items-start justify-between gap-4 rounded-lg border border-line bg-surface-0 p-4"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-ink-800">{source.title}</div>
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
                    </div>
                    <Badge tone="muted">{source.credibilityTier.replace('_', ' ')}</Badge>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* --- Metadata ---------------------------------------------------- */}
        <section className="mt-16 grid grid-cols-1 gap-6 border-t border-line pt-10 md:grid-cols-2">
          <Panel>
            <h2 className="text-base font-semibold">Song details</h2>
            <dl className="mt-4">
              <DataRow label="Artist">
                <Link href={`/artists/${song.artist.slug}`} className="text-brand-700 hover:underline">
                  {song.artist.displayName}
                </Link>
              </DataRow>
              {song.album && <DataRow label="Album">{song.album}</DataRow>}
              {song.releaseYear && <DataRow label="Released">{song.releaseYear}</DataRow>}
              {song.genre && <DataRow label="Genre">{song.genre}</DataRow>}
              <DataRow label="Recommendation">
                {song.recommendation ? RECOMMENDATION_LABEL[song.recommendation] : '—'}
              </DataRow>
            </dl>

            {song.themes.length > 0 && (
              <div className="mt-5">
                <div className="eyebrow mb-2.5">Themes</div>
                <div className="flex flex-wrap gap-2">
                  {song.themes.map(({ theme }) => (
                    <Link key={theme.id} href={`/songs?theme=${theme.slug}`}>
                      <Badge tone="neutral" className="transition-colors hover:bg-surface-200">
                        {theme.name}
                      </Badge>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </Panel>

          <Panel>
            <h2 className="text-base font-semibold">Review details</h2>
            <dl className="mt-4">
              <DataRow label="Reviewed">{formatDate(song.reviewedAt)}</DataRow>
              <DataRow label="Review version">{song.reviewVersion ?? '—'}</DataRow>
              <DataRow label="Scoring version">{song.scoringVersion ?? '—'}</DataRow>
              <DataRow label="Methodology">{song.methodologyVersion ?? '—'}</DataRow>
              <DataRow label="Findings recorded">{song.findings.length}</DataRow>
            </dl>

            {song.history.length > 0 && (
              <div className="mt-5">
                <div className="eyebrow mb-2.5">Previous versions</div>
                <ul className="space-y-1.5 text-sm text-ink-500">
                  {song.history.map((entry) => (
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

            <p className="mt-5 text-xs leading-relaxed text-ink-400">
              Reviews are versioned and never silently overwritten. When a song is re-reviewed, the previous version is
              archived rather than replaced.{' '}
              <Link href="/methodology" className="text-brand-700 hover:underline">
                Read the methodology
              </Link>
              .
            </p>
          </Panel>
        </section>
      </article>
    </>
  );
}

/**
 * Pre-renders the reviewed catalogue at build time; anything not listed here
 * still renders on demand.
 *
 * Deliberately tolerant of a failure: the build must not depend on a running,
 * migrated database. On a fresh deploy the schema is applied *after* the build
 * (Railway's pre-deploy step), so this query has nothing to read — returning
 * an empty list simply defers every page to on-demand rendering, which is the
 * correct behaviour rather than a failed build.
 */
export async function generateStaticParams() {
  try {
    const songs = await prisma.song.findMany({
      where: { reviewStatus: 'COMPLETED' },
      select: { slug: true },
      take: 500,
      orderBy: { reviewedAt: 'desc' },
    });
    return songs.map((song) => ({ slug: song.slug }));
  } catch {
    return [];
  }
}
