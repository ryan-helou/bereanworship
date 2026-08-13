import Link from 'next/link';
import { cn } from '@/lib/utils';
import { RecommendationBadge, ScorePill, toneOf } from './score';
import { Badge } from './ui';
import type { ArtistListItem, SongListItem } from '@/lib/search';

/**
 * List rows.
 *
 * Hard-edged blocks with a heavy border and a hard offset shadow on hover —
 * printed matter rather than floating cards. The score is the loudest element
 * in the row, as it should be.
 */

const TONE_TEXT = {
  excellent: 'text-volt-700',
  strong: 'text-volt-600',
  sound: 'text-indigo-900',
  mixed: 'text-ochre-700',
  concern: 'text-flare-600',
  poor: 'text-flare-700',
  unsound: 'text-flare-800',
} as const;

export function SongCard({ song, showArtist = true }: { song: SongListItem; showArtist?: boolean }) {
  return (
    <Link
      href={`/songs/${song.slug}`}
      className="lift group block min-w-0 border-2 border-ink-900 bg-bone-50"
    >
      <div className="flex items-stretch justify-between gap-0">
        <div className="min-w-0 flex-1 p-5">
          <h3 className="truncate text-xl font-bold leading-tight tracking-tight text-ink-900 group-hover:text-volt-600">
            {song.displayTitle}
          </h3>
          {showArtist && (
            <p className="mt-1.5 truncate text-sm font-semibold uppercase tracking-wider text-ink-400">
              {song.artist.displayName}
            </p>
          )}
        </div>
        <div className="shrink-0">
          <ScorePill score={song.overallScore} className="h-full min-w-[5.5rem] flex-col justify-center px-4" />
        </div>
      </div>

      <dl className="grid grid-cols-3 border-t-2 border-ink-900">
        <ComponentStat label="Biblical" score={song.theologicalScore} />
        <ComponentStat label="Communal" score={song.communalScore} border />
        <ComponentStat label="Clarity" score={song.clarityScore} border />
      </dl>

      <div className="flex flex-wrap items-center gap-2 border-t-2 border-ink-900 bg-bone-100 p-3">
        <RecommendationBadge recommendation={song.recommendation} size="sm" />
        {song.themes.slice(0, 2).map((theme) => (
          <Badge key={theme} tone="muted">
            {theme}
          </Badge>
        ))}
      </div>
    </Link>
  );
}

function ComponentStat({ label, score, border }: { label: string; score: number | null; border?: boolean }) {
  const toneClass = TONE_TEXT[toneOf(score)];

  return (
    <div className={cn('px-4 py-3', border && 'border-l border-line')}>
      <dt className="text-[0.625rem] font-bold uppercase tracking-[0.12em] text-ink-400">{label}</dt>
      <dd className={cn('tnum mt-1 text-lg font-extrabold', score === null ? 'text-ink-300' : toneClass)}>
        {score ?? '—'}
      </dd>
    </div>
  );
}

export function ArtistCard({ artist }: { artist: ArtistListItem }) {
  return (
    <Link href={`/artists/${artist.slug}`} className="lift group block min-w-0 border-2 border-ink-900 bg-bone-50">
      <div className="flex items-stretch justify-between">
        <div className="min-w-0 flex-1 p-5">
          <h3 className="truncate text-xl font-bold leading-tight tracking-tight text-ink-900 group-hover:text-volt-600">
            {artist.displayName}
          </h3>
          <p className="mt-1.5 text-sm font-semibold uppercase tracking-wider text-ink-400">
            {artist.songCount} reviewed {artist.songCount === 1 ? 'song' : 'songs'}
          </p>
        </div>
        <div className="shrink-0">
          <ScorePill score={artist.overallScore} className="h-full min-w-[5.5rem] flex-col justify-center px-4" />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t-2 border-ink-900 bg-bone-100 p-3">
        <Badge tone="dark">{artist.type.toLowerCase().replace('_', ' ')}</Badge>
        <span className="text-xs text-ink-500">Scored independently of songs</span>
      </div>
    </Link>
  );
}

/** Compact row used on the artist page's own song list. */
export function SongRow({ song }: { song: SongListItem }) {
  return (
    <Link
      href={`/songs/${song.slug}`}
      className="group flex items-center justify-between gap-4 border-b border-line py-4 last:border-0 hover:bg-bone-200"
    >
      <div className="min-w-0 pl-1">
        <div className="truncate text-lg font-bold tracking-tight text-ink-900 group-hover:text-volt-600">
          {song.displayTitle}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-semibold uppercase tracking-wider text-ink-400 tnum">
          <span>Biblical {song.theologicalScore ?? '—'}</span>
          <span>Communal {song.communalScore ?? '—'}</span>
          <span>Clarity {song.clarityScore ?? '—'}</span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <div className="hidden sm:block">
          <RecommendationBadge recommendation={song.recommendation} size="sm" />
        </div>
        <ScorePill score={song.overallScore} />
      </div>
    </Link>
  );
}

export function SongCardSkeleton() {
  return (
    <div className="border-2 border-ink-900 bg-bone-50">
      <div className="flex justify-between gap-4 p-5">
        <div className="flex-1 space-y-2">
          <div className="skeleton h-6 w-3/4" />
          <div className="skeleton h-4 w-1/3" />
        </div>
        <div className="skeleton h-14 w-20" />
      </div>
      <div className="grid grid-cols-3 border-t-2 border-ink-900">
        {[0, 1, 2].map((i) => (
          <div key={i} className={cn('space-y-2 px-4 py-3', i > 0 && 'border-l border-line')}>
            <div className="skeleton h-2.5 w-12" />
            <div className="skeleton h-5 w-8" />
          </div>
        ))}
      </div>
      <div className="flex gap-2 border-t-2 border-ink-900 bg-bone-100 p-3">
        <div className="skeleton h-6 w-28" />
        <div className="skeleton h-6 w-16" />
      </div>
    </div>
  );
}
