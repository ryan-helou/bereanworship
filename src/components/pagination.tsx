import Link from 'next/link';
import { cn } from '@/lib/utils';

/**
 * Server-rendered pagination. Real links, so pages are crawlable, shareable,
 * and work without JavaScript.
 */

export function Pagination({
  page,
  totalPages,
  total,
  perPage,
  basePath,
  searchParams,
}: {
  page: number;
  totalPages: number;
  total: number;
  perPage: number;
  basePath: string;
  searchParams: Record<string, string | undefined>;
}) {
  if (totalPages <= 1) {
    return total > 0 ? (
      <p className="text-sm text-ink-400 tnum">
        {total} {total === 1 ? 'result' : 'results'}
      </p>
    ) : null;
  }

  const href = (targetPage: number) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(searchParams)) {
      if (value && key !== 'page') params.set(key, value);
    }
    if (targetPage > 1) params.set('page', String(targetPage));
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };

  const first = (page - 1) * perPage + 1;
  const last = Math.min(page * perPage, total);

  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-4">
      <p className="text-sm text-ink-400 tnum">
        {first}–{last} of {total}
      </p>

      <div className="flex items-center gap-1">
        <PageLink href={href(page - 1)} disabled={page <= 1} label="Previous page">
          <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.75">
            <path d="M12 4 6.5 10 12 16" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </PageLink>

        {pageWindow(page, totalPages).map((item, index) =>
          item === 'gap' ? (
            <span key={`gap-${index}`} className="px-2 text-sm text-ink-300" aria-hidden="true">
              …
            </span>
          ) : (
            <Link
              key={item}
              href={href(item)}
              aria-current={item === page ? 'page' : undefined}
              aria-label={`Page ${item}`}
              className={cn(
                'tnum inline-flex h-9 min-w-9 items-center justify-center rounded-lg px-2.5 text-sm transition-colors',
                item === page
                  ? 'bg-indigo-900 font-medium text-white'
                  : 'text-ink-600 hover:bg-bone-200 hover:text-ink-900',
              )}
            >
              {item}
            </Link>
          ),
        )}

        <PageLink href={href(page + 1)} disabled={page >= totalPages} label="Next page">
          <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.75">
            <path d="M8 4l5.5 6L8 16" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </PageLink>
      </div>
    </nav>
  );
}

function PageLink({
  href,
  disabled,
  label,
  children,
}: {
  href: string;
  disabled: boolean;
  label: string;
  children: React.ReactNode;
}) {
  if (disabled) {
    return (
      <span
        aria-disabled="true"
        aria-label={label}
        className="inline-flex size-9 items-center justify-center rounded-lg text-ink-200"
      >
        {children}
      </span>
    );
  }
  return (
    <Link
      href={href}
      aria-label={label}
      className="inline-flex size-9 items-center justify-center rounded-lg text-ink-600 transition-colors hover:bg-bone-200 hover:text-ink-900"
    >
      {children}
    </Link>
  );
}

/** 1 … 4 5 [6] 7 8 … 20 */
function pageWindow(page: number, totalPages: number): Array<number | 'gap'> {
  const pages = new Set<number>([1, totalPages, page]);
  for (let offset = 1; offset <= 2; offset += 1) {
    if (page - offset > 1) pages.add(page - offset);
    if (page + offset < totalPages) pages.add(page + offset);
  }

  const sorted = [...pages].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);
  const out: Array<number | 'gap'> = [];

  for (let i = 0; i < sorted.length; i += 1) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) out.push('gap');
    out.push(sorted[i]);
  }
  return out;
}
