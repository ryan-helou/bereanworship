import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { RequestForm } from './request-form';

export const metadata: Metadata = {
  title: 'Request a Song',
  description:
    'Ask for a worship song to be examined against Scripture. No account required — if it has already been reviewed, we will take you straight to it.',
  alternates: { canonical: '/request' },
};

export const dynamic = 'force-dynamic';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function RequestPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const first = (key: string) => {
    const value = params[key];
    const str = Array.isArray(value) ? value[0] : value;
    return str?.trim().slice(0, 200) ?? '';
  };

  const [reviewed, pending] = await Promise.all([
    prisma.song.count({ where: { reviewStatus: 'COMPLETED' } }),
    prisma.songRequest.count({ where: { status: { in: ['PENDING', 'QUEUED'] } } }),
  ]);

  return (
    <>
      <header className="band-dark border-b-4 border-volt-500">
        <div className="container-page py-14 lg:py-20">
          <div className="max-w-3xl">
            <div className="eyebrow">Request</div>
            <h1 className="text-display mt-5 text-bone-100">Request a song</h1>
            <p className="mt-7 max-w-2xl font-serif text-xl leading-relaxed text-indigo-200">
              Tell us what your church sings and we will examine it — biblically, congregationally, and for clarity. No
              account needed.
            </p>
          </div>
        </div>
      </header>

      <div className="band-bone">
        <div className="container-page py-16">
      <div className="grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-16">
        <div className="max-w-2xl">
          <div>
            <RequestForm defaultTitle={first('title')} defaultArtist={first('artist')} />
          </div>
        </div>

        <aside className="space-y-6">
          <div className="border-2 border-ink-900 bg-bone-50 p-6">
            <div className="eyebrow">Database</div>
            <dl className="mt-3 space-y-3">
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-sm text-ink-500">Songs reviewed</dt>
                <dd className="tnum text-lg font-semibold text-ink-900">{reviewed}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-sm text-ink-500">Requests waiting</dt>
                <dd className="tnum text-lg font-semibold text-ink-900">{pending}</dd>
              </div>
            </dl>
          </div>

          <div className="border-2 border-ink-900 bg-bone-50 p-6">
            <h2 className="text-sm font-semibold text-ink-900">Before you request</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-500">
              Search first — the song may already be reviewed. If it is, submitting the form will take you straight to
              it.
            </p>
            <Link
              href="/songs"
              className="mt-3 inline-block text-sm font-medium text-volt-700 underline-offset-4 hover:underline"
            >
              Search the database →
            </Link>
          </div>

          <div className="border-2 border-ink-900 bg-bone-50 p-6">
            <h2 className="text-sm font-semibold text-ink-900">What happens next</h2>
            <ol className="mt-3 space-y-2.5 text-sm leading-relaxed text-ink-500">
              <li className="flex gap-2.5">
                <span className="tnum shrink-0 font-semibold text-volt-700">1</span>
                <span>The song and artist are identified precisely.</span>
              </li>
              <li className="flex gap-2.5">
                <span className="tnum shrink-0 font-semibold text-volt-700">2</span>
                <span>Its theological claims are inventoried and examined against Scripture.</span>
              </li>
              <li className="flex gap-2.5">
                <span className="tnum shrink-0 font-semibold text-volt-700">3</span>
                <span>Congregational suitability and clarity are assessed separately.</span>
              </li>
              <li className="flex gap-2.5">
                <span className="tnum shrink-0 font-semibold text-volt-700">4</span>
                <span>The score is calculated from the findings and published.</span>
              </li>
            </ol>
            <Link
              href="/methodology"
              className="mt-4 inline-block text-sm font-medium text-volt-700 underline-offset-4 hover:underline"
            >
              Read the methodology →
            </Link>
          </div>
        </aside>
      </div>
        </div>
      </div>
    </>
  );
}
