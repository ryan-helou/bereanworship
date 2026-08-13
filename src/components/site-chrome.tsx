'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { SearchBar } from './search-bar';

/**
 * Header and footer.
 *
 * Both are full-bleed indigo, so the page opens and closes on the darkest
 * colour in the system and the bone reading area sits between them like a
 * printed page between covers.
 *
 * The admin area is intentionally absent from the navigation. It is protected
 * by server-side authorization, not by being hard to find, but there is also
 * no reason to advertise it.
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
    <header className="band-dark sticky top-0 z-40 border-b-2 border-volt-500">
      <div className="container-page">
        <div className="flex h-[4.5rem] items-center gap-8">
          <Link
            href="/"
            className="shrink-0 text-lg font-extrabold uppercase tracking-[-0.02em] text-bone-100"
          >
            Berean<span className="text-volt-400">Worship</span>
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
                    'px-3.5 py-2 text-[0.8125rem] font-bold uppercase tracking-[0.08em] transition-colors',
                    active ? 'bg-volt-500 text-white' : 'text-indigo-200 hover:text-bone-100',
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
                <SearchBar onDark />
              </div>
            )}

            <button
              type="button"
              onClick={() => setMobileOpen((v) => !v)}
              aria-expanded={mobileOpen}
              aria-controls="mobile-nav"
              aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
              className="-mr-2 inline-flex size-11 items-center justify-center text-bone-100 hover:bg-indigo-800 md:hidden"
            >
              <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2.25">
                {mobileOpen ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
              </svg>
            </button>
          </div>
        </div>
      </div>

      {mobileOpen && (
        <div id="mobile-nav" className="border-t-2 border-indigo-700 bg-indigo-950 md:hidden">
          <div className="container-page py-5">
            <SearchBar className="mb-5" onDark />
            <nav aria-label="Mobile" className="flex flex-col">
              {NAV.map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'border-b border-indigo-800 px-1 py-4 text-base font-bold uppercase tracking-wider transition-colors',
                      active ? 'text-volt-400' : 'text-indigo-200',
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
    <footer className="band-darker border-t-4 border-volt-500">
      <div className="container-page py-16">
        <div className="grid grid-cols-1 gap-12 md:grid-cols-[minmax(0,1.6fr)_repeat(2,minmax(0,1fr))]">
          <div className="max-w-sm">
            <div className="text-xl font-extrabold uppercase tracking-tight text-bone-100">
              Berean<span className="text-volt-400">Worship</span>
            </div>
            <p className="mt-4 text-[0.9375rem] leading-relaxed text-indigo-200">
              Worship songs examined against Scripture — for biblical soundness, congregational suitability, and
              clarity, with the evidence and reasoning behind every score.
            </p>
            <blockquote className="mt-7 border-l-4 border-volt-500 pl-5 font-serif text-[0.9375rem] italic leading-relaxed text-indigo-200">
              “…they received the word with all eagerness, examining the Scriptures daily to see if these things were
              so.”
              <span className="mt-2 block not-italic text-xs font-bold uppercase tracking-[0.14em] text-volt-400">
                Acts 17:11
              </span>
            </blockquote>
          </div>

          <div>
            <div className="eyebrow mb-5">Browse</div>
            <ul className="space-y-3 text-sm">
              {NAV.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className="font-semibold text-indigo-200 transition-colors hover:text-volt-400">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <div className="eyebrow mb-5">About</div>
            <ul className="space-y-3 text-sm">
              <li>
                <Link href="/methodology" className="font-semibold text-indigo-200 transition-colors hover:text-volt-400">
                  How songs are scored
                </Link>
              </li>
              <li>
                <Link
                  href="/methodology#artist"
                  className="font-semibold text-indigo-200 transition-colors hover:text-volt-400"
                >
                  How artists are researched
                </Link>
              </li>
              <li>
                <Link
                  href="/methodology#limitations"
                  className="font-semibold text-indigo-200 transition-colors hover:text-volt-400"
                >
                  Limitations
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-14 border-t border-indigo-800 pt-7">
          <p className="max-w-4xl text-xs leading-relaxed text-indigo-300">
            Scripture is the ultimate authority. BereanWorship’s ratings are analytical judgements intended to assist
            Christians and churches, and they are not infallible. Readers should exercise biblical discernment
            themselves. Scripture quotations are from the ESV.
          </p>
        </div>
      </div>
    </footer>
  );
}
