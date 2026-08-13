'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useCallback, useTransition } from 'react';
import { cn } from '@/lib/utils';

/**
 * Filter and sort controls.
 *
 * All state lives in the URL, which keeps filtered views shareable and
 * bookmarkable and means the server renders the correct result set on first
 * paint. Changing a control rewrites the query string and lets the server
 * component re-render; there is no client-side result cache to fall out of
 * sync.
 */

export interface FilterOption {
  value: string;
  label: string;
  count?: number;
}

export function FilterBar({
  themes,
  genres,
  sortOptions,
  showScoreFilters = true,
}: {
  themes: FilterOption[];
  genres: FilterOption[];
  sortOptions: FilterOption[];
  showScoreFilters?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const update = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) params.set(key, value);
      else params.delete(key);
      // Any filter change invalidates the current page position.
      params.delete('page');

      startTransition(() => {
        const qs = params.toString();
        router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      });
    },
    [pathname, router, searchParams],
  );

  const activeCount = ['recommendation', 'theme', 'genre', 'minScore', 'maxScore'].filter((k) =>
    searchParams.get(k),
  ).length;

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-2.5 transition-opacity',
        pending && 'pointer-events-none opacity-60',
      )}
    >
      <Select
        label="Sort"
        value={searchParams.get('sort') ?? ''}
        options={sortOptions}
        placeholder="Relevance"
        onChange={(value) => update('sort', value)}
      />

      <Select
        label="Recommendation"
        value={searchParams.get('recommendation') ?? ''}
        placeholder="Any recommendation"
        options={[
          { value: 'RECOMMENDED', label: 'Recommended' },
          { value: 'RECOMMENDED_WITH_CAUTION', label: 'Recommended with caution' },
          { value: 'NOT_RECOMMENDED', label: 'Not recommended' },
        ]}
        onChange={(value) => update('recommendation', value)}
      />

      {themes.length > 0 && (
        <Select
          label="Theme"
          value={searchParams.get('theme') ?? ''}
          placeholder="Any theme"
          options={themes}
          onChange={(value) => update('theme', value)}
        />
      )}

      {genres.length > 0 && (
        <Select
          label="Genre"
          value={searchParams.get('genre') ?? ''}
          placeholder="Any genre"
          options={genres}
          onChange={(value) => update('genre', value)}
        />
      )}

      {showScoreFilters && (
        <Select
          label="Score"
          value={searchParams.get('minScore') ?? ''}
          placeholder="Any score"
          options={[
            { value: '90', label: '90+ · Excellent' },
            { value: '80', label: '80+ · Strong' },
            { value: '70', label: '70+ · Generally sound' },
            { value: '60', label: '60+ · Mixed and above' },
          ]}
          onChange={(value) => update('minScore', value)}
        />
      )}

      {activeCount > 0 && (
        <button
          type="button"
          onClick={() => {
            const params = new URLSearchParams();
            const q = searchParams.get('q');
            if (q) params.set('q', q);
            startTransition(() => {
              const qs = params.toString();
              router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
            });
          }}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm text-ink-500 transition-colors hover:bg-surface-100 hover:text-ink-900"
        >
          <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.75">
            <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
          </svg>
          Clear {activeCount === 1 ? 'filter' : `${activeCount} filters`}
        </button>
      )}
    </div>
  );
}

function Select({
  label,
  value,
  options,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  options: FilterOption[];
  placeholder: string;
  onChange: (value: string) => void;
}) {
  const active = Boolean(value);

  return (
    <div className="relative">
      <label className="sr-only" htmlFor={`filter-${label}`}>
        {label}
      </label>
      <select
        id={`filter-${label}`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          'h-9 cursor-pointer appearance-none rounded-lg border py-0 pl-3 pr-8 text-sm transition-colors',
          'focus:border-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-100',
          active
            ? 'border-brand-200 bg-brand-50 font-medium text-brand-800'
            : 'border-line bg-surface-0 text-ink-600 hover:border-line-strong',
        )}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
            {option.count !== undefined ? ` (${option.count})` : ''}
          </option>
        ))}
      </select>
      <svg
        viewBox="0 0 16 16"
        className={cn(
          'pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2',
          active ? 'text-brand-600' : 'text-ink-400',
        )}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        aria-hidden="true"
      >
        <path d="M4 6.5 8 10.5 12 6.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
