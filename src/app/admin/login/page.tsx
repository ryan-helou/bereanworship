import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { env } from '@/lib/env';
import { LoginForm } from './login-form';

export const metadata: Metadata = {
  title: 'Admin sign in',
  robots: { index: false, follow: false, nocache: true },
};

export const dynamic = 'force-dynamic';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const session = await getSession();

  const nextRaw = Array.isArray(params.next) ? params.next[0] : params.next;
  // Only same-site relative paths — never an open redirect.
  const next = nextRaw && nextRaw.startsWith('/') && !nextRaw.startsWith('//') ? nextRaw : '/admin';

  if (session) redirect(next);

  const unconfigured = params.error === 'unconfigured' || !env.adminConfigured;

  return (
    <div className="container-page flex min-h-[70vh] items-center justify-center py-16">
      <div className="w-full max-w-sm">
        <div className="text-center">
          <Link href="/" className="text-lg font-semibold tracking-tight text-ink-900">
            Berean<span className="text-volt-700">Worship</span>
          </Link>
          <h1 className="mt-6 text-2xl font-semibold tracking-tight">Administration</h1>
          <p className="mt-2 text-sm text-ink-500">Sign in to manage reviews, imports and the queue.</p>
        </div>

        {unconfigured ? (
          <div className="mt-8 rounded-xl border border-ochre-200 bg-ochre-50 p-5 text-sm leading-relaxed text-ochre-900">
            <p className="font-semibold">Admin access is not configured.</p>
            <p className="mt-2">
              Set <code className="rounded bg-ochre-100 px-1 py-0.5 font-mono text-xs">ADMIN_EMAIL</code>,{' '}
              <code className="rounded bg-ochre-100 px-1 py-0.5 font-mono text-xs">ADMIN_PASSWORD_HASH</code> and a
              32-character <code className="rounded bg-ochre-100 px-1 py-0.5 font-mono text-xs">ADMIN_AUTH_SECRET</code>{' '}
              in the environment, then restart.
            </p>
            <p className="mt-2 font-mono text-xs">node scripts/hash-password.mjs &apos;your-password&apos;</p>
          </div>
        ) : (
          <div className="mt-8">
            <LoginForm next={next} />
          </div>
        )}

        <p className="mt-8 text-center text-xs text-ink-400">
          <Link href="/" className="underline-offset-4 hover:underline">
            Return to BereanWorship
          </Link>
        </p>
      </div>
    </div>
  );
}
