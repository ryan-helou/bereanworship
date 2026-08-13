import Link from 'next/link';
import { cn } from '@/lib/utils';
import { RecommendationBadge, ScorePill, toneOf } from './score';
import { Badge } from './ui';
import type { ArtistListItem, SongListItem } from '@/lib/search';

/** List rows for songs and artists. */

export function SongCard({ song, showArtist = true }: { song: SongListItem; showArtist?: boolean }) {
  return (
    <Link
      href={`/songs/${song.slug}`}
      className="card-hover group block min-w-0 rounded-xl border border-line bg-surface-0 p-5"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[1.0625rem] font-semibold leading-snug text-ink-900 group-hover:text-brand-700">
            {song.displayTitle}
          </h3>
          {showArtist && <p className="mt-1 truncate text-sm text-ink-500">{song.artist.displayName}</p>}
        </div>
        <div className="shrink-0 pt-0.5">
          <ScorePill score={song.overallScore} />
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-line pt-4">
        <ComponentStat label="Biblical" score={song.theologicalScore} />
        <ComponentStat label="Communal" score={song.communalScore} />
        <ComponentStat label="Clarity" score={song.clarityScore} />
      </dl>

      <div className="mt-4 flex flex-wrap items-center gap-2">
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

function ComponentStat({ label, score }: { label: string; score: number | null }) {
  const tone = toneOf(score);
  const toneClass = {
    excellent: 'text-[var(--color-tone-excellent)]',
    strong: 'text-[var(--color-tone-strong)]',
    sound: 'text-[var(--color-tone-sound)]',
    mixed: 'text-[var(--color-tone-mixed)]',
    concern: 'text-[var(--color-tone-concern)]',
    poor: 'text-[var(--color-tone-poor)]',
    unsound: 'text-[var(--color-tone-unsound)]',
  }[tone];

  return (
    <div>
      <dt className="text-[0.6875rem] uppercase tracking-wider text-ink-400">{label}</dt>
      <dd className={cn('tnum mt-0.5 text-sm font-semibold', score === null ? 'text-ink-300' : toneClass)}>
        {score ?? '—'}
      </dd>
    </div>
  );
}

export function ArtistCard({ artist }: { artist: ArtistListItem }) {
  return (
    <Link
      href={`/artists/${artist.slug}`}
      className="card-hover group block min-w-0 rounded-xl border border-line bg-surface-0 p-5"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[1.0625rem] font-semibold leading-snug text-ink-900 group-hover:text-brand-700">
            {artist.displayName}
          </h3>
          <p className="mt-1 text-sm text-ink-500">
            {artist.songCount} reviewed {artist.songCount === 1 ? 'song' : 'songs'}
          </p>
        </div>
        <div className="shrink-0 pt-0.5">
          <ScorePill score={artist.overallScore} />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
        <Badge tone="muted">{artist.type.toLowerCase().replace('_', ' ')}</Badge>
        <span className="text-xs text-ink-400">Artist validity — scored independently of songs</span>
      </div>
    </Link>
  );
}

/** Compact row used on the artist page's own song list. */
export function SongRow({ song }: { song: SongListItem }) {
  return (
    <Link
      href={`/songs/${song.slug}`}
      className="group flex items-center justify-between gap-4 border-b border-line py-4 last:border-0"
    >
      <div className="min-w-0">
        <div className="truncate text-[0.9375rem] font-medium text-ink-900 group-hover:text-brand-700">
          {song.displayTitle}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-400 tnum">
          <span>Biblical {song.theologicalScore ?? '—'}</span>
          <span aria-hidden="true">·</span>
          <span>Communal {song.communalScore ?? '—'}</span>
          <span aria-hidden="true">·</span>
          <span>Clarity {song.clarityScore ?? '—'}</span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-4">
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
    <div className="rounded-xl border border-line bg-surface-0 p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 space-y-2">
          <div className="skeleton h-5 w-3/4 rounded" />
          <div className="skeleton h-4 w-1/3 rounded" />
        </div>
        <div className="skeleton h-8 w-16 rounded" />
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3 border-t border-line pt-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-1.5">
            <div className="skeleton h-2.5 w-12 rounded" />
            <div className="skeleton h-4 w-8 rounded" />
          </div>
        ))}
      </div>
      <div className="mt-4 flex gap-2">
        <div className="skeleton h-5 w-28 rounded-full" />
        <div className="skeleton h-5 w-16 rounded-full" />
      </div>
    </div>
  );
}
