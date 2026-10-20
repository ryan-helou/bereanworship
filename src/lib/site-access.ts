import 'server-only';
import { cookies, headers } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import { env } from './env';
import { getSession } from './auth';
import { verifyPassword } from './password';
import { SITE_AUDIENCE, SITE_COOKIE, SITE_ISSUER, SITE_TTL_SECONDS } from './site-gate';

/**
 * Site access: the read-only pass issued by the password gate.
 *
 * Deliberately a different audience from the admin session, so a site cookie
 * can never be replayed as an admin one. Entering the site password proves you
 * were given it; it does not make you the administrator.
 */

function secretKey(): Uint8Array {
  return new TextEncoder().encode(env.adminAuthSecret);
}

export async function createSiteToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ role: 'visitor' })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject('visitor')
    .setIssuer(SITE_ISSUER)
    .setAudience(SITE_AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(now + SITE_TTL_SECONDS)
    .sign(secretKey());
}

async function verifySiteToken(token: string): Promise<boolean> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      issuer: SITE_ISSUER,
      audience: SITE_AUDIENCE,
      algorithms: ['HS256'],
    });
    return payload.role === 'visitor';
  } catch {
    return false;
  }
}

export async function setSiteCookie(): Promise<void> {
  const store = await cookies();
  // Secure follows the connection the visitor actually used, as Railway's proxy
  // reports it, rather than the environment's name. Production is https, so the
  // cookie is Secure there; over plain http (a local production build, the test
  // server) a Secure cookie would be silently dropped by some browsers and
  // nobody could ever get in.
  const forwarded = (await headers()).get('x-forwarded-proto')?.split(',')[0]?.trim().toLowerCase();
  store.set(SITE_COOKIE, await createSiteToken(), {
    httpOnly: true,
    secure: forwarded === 'https',
    // Lax, not Strict: a link from a message or another site must arrive
    // already signed in, rather than meeting the gate despite a valid cookie.
    sameSite: 'lax',
    path: '/',
    maxAge: SITE_TTL_SECONDS,
  });
}

/** Whether this request may see the public site: a site pass, or any admin session. */
export async function hasSiteAccess(): Promise<boolean> {
  if (!env.siteGateEnabled) return true;
  if (!env.siteGateConfigured) return false;
  const store = await cookies();
  const token = store.get(SITE_COOKIE)?.value;
  if (token && (await verifySiteToken(token))) return true;
  return (await getSession()) !== null;
}

/**
 * Checks a password against the site password and, when one is configured, the
 * admin password too. The admin password is accepted so the gate works the
 * moment it ships, with nothing new to set up; set SITE_PASSWORD_HASH to give
 * out a password that opens the site and nothing else.
 *
 * Every configured hash is checked, with no early exit, so the time taken does
 * not reveal which password matched.
 */
export async function verifySitePassword(password: string): Promise<boolean> {
  const hashes = [env.sitePasswordHash, process.env.ADMIN_PASSWORD_HASH?.trim() || null].filter(
    (h): h is string => Boolean(h),
  );
  let matched = false;
  for (const hash of hashes) {
    if (await verifyPassword(password, hash)) matched = true;
  }
  return matched;
}
