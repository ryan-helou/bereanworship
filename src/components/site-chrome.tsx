'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { SearchBar } from './search-bar';

/**
 * Header and footer.
 *
 * The admin area is intentionally absent from the navigation. It is protected
 * by server-side authorization, not by being hard to find, but there is also
 * no reason to advertise it to readers.
 */

const NAV = [
  { href: '/songs', label: 'Songs' },
  { href: '/artists', label: 'Artists' },
  { href: '/methodology', label: 'Methodology' },
  { href: '/request', label: 'Request a Song' },
];

export function SiteHeader() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const isHome = pathname === '/';

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface-0/85 backdrop-blur-xl">
      <div className="container-page">
        <div className="flex h-16 items-center gap-6">
          <Link href="/" className="shrink-0 text-[1.0625rem] font-semibold tracking-tight text-ink-900">
            Berean<span className="text-brand-700">Worship</span>
          </Link>

          <nav aria-label="Primary" className="hidden md:flex md:items-center md:gap-1">
            {NAV.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'rounded-lg px-3 py-2 text-sm transition-colors',
                    active ? 'font-medium text-ink-900' : 'text-ink-500 hover:text-ink-900',
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            {/* The homepage has its own hero search; a second one would be noise. */}
            {!isHome && (
              <div className="hidden w-64 lg:block xl:w-80">
                <SearchBar />
              </div>
            )}

            <button
              type="button"
              onClick={() => setMobileOpen((v) => !v)}
              aria-expanded={mobileOpen}
              aria-controls="mobile-nav"
              aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
              className="-mr-2 inline-flex size-10 items-center justify-center rounded-lg text-ink-600 hover:bg-surface-100 md:hidden"
            >
              <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.75">
                {mobileOpen ? (
                  <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                ) : (
                  <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
                )}
              </svg>
            </button>
          </div>
        </div>
      </div>

      {mobileOpen && (
        <div id="mobile-nav" className="border-t border-line bg-surface-0 md:hidden">
          <div className="container-page py-4">
            <SearchBar className="mb-4" />
            <nav aria-label="Mobile" className="flex flex-col">
              {NAV.map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'rounded-lg px-3 py-3 text-[0.9375rem] transition-colors',
                      active ? 'bg-surface-100 font-medium text-ink-900' : 'text-ink-600',
                    )}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>
      )}
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-line bg-surface-50">
      <div className="container-page py-14">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-[minmax(0,1.6fr)_repeat(2,minmax(0,1fr))]">
          <div className="max-w-sm">
            <div className="text-[1.0625rem] font-semibold tracking-tight text-ink-900">
              Berean<span className="text-brand-700">Worship</span>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-ink-500">
              Worship songs examined against Scripture — for biblical soundness, congregational suitability, and
              clarity, with the evidence and reasoning behind every score.
            </p>
            <p className="mt-5 border-l-2 border-brand-200 pl-4 font-serif text-sm italic leading-relaxed text-ink-500">
              “…they received the word with all eagerness, examining the Scriptures daily to see if these things were
              so.”
              <span className="mt-1 block not-italic text-xs text-ink-400">Acts 17:11</span>
            </p>
          </div>

          <div>
            <div className="eyebrow mb-4">Browse</div>
            <ul className="space-y-2.5 text-sm">
              {NAV.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className="text-ink-500 transition-colors hover:text-ink-900">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <div className="eyebrow mb-4">About</div>
            <ul className="space-y-2.5 text-sm">
              <li>
                <Link href="/methodology" className="text-ink-500 transition-colors hover:text-ink-900">
                  How songs are scored
                </Link>
              </li>
              <li>
                <Link href="/methodology#artist" className="text-ink-500 transition-colors hover:text-ink-900">
                  How artists are researched
                </Link>
              </li>
              <li>
                <Link href="/methodology#limitations" className="text-ink-500 transition-colors hover:text-ink-900">
                  Limitations
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 border-t border-line pt-6">
          <p className="text-xs leading-relaxed text-ink-400">
            Scripture is the ultimate authority. BereanWorship’s ratings are analytical judgements intended to assist
            Christians and churches, and they are not infallible. Readers should exercise biblical discernment
            themselves. Scripture quotations are from the ESV.
          </p>
        </div>
      </div>
    </footer>
  );
}
