import Link from 'next/link';
import { Suspense } from 'react';
import { prisma } from '@/lib/db';
import { searchSongs } from '@/lib/search';
import { SearchBar } from '@/components/search-bar';
import { SongCard, SongCardSkeleton } from '@/components/cards';
import { ButtonLink, SectionHeading } from '@/components/ui';

/**
 * Homepage.
 *
 * The hero states the thesis, the search bar is the primary action, and the
 * two rails below prove the database has something in it. Everything else is
 * subordinate to those three jobs.
 */

// Revalidate hourly: the content changes when reviews land, not per request.
export const revalidate = 3600;

/**
 * The homepage is pre-rendered at build time, and on a fresh deploy the schema
 * is applied *after* the build — so these queries can legitimately have nothing
 * to read. Failing the build over that would be wrong; the page simply renders
 * its empty state and fills in on the next revalidation.
 */
async function safely<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

export default function HomePage() {
  return (
    <>
      <Hero />

      <div className="container-page">
        <Suspense fallback={<RailSkeleton />}>
          <RecentlyReviewed />
        </Suspense>

        <Suspense fallback={<RailSkeleton />}>
          <HighestRated />
        </Suspense>

        <HowItWorks />
        <RequestCta />
      </div>
    </>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-line">
      {/* A single, very quiet wash of brand colour. Nothing more. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-gradient-to-b from-brand-50/70 to-transparent"
      />

      <div className="container-page relative">
        <div className="mx-auto max-w-3xl py-20 text-center sm:py-28">
          <p className="eyebrow">Acts 17:11</p>

          <h1 className="mt-5 text-[2.75rem] font-semibold leading-[1.05] tracking-[-0.033em] text-ink-900 sm:text-6xl">
            Test what you sing.
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-ink-500">
            Explore worship songs evaluated for biblical soundness, congregational suitability, and clarity — with
            Scripture and research behind every review.
          </p>

          <div className="mx-auto mt-10 max-w-xl">
            <SearchBar size="lg" placeholder="Search songs or artists…" />
            <p className="mt-3 text-sm text-ink-400">
              Try{' '}
              <Link href="/songs?q=amazing" className="text-brand-700 underline-offset-2 hover:underline">
                amazing
              </Link>
              ,{' '}
              <Link href="/songs?q=holy" className="text-brand-700 underline-offset-2 hover:underline">
                holy
              </Link>
              , or browse{' '}
              <Link href="/songs" className="text-brand-700 underline-offset-2 hover:underline">
                every reviewed song
              </Link>
              .
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

async function RecentlyReviewed() {
  const { items } = await safely(() => searchSongs({ sort: 'newest', perPage: 6 }), {
    items: [],
    total: 0,
    page: 1,
    perPage: 6,
    totalPages: 1,
  });
  if (items.length === 0) return <NothingYet />;

  return (
    <section className="py-16 sm:py-20">
      <SectionHeading
        eyebrow="Latest"
        title="Recently reviewed"
        description="The most recent songs to complete the review pipeline."
        action={
          <Link
            href="/songs?sort=newest"
            className="text-sm font-medium text-brand-700 underline-offset-4 hover:underline"
          >
            View all →
          </Link>
        }
      />
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((song) => (
          <SongCard key={song.id} song={song} />
        ))}
      </div>
    </section>
  );
}

async function HighestRated() {
  const { items } = await safely(() => searchSongs({ sort: 'score_desc', perPage: 6, minScore: 70 }), {
    items: [],
    total: 0,
    page: 1,
    perPage: 6,
    totalPages: 1,
  });
  if (items.length === 0) return null;

  return (
    <section className="border-t border-line py-16 sm:py-20">
      <SectionHeading
        eyebrow="Highest rated"
        title="Strongest reviews"
        description="Songs whose theology, singability and clarity all hold up under examination."
        action={
          <Link
            href="/songs?sort=score_desc"
            className="text-sm font-medium text-brand-700 underline-offset-4 hover:underline"
          >
            View all →
          </Link>
        }
      />
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((song) => (
          <SongCard key={song.id} song={song} />
        ))}
      </div>
    </section>
  );
}

async function NothingYet() {
  const pending = await safely(
    () => prisma.reviewJob.count({ where: { status: { in: ['PENDING', 'RESEARCHING', 'ANALYZING'] } } }),
    0,
  );

  return (
    <section className="py-20">
      <div className="mx-auto max-w-xl rounded-xl border border-dashed border-line-strong bg-surface-50 px-6 py-14 text-center">
        <h2 className="text-lg font-semibold text-ink-900">No reviews published yet</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-500">
          {pending > 0
            ? `${pending} ${pending === 1 ? 'review is' : 'reviews are'} currently in the queue. Completed reviews appear here as they finish.`
            : 'The database is empty. Reviews appear here once the pipeline has run.'}
        </p>
        <div className="mt-6">
          <ButtonLink href="/request" variant="brand">
            Request a song
          </ButtonLink>
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    {
      title: 'Evidence',
      body: 'Each song’s theological claims are inventoried first, from its own lyrics. Artist research draws on statements of faith, published teaching and reputable sources — graded by how well each claim is actually established.',
    },
    {
      title: 'Analysis',
      body: 'Three independent passes examine biblical soundness, congregational suitability and clarity. Each finding names what produced it and, where relevant, the passage of Scripture that bears on it.',
    },
    {
      title: 'Scoring',
      body: 'Scores are calculated from those findings by a fixed, published formula — never asserted by a model. Severity and centrality decide the weight, so one serious error outweighs a page of pleasant lines.',
    },
  ];

  return (
    <section className="border-t border-line py-16 sm:py-20">
      <SectionHeading
        eyebrow="Method"
        title="Evidence, then analysis, then scoring"
        description="Every number on this site can be traced back to the finding that produced it. Nothing here is “the AI said so”."
      />

      <ol className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-3">
        {steps.map((step, index) => (
          <li key={step.title} className="relative rounded-xl border border-line bg-surface-0 p-6">
            <span className="tnum text-sm font-semibold text-brand-700">{String(index + 1).padStart(2, '0')}</span>
            <h3 className="mt-3 text-base font-semibold text-ink-900">{step.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-500">{step.body}</p>
          </li>
        ))}
      </ol>

      <div className="mt-8">
        <ButtonLink href="/methodology" variant="secondary">
          Read the full methodology
        </ButtonLink>
      </div>
    </section>
  );
}

function RequestCta() {
  return (
    <section className="border-t border-line py-16 sm:py-20">
      <div className="rounded-2xl bg-ink-900 px-8 py-14 text-center sm:px-14">
        <h2 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">Can’t find a song?</h2>
        <p className="mx-auto mt-3 max-w-lg text-[0.9375rem] leading-relaxed text-ink-300">
          Request it for review. No account needed — if it has already been reviewed, we’ll take you straight to it.
        </p>
        <div className="mt-8">
          <ButtonLink
            href="/request"
            className="bg-white text-ink-900 hover:bg-surface-100"
            variant="secondary"
            size="lg"
          >
            Request a song for review
          </ButtonLink>
        </div>
      </div>
    </section>
  );
}

function RailSkeleton() {
  return (
    <section className="py-16 sm:py-20">
      <div className="skeleton h-8 w-56 rounded" />
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <SongCardSkeleton key={i} />
        ))}
      </div>
    </section>
  );
}
