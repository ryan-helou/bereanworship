import 'server-only';
import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import { redirect } from 'next/navigation';
import { env } from './env';
import { prisma } from './db';
import type { Prisma } from '@prisma/client';

/**
 * Admin authentication.
 *
 * A signed, httpOnly, SameSite=Strict session cookie carrying a short-lived
 * HS256 JWT. Authorization is checked on the server for every admin route and
 * every admin API handler — the hidden URL is never the control.
 */

export const SESSION_COOKIE = 'bw_admin_session';
export const CSRF_COOKIE = 'bw_csrf';
const SESSION_TTL_SECONDS = 60 * 60 * 8; // 8 hours
const ISSUER = 'bereanworship';
const AUDIENCE = 'bereanworship:admin';

export interface AdminSession {
  email: string;
  issuedAt: number;
  expiresAt: number;
}

function secretKey(): Uint8Array {
  return new TextEncoder().encode(env.adminAuthSecret);
}

export async function createSessionToken(email: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ role: 'admin' })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(email)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(now + SESSION_TTL_SECONDS)
    .sign(secretKey());
}

export async function verifySessionToken(token: string): Promise<AdminSession | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ['HS256'],
    });
    if (!payload.sub || payload.role !== 'admin') return null;
    // The account is single-tenant: a session for a different address than the
    // currently configured admin is stale and must not be honoured.
    if (payload.sub.toLowerCase() !== env.adminEmail) return null;
    return {
      email: payload.sub,
      issuedAt: (payload.iat ?? 0) * 1000,
      expiresAt: (payload.exp ?? 0) * 1000,
    };
  } catch {
    return null;
  }
}

export async function setSessionCookie(email: string): Promise<void> {
  const token = await createSessionToken(email);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
  store.set(CSRF_COOKIE, '', { httpOnly: false, path: '/', maxAge: 0 });
}

/** Returns the current admin session, or null. Never throws. */
export async function getSession(): Promise<AdminSession | null> {
  if (!env.adminConfigured) return null;
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

/** Server-component guard: redirects to the login page when unauthenticated. */
export async function requireSession(returnTo?: string): Promise<AdminSession> {
  const session = await getSession();
  if (!session) {
    const target = returnTo ? `/admin/login?next=${encodeURIComponent(returnTo)}` : '/admin/login';
    redirect(target);
  }
  return session;
}

/**
 * Route-handler guard. Returns a 401 Response when unauthenticated so handlers
 * can `const gate = await requireApiSession(); if (gate instanceof Response) return gate;`
 */
export async function requireApiSession(): Promise<AdminSession | Response> {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return session;
}

// --- CSRF -----------------------------------------------------------------
// Double-submit token: a readable cookie mirrored into an `x-csrf-token`
// header. Combined with SameSite=Strict on the session cookie this closes
// cross-origin state-changing requests.

export async function issueCsrfToken(): Promise<string> {
  const store = await cookies();
  const existing = store.get(CSRF_COOKIE)?.value;
  if (existing && existing.length >= 32) return existing;

  const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
  store.set(CSRF_COOKIE, token, {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
  return token;
}

export async function verifyCsrf(request: Request): Promise<boolean> {
  const store = await cookies();
  const cookieToken = store.get(CSRF_COOKIE)?.value;
  const headerToken = request.headers.get('x-csrf-token');
  if (!cookieToken || !headerToken) return false;
  if (cookieToken.length !== headerToken.length) return false;

  // Constant-time comparison.
  let mismatch = 0;
  for (let i = 0; i < cookieToken.length; i += 1) {
    mismatch |= cookieToken.charCodeAt(i) ^ headerToken.charCodeAt(i);
  }
  return mismatch === 0;
}

export async function audit(
  actor: string,
  action: string,
  target?: string,
  detail?: Record<string, unknown>,
): Promise<void> {
  try {
    await prisma.adminAuditLog.create({
      data: { actor, action, target, detail: (detail ?? undefined) as Prisma.InputJsonValue | undefined },
    });
  } catch {
    // Auditing must never break the action it is recording.
  }
}
