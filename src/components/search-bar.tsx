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
  onDark = false,
}: {
  initialQuery?: string;
  placeholder?: string;
  size?: 'md' | 'lg';
  autoFocus?: boolean;
  className?: string;
  action?: string;
  /** Rendered against an indigo band rather than the bone reading ground. */
  onDark?: boolean;
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

  const inputHeight = size === 'lg' ? 'h-16 text-lg pl-14 pr-4' : 'h-11 text-sm pl-11 pr-4';

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
              'pointer-events-none absolute top-1/2 -translate-y-1/2',
              onDark ? 'text-indigo-400' : 'text-ink-400',
              size === 'lg' ? 'left-5 size-6' : 'left-3.5 size-4',
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
              'w-full font-semibold transition-colors duration-150 focus:outline-none',
              '[&::-webkit-search-cancel-button]:appearance-none',
              onDark
                ? 'border-2 border-indigo-600 bg-indigo-950 text-bone-100 placeholder:text-indigo-400 focus:border-volt-500'
                : 'border-2 border-ink-900 bg-bone-50 text-ink-900 placeholder:text-ink-400 focus:border-volt-500',
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
          className="absolute z-50 mt-1 w-full overflow-hidden border-2 border-ink-900 bg-bone-50 shadow-[6px_6px_0_0_var(--color-volt-500)]"
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
                  'flex w-full items-center justify-between gap-3 border-b border-line px-4 py-3 text-left transition-colors last:border-0',
                  index === activeIndex ? 'bg-volt-500 text-white' : 'bg-transparent',
                )}
              >
                <span className="min-w-0">
                  <span
                    className={cn(
                      'block truncate text-sm font-bold',
                      index === activeIndex ? 'text-white' : 'text-ink-900',
                    )}
                  >
                    {suggestion.label}
                  </span>
                  {suggestion.sublabel && (
                    <span
                      className={cn(
                        'block truncate text-xs font-semibold uppercase tracking-wider',
                        index === activeIndex ? 'text-white/70' : 'text-ink-400',
                      )}
                    >
                      {suggestion.sublabel}
                    </span>
                  )}
                </span>
                <span className="flex shrink-0 items-center gap-3">
                  {suggestion.score !== null && (
                    <span
                      className={cn(
                        'tnum text-lg font-extrabold',
                        index === activeIndex ? 'text-white' : 'text-ink-700',
                      )}
                    >
                      {suggestion.score}
                    </span>
                  )}
                  <span
                    className={cn(
                      'text-[0.625rem] font-bold uppercase tracking-[0.14em]',
                      index === activeIndex ? 'text-white/70' : 'text-volt-600',
                    )}
                  >
                    {suggestion.type}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
