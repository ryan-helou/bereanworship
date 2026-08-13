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
 * Built as a sequence of full-bleed bands rather than cards on a page: an
 * indigo hero states the thesis, bone bands carry the catalogue, and an
 * electric-blue band carries the call to action. The rhythm of the colour is
 * the layout.
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

const EMPTY_PAGE = { items: [], total: 0, page: 1, perPage: 6, totalPages: 1 };

export default function HomePage() {
  return (
    <>
      <Hero />

      <Suspense fallback={<RailSkeleton />}>
        <RecentlyReviewed />
      </Suspense>

      <Suspense fallback={null}>
        <HighestRated />
      </Suspense>

      <HowItWorks />
      <RequestCta />
    </>
  );
}

function Hero() {
  return (
    <section className="band-dark border-b-4 border-volt-500">
      <div className="container-page">
        <div className="grid grid-cols-1 gap-12 py-20 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:items-center lg:gap-16 lg:py-28">
          <div>
            <p className="eyebrow">Acts 17:11</p>

            <h1 className="text-display mt-6 text-bone-100">
              Test what
              <br />
              you sing.
            </h1>

            <p className="mt-8 max-w-xl font-serif text-xl leading-relaxed text-indigo-200">
              Worship songs examined against Scripture — for biblical soundness, congregational suitability, and
              clarity, with the evidence and reasoning behind every score.
            </p>

            <div className="mt-10 max-w-xl">
              <SearchBar size="lg" placeholder="Search songs or artists…" onDark />
              <p className="mt-4 text-sm font-semibold text-indigo-300">
                Try{' '}
                <Link href="/songs?q=god" className="text-volt-400 underline underline-offset-4 hover:text-volt-300">
                  god
                </Link>
                , or browse{' '}
                <Link href="/songs" className="text-volt-400 underline underline-offset-4 hover:text-volt-300">
                  every reviewed song
                </Link>
                .
              </p>
            </div>
          </div>

          {/* The thesis, restated as a hard fact block. */}
          <div className="border-2 border-indigo-600 bg-indigo-950">
            <div className="border-b-2 border-indigo-600 px-7 py-5">
              <div className="eyebrow">Two questions, never mixed</div>
            </div>
            <dl className="divide-y-2 divide-indigo-800">
              <div className="px-7 py-6">
                <dt className="text-lg font-bold text-bone-100">Song validity</dt>
                <dd className="mt-2 text-[0.9375rem] leading-relaxed text-indigo-300">
                  Can a biblically sound church confidently sing this together in corporate worship?
                </dd>
              </div>
              <div className="px-7 py-6">
                <dt className="text-lg font-bold text-bone-100">Artist validity</dt>
                <dd className="mt-2 text-[0.9375rem] leading-relaxed text-indigo-300">
                  How sound is the artist, on their publicly documented beliefs and teaching?
                </dd>
              </div>
              <div className="bg-volt-500 px-7 py-6">
                <dd className="text-[0.9375rem] font-semibold leading-relaxed text-white">
                  An artist’s score never affects a song’s score. The analysis that produces a song’s theological score
                  is not even told who the artist is.
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </section>
  );
}

async function RecentlyReviewed() {
  const { items } = await safely(() => searchSongs({ sort: 'newest', perPage: 6 }), EMPTY_PAGE);
  if (items.length === 0) return <NothingYet />;

  return (
    <section className="band-bone border-b-2 border-ink-900">
      <div className="container-page py-20">
        <SectionHeading
          eyebrow="Latest"
          title="Recently reviewed"
          description="The most recent songs to complete the review pipeline."
          action={
            <Link
              href="/songs?sort=newest"
              className="text-sm font-bold uppercase tracking-[0.08em] text-volt-600 underline underline-offset-4 hover:text-volt-700"
            >
              View all →
            </Link>
          }
        />
        <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((song) => (
            <SongCard key={song.id} song={song} />
          ))}
        </div>
      </div>
    </section>
  );
}

async function HighestRated() {
  const { items } = await safely(() => searchSongs({ sort: 'score_desc', perPage: 6, minScore: 70 }), EMPTY_PAGE);
  if (items.length === 0) return null;

  return (
    <section className="band-bone-light border-b-2 border-ink-900">
      <div className="container-page py-20">
        <SectionHeading
          eyebrow="Highest rated"
          title="Strongest reviews"
          description="Songs whose theology, singability and clarity all hold up under examination."
          action={
            <Link
              href="/songs?sort=score_desc"
              className="text-sm font-bold uppercase tracking-[0.08em] text-volt-600 underline underline-offset-4 hover:text-volt-700"
            >
              View all →
            </Link>
          }
        />
        <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((song) => (
            <SongCard key={song.id} song={song} />
          ))}
        </div>
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
    <section className="band-bone border-b-2 border-ink-900">
      <div className="container-page py-24">
        <div className="mx-auto max-w-2xl border-2 border-ink-900 bg-bone-50 px-8 py-14 text-center">
          <div className="eyebrow">Database</div>
          <h2 className="mt-4 text-display-sm">No reviews published yet</h2>
          <p className="mx-auto mt-5 max-w-md text-[1.0625rem] leading-relaxed text-ink-600">
            {pending > 0
              ? `${pending} ${pending === 1 ? 'review is' : 'reviews are'} in the queue. Completed reviews appear here as they finish.`
              : 'Reviews appear here once they have been researched and published.'}
          </p>
          <div className="mt-9">
            <ButtonLink href="/request" variant="brand" size="lg">
              Request a song
            </ButtonLink>
          </div>
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
    <section className="band-dark border-b-4 border-volt-500">
      <div className="container-page py-20">
        <SectionHeading
          eyebrow="Method"
          title="Evidence, then analysis, then scoring"
          description="Every number on this site traces back to the finding that produced it. Nothing here is “the AI said so”."
          onDark
        />

        <ol className="mt-14 grid grid-cols-1 gap-px border-2 border-indigo-600 bg-indigo-600 md:grid-cols-3">
          {steps.map((step, index) => (
            <li key={step.title} className="bg-indigo-900 p-8">
              <span className="text-score-sm text-volt-400">{String(index + 1).padStart(2, '0')}</span>
              <h3 className="mt-5 text-2xl font-bold text-bone-100">{step.title}</h3>
              <p className="mt-3 text-[0.9375rem] leading-relaxed text-indigo-200">{step.body}</p>
            </li>
          ))}
        </ol>

        <div className="mt-12">
          <ButtonLink href="/methodology" variant="onDarkGhost" size="lg">
            Read the full methodology
          </ButtonLink>
        </div>
      </div>
    </section>
  );
}

function RequestCta() {
  return (
    <section className="band-volt">
      <div className="container-page py-20 text-center">
        <h2 className="text-display-sm text-white">Can’t find a song?</h2>
        <p className="mx-auto mt-5 max-w-xl font-serif text-xl leading-relaxed text-white/85">
          Request it for review. No account needed — if it has already been reviewed, we’ll take you straight to it.
        </p>
        <div className="mt-10">
          <ButtonLink href="/request" className="bg-indigo-950 text-bone-100 hover:bg-indigo-900" size="lg">
            Request a song for review
          </ButtonLink>
        </div>
      </div>
    </section>
  );
}

function RailSkeleton() {
  return (
    <section className="band-bone border-b-2 border-ink-900">
      <div className="container-page py-20">
        <div className="skeleton h-12 w-72" />
        <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <SongCardSkeleton key={i} />
          ))}
        </div>
      </div>
    </section>
  );
}
