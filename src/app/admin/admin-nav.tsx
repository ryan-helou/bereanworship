'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { logout } from './actions';

const LINKS = [
  { href: '/admin', label: 'Dashboard', exact: true },
  { href: '/admin/requests', label: 'Requests' },
  { href: '/admin/import', label: 'Bulk import' },
  { href: '/admin/review', label: 'Publish review' },
  { href: '/admin/jobs', label: 'Queue' },
  { href: '/admin/songs', label: 'Songs' },
  { href: '/admin/artists', label: 'Artists' },
  { href: '/admin/sources', label: 'Sources' },
];

export function AdminNav({ email }: { email: string }) {
  const pathname = usePathname();

  return (
    <div className="border-b border-line bg-bone-50">
      <div className="container-page">
        <div className="flex h-14 items-center gap-4">
          <Link href="/admin" className="shrink-0 text-sm font-semibold tracking-tight text-ink-900">
            Berean<span className="text-volt-700">Worship</span>
            <span className="ml-2 rounded bg-indigo-900 px-1.5 py-0.5 text-[0.625rem] font-medium uppercase tracking-wider text-white">
              Admin
            </span>
          </Link>

          <nav aria-label="Admin" className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
            {LINKS.map((link) => {
              const active = link.exact ? pathname === link.href : pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'shrink-0 rounded-lg px-3 py-1.5 text-sm transition-colors',
                    active ? 'bg-bone-200 font-medium text-ink-900' : 'text-ink-500 hover:text-ink-900',
                  )}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex shrink-0 items-center gap-3">
            <Link href="/" className="hidden text-sm text-ink-400 transition-colors hover:text-ink-700 sm:block">
              View site
            </Link>
            <span className="hidden text-xs text-ink-400 lg:block">{email}</span>
            <form action={logout}>
              <button
                type="submit"
                className="rounded-lg px-2.5 py-1.5 text-sm text-ink-500 transition-colors hover:bg-bone-200 hover:text-ink-900"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
