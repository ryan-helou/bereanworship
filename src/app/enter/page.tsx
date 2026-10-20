import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { env } from '@/lib/env';
import { hasSiteAccess } from '@/lib/site-access';
import { safeNext } from '@/lib/site-gate';
import { EnterForm } from './enter-form';

export const metadata: Metadata = {
  title: 'Enter',
  robots: { index: false, follow: false, nocache: true },
};

export const dynamic = 'force-dynamic';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function EnterPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const nextRaw = Array.isArray(params.next) ? params.next[0] : params.next;
  const next = safeNext(nextRaw) ?? '/';

  // Already in, or the gate is switched off: nothing to ask.
  if (!env.siteGateEnabled || (await hasSiteAccess())) redirect(next);

  return (
    <div className="container-page flex min-h-[70vh] items-center justify-center py-16">
      <div className="w-full max-w-sm">
        <div className="text-center">
          <h1 className="text-2xl font-semibold tracking-tight">This site is private</h1>
          <p className="mt-2 text-sm text-ink-500">Enter the password to continue. Ask Ryan if you do not have it.</p>
        </div>

        {env.siteGateConfigured ? (
          <div className="mt-8">
            <EnterForm next={next} />
          </div>
        ) : (
          <div className="mt-8 rounded-xl border border-ochre-200 bg-ochre-50 p-5 text-sm leading-relaxed text-ochre-900">
            <p className="font-semibold">Access is not configured.</p>
            <p className="mt-2">
              Set <code className="rounded bg-ochre-100 px-1 py-0.5 font-mono text-xs">ADMIN_PASSWORD_HASH</code> (or{' '}
              <code className="rounded bg-ochre-100 px-1 py-0.5 font-mono text-xs">SITE_PASSWORD_HASH</code>) and a
              32-character <code className="rounded bg-ochre-100 px-1 py-0.5 font-mono text-xs">ADMIN_AUTH_SECRET</code>,
              then restart.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
