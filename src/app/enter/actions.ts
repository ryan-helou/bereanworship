'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { env } from '@/lib/env';
import { clientFingerprint, rateLimit } from '@/lib/ratelimit';
import { setSiteCookie, verifySitePassword } from '@/lib/site-access';
import { safeNext } from '@/lib/site-gate';
import { log, events } from '@/lib/logger';

export type EnterState = { status: 'idle' } | { status: 'error'; message: string };

const EnterSchema = z.object({
  password: z.string().min(1).max(400),
  next: z.string().max(500).optional(),
});

/**
 * Enter the site.
 *
 * Attempts are rate limited per client, the same limit as the admin sign-in:
 * the password is the only thing standing between the public and the site, so
 * it must not be guessable at speed. A wrong password gets one fixed message.
 */
export async function enter(_prev: EnterState, formData: FormData): Promise<EnterState> {
  const parsed = EnterSchema.safeParse({
    password: formData.get('password') ?? '',
    next: formData.get('next') ?? '',
  });
  if (!parsed.success) return { status: 'error', message: 'Enter the password.' };

  if (!env.siteGateConfigured) {
    return { status: 'error', message: 'Access is not configured on this deployment.' };
  }

  const headerList = await headers();
  const pseudoRequest = new Request('https://bereanworship.local/enter', { headers: headerList });
  const fingerprint = clientFingerprint(pseudoRequest, env.adminAuthSecret);

  const limit = await rateLimit('site_gate', fingerprint, 10, 15 * 60);
  if (!limit.allowed) {
    log.warn(events.adminLoginFailed, { reason: 'site_gate_rate_limited' });
    return { status: 'error', message: 'Too many attempts. Try again in a few minutes.' };
  }

  if (!(await verifySitePassword(parsed.data.password))) {
    log.warn(events.adminLoginFailed, { reason: 'site_gate_wrong_password' });
    return { status: 'error', message: 'That password was not recognised.' };
  }

  await setSiteCookie();
  redirect(safeNext(parsed.data.next) ?? '/');
}
