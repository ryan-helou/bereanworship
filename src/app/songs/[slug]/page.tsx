import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { env, SITE_NAME } from '@/lib/env';
import { formatDate, hostname, humanize } from '@/lib/utils';
import {
  RECOMMENDATION_LABEL,
  SONG_WEIGHTS,
  bestStrength,
  rangeLabel,
  scoreLabel,
  scoreSong,
  worstConcern,
} from '@/lib/scoring';
import { RangeBlock, RecommendationCallout, ScoreBar, ScoreBlock, ScorePill } from '@/components/score';
import { ScoreContribution } from '@/components/score-contribution';
import { independentSourceCount } from '@/lib/ai/schemas';
import { FindingGroup, SongFindingItem, type FindingRole } from '@/components/findings';
import { SongNotePanel } from '@/components/song-note-panel';
import { Badge, DataRow, Panel, SampleDataNotice, isSample } from '@/components/ui';

/**
 * Song detail — the page the whole product exists to produce.
 *
 * Order of argument: the verdict (as a block of colour you cannot miss), then
 * the breakdown, then the summary, then the evidence that produced it, then
 * the Scripture behind it, and only then the artist — kept in its own band so
 * the two ratings are never read as one.
 */

// Dynamic: the owner's private note box reads the session cookie, which a cached page cannot do.
export const dynamic = 'force-dynamic';

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
      history: {
        orderBy: { createdAt: 'desc' },
        select: { id: true, reviewVersion: true, overallScore: true, createdAt: true },
      },
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

export default async function SongPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Promise<{ note?: string }>;
}) {
  const { slug } = await params;
  const { note: noteError } = await searchParams;
  const song = await getSong(slug);

  if (!song || song.reviewStatus !== 'COMPLETED' || song.overallScore === null) notFound();

  const strengths = song.findings.filter((f) => f.type === 'STRENGTH');
  const concerns = song.findings.filter((f) => f.type === 'CONCERN');

  // Recomputed from the persisted findings rather than stored: scoring is a
  // pure function of them, so deriving it here keeps one source of truth and
  // means the published score can always be re-checked against its evidence.
  const breakdown =
    song.findings.length > 0
      ? scoreSong(song.findings, {
          namesGod: song.substNamesGod,
          statesAnAct: song.substStatesAnAct,
          teachesDoctrine: song.substTeachesDoctrine,
          godDirected: song.substGodDirected,
          groundsClaims: song.substGroundsClaims,
          corporateVoice: song.substCorporateVoice,
          engagesScripture: song.substEngagesScripture,
        }, { performanceOrientation: song.performanceOrientation, repetition: song.repetition }, {
          independentSources: independentSourceCount(
            song.sources.map(({ source, assessesContent }) => ({ ...source, assessesContent })),
          ),
        })
      : null;

  // Mark the two findings that decided each criterion, using the scorer's own
  // selection rather than a second implementation of the tie-break.
  const roles = new Map<string, FindingRole>();
  for (const component of ['THEOLOGICAL', 'COMMUNAL', 'CLARITY'] as const) {
    const inComponent = song.findings.filter((f) => f.component === component);
    const ceiling = worstConcern(inComponent);
    const merit = bestStrength(inComponent);
    if (ceiling) roles.set(ceiling.id, 'SETS_CEILING');
    if (merit) roles.set(merit.id, 'SETS_MERIT');
  }

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

      <article>
        {/* --- Verdict band ------------------------------------------------ */}
        <header className="band-dark border-b-4 border-volt-500">
          <div className="container-page py-12 lg:py-16">
            <nav aria-label="Breadcrumb" className="mb-10 text-xs font-bold uppercase tracking-[0.14em]">
              <ol className="flex flex-wrap items-center gap-3 text-indigo-400">
                <li>
                  <Link href="/songs" className="transition-colors hover:text-volt-400">
                    Songs
                  </Link>
                </li>
                <li aria-hidden="true">/</li>
                <li className="text-indigo-200">{song.displayTitle}</li>
              </ol>
            </nav>

            <div className="grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-16">
              <div className="min-w-0">
                <h1 className="text-display-sm text-bone-100">{song.displayTitle}</h1>
                <p className="mt-4 text-lg font-bold uppercase tracking-[0.1em] text-volt-400">
                  <Link href={`/artists/${song.artist.slug}`} className="transition-colors hover:text-volt-300">
                    {song.artist.displayName}
                  </Link>
                </p>

                <div className="mt-8">
                  <RecommendationCallout recommendation={song.recommendation} onDark />
                </div>

                <div className="mt-12 max-w-xl space-y-8">
                  <ScoreBar
                    label="Biblical / Theological"
                    score={song.theologicalScore}
                    weight={`${SONG_WEIGHTS.THEOLOGICAL * 100}%`}
                    description="Doctrinal soundness measured against Scripture."
                    onDark
                  />
                  <ScoreBar
                    label="Communal Worship"
                    score={song.communalScore}
                    weight={`${SONG_WEIGHTS.COMMUNAL * 100}%`}
                    description="Whether a real congregation can sing this together."
                    onDark
                  />
                  <ScoreBar
                    label="Clarity"
                    score={song.clarityScore}
                    weight={`${SONG_WEIGHTS.CLARITY * 100}%`}
                    description="Whether people understand what they are affirming."
                    onDark
                  />
                </div>
              </div>

              <div className="space-y-6 lg:sticky lg:top-28 lg:self-start">
                <ScoreBlock score={song.overallScore} label="Song validity" />
                <RangeBlock
                  score={song.rangeScore}
                  label={rangeLabel(song.rangeScore)}
                  lowest={song.rangeLowest}
                  highest={song.rangeHighest}
                  rangeKey={song.rangeKey}
                  note={song.rangeNote}
                  source={song.rangeSource}
                />
              </div>
            </div>
          </div>
        </header>

        <SongNotePanel songId={song.id} error={noteError} />

        {isSample(song.reviewVersion) && (
          <div className="band-bone border-b border-line">
            <div className="container-page py-6">
              <SampleDataNotice reviewVersion={song.reviewVersion} />
            </div>
          </div>
        )}

        {/* --- Summary ------------------------------------------------------ */}
        {song.summary && (
          <section className="band-bone-light border-b-2 border-ink-900">
            <div className="container-page py-16">
              <h2 className="eyebrow">Summary</h2>
              <p className="prose-review mt-6 max-w-4xl text-2xl leading-snug">{song.summary}</p>
            </div>
          </section>
        )}

        {/* --- Findings ----------------------------------------------------- */}
        <section className="band-bone border-b-2 border-ink-900">
          <div className="container-page py-16">
            <div className="grid grid-cols-1 gap-16 lg:grid-cols-2 lg:gap-12">
              <FindingGroup
                title="Strengths"
                description="What raises this song's score, and why it matters."
                count={strengths.length}
                emptyMessage="No specific strengths were recorded for this song."
              >
                {strengths.map((finding) => (
                  <SongFindingItem key={finding.id} finding={finding} role={roles.get(finding.id) ?? null} />
                ))}
              </FindingGroup>

              <FindingGroup
                title="Concerns"
                description="What lowers this song's score, graded by severity and how central the doctrine is."
                count={concerns.length}
                emptyMessage="No concerns were identified in this review."
              >
                {concerns.map((finding) => (
                  <SongFindingItem key={finding.id} finding={finding} role={roles.get(finding.id) ?? null} />
                ))}
              </FindingGroup>
            </div>
          </div>
        </section>

        {/* --- Where the score comes from ----------------------------------- */}
        {breakdown && (
          <ScoreContribution
            theological={breakdown.theological}
            communal={breakdown.communal}
            clarity={breakdown.clarity}
            soundness={breakdown.soundness}
            substance={breakdown.substance}
            overallScore={song.overallScore ?? breakdown.overallScore}
            overallCeiling={breakdown.overallCeiling}
            deliveryDeduction={breakdown.deliveryDeduction}
          />
        )}

        {/* --- Scripture ---------------------------------------------------- */}
        {song.scriptures.length > 0 && (
          <section className="band-dark border-b-4 border-volt-500">
            <div className="container-page py-16">
              <h2 className="text-display-sm text-bone-100">Scripture</h2>
              <p className="mt-4 max-w-2xl text-[0.9375rem] leading-relaxed text-indigo-300">
                Passages that bear on this song’s content. Quotations are from the ESV and kept brief — the reasoning
                matters more than the quoted text.
              </p>

              <div className="mt-10 grid grid-cols-1 gap-px border-2 border-indigo-600 bg-indigo-600 sm:grid-cols-2">
                {song.scriptures.map((scripture) => (
                  <div key={scripture.id} className="bg-indigo-900 p-7">
                    <h3 className="text-xl font-bold text-volt-400">{scripture.reference}</h3>
                    {scripture.excerpt && <p className="scripture mt-4 text-[0.9375rem]">{scripture.excerpt}</p>}
                    <p className="mt-4 text-[0.9375rem] leading-relaxed text-indigo-200">{scripture.relevance}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* --- Artist: emphatically separate -------------------------------- */}
        <section className="band-bone-light border-b-2 border-ink-900">
          <div className="container-page py-16">
            <h2 className="text-display-sm">Artist</h2>

            <div className="mt-8 border-2 border-ink-900 bg-bone-50">
              <div className="flex flex-wrap items-start justify-between gap-6 p-7">
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/artists/${song.artist.slug}`}
                    className="text-2xl font-bold tracking-tight text-ink-900 transition-colors hover:text-volt-600"
                  >
                    {song.artist.displayName}
                  </Link>
                  <p className="mt-1.5 text-xs font-bold uppercase tracking-[0.12em] text-ink-400">
                    {humanize(song.artist.type)}
                  </p>
                  {song.artist.summary && (
                    <p className="mt-4 max-w-2xl font-serif text-[1.0625rem] leading-relaxed text-ink-600">
                      {song.artist.summary.length > 320
                        ? `${song.artist.summary.slice(0, 320).trimEnd()}…`
                        : song.artist.summary}
                    </p>
                  )}
                </div>

                <div className="text-right">
                  <div className="eyebrow">Artist validity</div>
                  <div className="mt-3 flex justify-end">
                    <ScorePill score={song.artist.overallScore} />
                  </div>
                </div>
              </div>

              {/* The single most important clarification on the page. */}
              <p className="border-t-2 border-ink-900 bg-volt-500 px-7 py-5 text-[0.9375rem] leading-relaxed text-white">
                <span className="font-bold">Artist validity is independent of song validity.</span> It does not affect
                this song’s score in any way. A theologically troubled ministry can write a doctrinally excellent song,
                and a sound one can write a careless song — so the two are evaluated, and scored, entirely separately.
              </p>
            </div>
          </div>
        </section>

        {/* --- Sources ------------------------------------------------------- */}
        {song.sources.length > 0 && (
          <section className="band-bone border-b-2 border-ink-900">
            <div className="container-page py-16">
              <h2 className="text-display-sm">Sources</h2>
              <p className="mt-4 text-[0.9375rem] text-ink-600">Material consulted while researching this song.</p>

              <ul className="mt-8 border-2 border-ink-900">
                {song.sources.map(({ source }) => (
                  <li key={source.id} className="border-b border-line last:border-0">
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="flex items-start justify-between gap-4 bg-bone-50 p-5 transition-colors hover:bg-bone-200"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-bold text-ink-900">{source.title}</div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold uppercase tracking-wider text-ink-400">
                          <span>{source.publisher ?? hostname(source.url)}</span>
                          <span>{humanize(source.sourceType)}</span>
                          {source.publicationDate && <span>{formatDate(source.publicationDate)}</span>}
                        </div>
                      </div>
                      <Badge tone="dark">{source.credibilityTier.replace('_', ' ')}</Badge>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        {/* --- Metadata ------------------------------------------------------ */}
        <section className="band-bone-light">
          <div className="container-page py-16">
            <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
              <Panel>
                <h2 className="text-xl font-bold">Song details</h2>
                <dl className="mt-5">
                  <DataRow label="Artist">
                    <Link href={`/artists/${song.artist.slug}`} className="text-volt-600 hover:underline">
                      {song.artist.displayName}
                    </Link>
                  </DataRow>
                  {song.album && <DataRow label="Album">{song.album}</DataRow>}
                  {song.releaseYear && <DataRow label="Released">{song.releaseYear}</DataRow>}
                  {song.genre && <DataRow label="Genre">{song.genre}</DataRow>}
                  {song.ccliNumber && <DataRow label="CCLI">{song.ccliNumber}</DataRow>}
                  <DataRow label="Range">
                    {song.rangeScore !== null && song.rangeLowest
                      ? `${song.rangeLowest}–${song.rangeHighest} · ${song.rangeScore}/100 ${rangeLabel(song.rangeScore)}`
                      : 'Not measured'}
                  </DataRow>
                  <DataRow label="Recommendation">
                    {song.recommendation ? RECOMMENDATION_LABEL[song.recommendation] : '—'}
                  </DataRow>
                </dl>

                {song.themes.length > 0 && (
                  <div className="mt-6">
                    <div className="eyebrow mb-3">Themes</div>
                    <div className="flex flex-wrap gap-2">
                      {song.themes.map(({ theme }) => (
                        <Link key={theme.id} href={`/songs?theme=${theme.slug}`}>
                          <Badge tone="neutral" className="transition-colors hover:bg-volt-500 hover:text-white">
                            {theme.name}
                          </Badge>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </Panel>

              <Panel>
                <h2 className="text-xl font-bold">Review details</h2>
                <dl className="mt-5">
                  <DataRow label="Reviewed">{formatDate(song.reviewedAt)}</DataRow>
                  <DataRow label="Review version">{song.reviewVersion ?? '—'}</DataRow>
                  <DataRow label="Scoring version">{song.scoringVersion ?? '—'}</DataRow>
                  <DataRow label="Methodology">{song.methodologyVersion ?? '—'}</DataRow>
                  <DataRow label="Findings recorded">{song.findings.length}</DataRow>
                </dl>

                {song.history.length > 0 && (
                  <div className="mt-6">
                    <div className="eyebrow mb-3">Previous versions</div>
                    <ul className="space-y-2 text-sm font-semibold text-ink-600">
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

                <p className="mt-6 text-xs leading-relaxed text-ink-500">
                  Reviews are versioned and never silently overwritten. When a song is re-reviewed, the previous version
                  is archived rather than replaced.{' '}
                  <Link href="/methodology" className="font-bold text-volt-600 hover:underline">
                    Read the methodology
                  </Link>
                  .
                </p>
              </Panel>
            </div>
          </div>
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
