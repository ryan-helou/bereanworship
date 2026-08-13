'use client';

import { useEffect, useId, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import type { Suggestion } from '@/lib/search';

/**
 * Search input with live suggestions.
 *
 * Implemented as a proper combobox: arrow keys move a virtual cursor, Enter
 * follows the active suggestion or submits the raw query, Escape closes. It
 * degrades to a plain form submit when JavaScript has not loaded, so search
 * works before hydration.
 */

export function SearchBar({
  initialQuery = '',
  placeholder = 'Search songs or artists…',
  size = 'md',
  autoFocus = false,
  className,
  action = '/songs',
}: {
  initialQuery?: string;
  placeholder?: string;
  size?: 'md' | 'lg';
  autoFocus?: boolean;
  className?: string;
  action?: string;
}) {
  const router = useRouter();
  const listId = useId();
  const [query, setQuery] = useState(initialQuery);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [, startTransition] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setSuggestions([]);
      setOpen(false);
      return;
    }

    // Debounce: a keystroke should not cost a round trip.
    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const response = await fetch(`/api/search/suggest?q=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal,
        });
        if (!response.ok) return;
        const data = (await response.json()) as { suggestions: Suggestion[] };
        setSuggestions(data.suggestions ?? []);
        setOpen((data.suggestions ?? []).length > 0);
        setActiveIndex(-1);
      } catch {
        // Aborted or offline — the form still submits normally.
      }
    }, 180);

    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    function onClickOutside(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  function submit(value: string) {
    setOpen(false);
    startTransition(() => {
      router.push(value.trim() ? `${action}?q=${encodeURIComponent(value.trim())}` : action);
    });
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!open && suggestions.length > 0) setOpen(true);
      setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, -1));
    } else if (event.key === 'Enter') {
      if (open && activeIndex >= 0 && suggestions[activeIndex]) {
        event.preventDefault();
        setOpen(false);
        router.push(suggestions[activeIndex].href);
      }
    } else if (event.key === 'Escape') {
      setOpen(false);
      setActiveIndex(-1);
    }
  }

  const inputHeight = size === 'lg' ? 'h-14 text-base pl-13 pr-4' : 'h-11 text-sm pl-11 pr-4';

  return (
    <div ref={containerRef} className={cn('relative w-full', className)}>
      <form
        action={action}
        method="get"
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          submit(query);
        }}
      >
        <div className="relative">
          <svg
            className={cn(
              'pointer-events-none absolute top-1/2 -translate-y-1/2 text-ink-300',
              size === 'lg' ? 'left-4.5 size-5' : 'left-3.5 size-4',
            )}
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            aria-hidden="true"
          >
            <circle cx="9" cy="9" r="6.25" />
            <path d="m13.6 13.6 3.4 3.4" strokeLinecap="round" />
          </svg>

          <input
            type="search"
            name="q"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            onFocus={() => suggestions.length > 0 && setOpen(true)}
            placeholder={placeholder}
            autoFocus={autoFocus}
            autoComplete="off"
            spellCheck={false}
            aria-label="Search songs or artists"
            aria-expanded={open}
            aria-controls={open ? listId : undefined}
            aria-autocomplete="list"
            aria-activedescendant={activeIndex >= 0 ? `${listId}-option-${activeIndex}` : undefined}
            role="combobox"
            className={cn(
              'w-full rounded-xl border border-line bg-surface-0 text-ink-900 shadow-[0_1px_2px_rgb(10_12_16/0.03)]',
              'placeholder:text-ink-300 focus:border-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-100',
              'transition-[border-color,box-shadow] duration-150',
              '[&::-webkit-search-cancel-button]:appearance-none',
              inputHeight,
            )}
          />
        </div>
      </form>

      {open && suggestions.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Search suggestions"
          className="absolute z-50 mt-2 w-full overflow-hidden rounded-xl border border-line bg-surface-0 py-1.5 shadow-[0_4px_6px_-2px_rgb(10_12_16/0.05),0_16px_40px_-12px_rgb(10_12_16/0.2)]"
        >
          {suggestions.map((suggestion, index) => (
            <li key={`${suggestion.type}-${suggestion.href}`}>
              <button
                type="button"
                id={`${listId}-option-${index}`}
                role="option"
                aria-selected={index === activeIndex}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => {
                  setOpen(false);
                  router.push(suggestion.href);
                }}
                className={cn(
                  'flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left transition-colors',
                  index === activeIndex ? 'bg-surface-100' : 'bg-transparent',
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-ink-900">{suggestion.label}</span>
                  {suggestion.sublabel && (
                    <span className="block truncate text-xs text-ink-400">{suggestion.sublabel}</span>
                  )}
                </span>
                <span className="flex shrink-0 items-center gap-2.5">
                  {suggestion.score !== null && (
                    <span className="tnum text-sm font-semibold text-ink-600">{suggestion.score}</span>
                  )}
                  <span className="eyebrow">{suggestion.type}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
