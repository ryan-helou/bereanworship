'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { audit, setSessionCookie } from '@/lib/auth';
import { env } from '@/lib/env';
import { verifyPassword } from '@/lib/password';
import { clientFingerprint, rateLimit } from '@/lib/ratelimit';
import { log, events } from '@/lib/logger';

export type LoginState = { status: 'idle' } | { status: 'error'; message: string };

const LoginSchema = z.object({
  email: z.string().trim().email().max(200),
  password: z.string().min(1).max(400),
  next: z.string().max(500).optional(),
});

/**
 * Admin sign-in.
 *
 * Two properties matter here:
 *   · the failure message never distinguishes a wrong address from a wrong
 *     password, so it cannot be used to enumerate accounts;
 *   · attempts are rate limited per client, so the single admin password
 *     cannot be brute-forced at speed.
 */
export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = LoginSchema.safeParse({
    email: formData.get('email') ?? '',
    password: formData.get('password') ?? '',
    next: formData.get('next') ?? '',
  });

  if (!parsed.success) {
    return { status: 'error', message: 'Enter a valid email address and password.' };
  }

  if (!env.adminConfigured) {
    return { status: 'error', message: 'Admin access is not configured on this deployment.' };
  }

  const headerList = await headers();
  const pseudoRequest = new Request('https://bereanworship.local/admin/login', { headers: headerList });
  const fingerprint = clientFingerprint(pseudoRequest, env.adminAuthSecret);

  const limit = await rateLimit('admin_login', fingerprint, 10, 15 * 60);
  if (!limit.allowed) {
    log.warn(events.adminLoginFailed, { reason: 'rate_limited' });
    return { status: 'error', message: 'Too many sign-in attempts. Try again in a few minutes.' };
  }

  const emailMatches = parsed.data.email.toLowerCase() === env.adminEmail;
  const passwordMatches = await verifyPassword(parsed.data.password, env.adminPasswordHash);

  if (!emailMatches || !passwordMatches) {
    log.warn(events.adminLoginFailed, { emailMatches });
    return { status: 'error', message: 'Those credentials were not recognised.' };
  }

  await setSessionCookie(env.adminEmail);
  await audit(env.adminEmail, 'admin.login');
  log.info(events.adminLogin, {});

  const next = parsed.data.next;
  const target = next && next.startsWith('/') && !next.startsWith('//') ? next : '/admin';
  redirect(target);
}
