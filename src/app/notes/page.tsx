import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { env } from '@/lib/env';
import { hasSiteAccess } from '@/lib/site-access';
import { listAutoRejected, listNotes } from '@/lib/notes';
import { AUTO_REJECTED_ARTISTS } from '@/lib/auto-reject';
import { BUCKET_INFO, NOTE_BUCKETS, type NoteBucketValue } from '@/lib/notes-schema';
import { formatDate } from '@/lib/utils';

export const metadata: Metadata = { title: 'Notes', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const HEAD: Record<NoteBucketValue, string> = {
  APPROVED: 'bg-emerald-700',
  MAYBE: 'bg-amber-600',
  REJECTED: 'bg-red-700',
};

export default async function NotesPage() {
  // Same rule as the note box on a song page: the site password, nothing more.
  if (!env.siteGateEnabled || !(await hasSiteAccess())) redirect('/enter?next=%2Fnotes');

  const [notes, autoRejected] = await Promise.all([listNotes(), listAutoRejected()]);
  const noted = new Set(notes.filter((n) => n.bucket === 'REJECTED' && n.song).map((n) => n.song!.slug));
  const byRule = autoRejected.filter((s) => !noted.has(s.slug));

  return (
    <main className="container-page py-12">
      <h1 className="text-4xl font-bold tracking-tight text-ink-900">Notes</h1>
      <p className="mt-2 max-w-2xl text-ink-600">
        Every verdict, sorted into three buckets. Add one from the box on any song page.
      </p>

      <div className="mt-10 grid items-start gap-6 lg:grid-cols-3">
        {NOTE_BUCKETS.map((bucket) => {
          const items = notes.filter((n) => n.bucket === bucket);
          const extra = bucket === 'REJECTED' ? byRule : [];
          const count = items.length + extra.length;
          return (
            <section key={bucket} aria-labelledby={`b-${bucket}`} className="overflow-hidden rounded-xl border border-line-strong bg-white">
              <header className={`flex items-center justify-between px-5 py-4 text-white ${HEAD[bucket]}`}>
                <h2 id={`b-${bucket}`} className="text-lg font-semibold">
                  {BUCKET_INFO[bucket].label}
                </h2>
                <span className="rounded-full bg-white/20 px-3 py-0.5 text-sm font-semibold tnum">{count}</span>
              </header>
              <ul className="divide-y divide-line">
                {count === 0 && <li className="px-5 py-10 text-center text-sm text-ink-400">Nothing here yet.</li>}
                {items.map((n) => (
                  <li key={n.id} className="px-5 py-4">
                    {n.song ? (
                      <Link href={`/songs/${n.song.slug}#my-note`} className="font-semibold text-ink-900 hover:underline">
                        {n.song.displayTitle}
                      </Link>
                    ) : (
                      <span className="font-semibold text-ink-900">{n.subject ?? 'Untitled'}</span>
                    )}
                    <p className="text-xs text-ink-500">
                      {n.song ? `${n.song.artistName} · ` : ''}
                      {formatDate(n.createdAt)}
                    </p>
                    <p className="mt-2 whitespace-pre-wrap break-words text-sm text-ink-700">{n.body}</p>
                  </li>
                ))}
                {extra.map((s) => (
                  <li key={s.slug} className="px-5 py-4">
                    <Link href={`/songs/${s.slug}#my-note`} className="font-semibold text-ink-900 hover:underline">
                      {s.displayTitle}
                    </Link>
                    <p className="text-xs text-ink-500">{s.artistName}</p>
                    <p className="mt-1 text-sm text-red-700">Rejected automatically ({s.rule}).</p>
                  </li>
                ))}
              </ul>
              {bucket === 'REJECTED' && (
                <p className="border-t border-line bg-bone-50 px-5 py-3 text-xs text-ink-500">
                  Always rejected: {AUTO_REJECTED_ARTISTS.join(', ')}.
                </p>
              )}
            </section>
          );
        })}
      </div>
    </main>
  );
}
