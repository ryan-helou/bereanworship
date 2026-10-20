import { NextResponse, type NextRequest } from 'next/server';
import { jwtVerify } from 'jose';
import { SITE_AUDIENCE, SITE_COOKIE, SITE_ISSUER, isGateExempt } from '@/lib/site-gate';

/**
 * Edge guard: the whole site sits behind a password, and the admin area behind
 * an admin session.
 *
 * This is the *first* of two checks, not the only one. It keeps unauthenticated
 * traffic from ever reaching page code, but every admin page and action
 * independently verifies the session server-side as well. A guard that can be
 * bypassed by a routing quirk is not a guard.
 *
 * Deliberately lean: no database, no Prisma, no application code beyond the
 * pure path rules in site-gate.ts. Only what the edge runtime can cheaply do.
 *
 * Two credentials, two audiences, so neither can be replayed as the other:
 *   · an admin session (bw_admin_session) opens the admin area and the site;
 *   · a site pass (bw_site_access) opens the public site and nothing else.
 */

const SESSION_COOKIE = 'bw_admin_session';
const ISSUER = 'bereanworship';
const ADMIN_AUDIENCE = 'bereanworship:admin';

// Everything except the build's static assets, which carry no content and must
// load for the gate page to be styled at all.
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};

async function carries(token: string | undefined, secret: string, audience: string, issuer: string, role: string) {
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
      issuer,
      audience,
      algorithms: ['HS256'],
    });
    return payload.role === role && Boolean(payload.sub);
  } catch {
    // Expired, tampered with, or signed by a rotated secret — treat as absent.
    return false;
  }
}

/** A page behind the password is for the person who entered it, never for a shared cache. */
function privately(response: NextResponse): NextResponse {
  response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  return response;
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isApi = pathname.startsWith('/api/');

  // The gate, the health check, robots.txt and the admin sign-in stay reachable.
  if (isGateExempt(pathname)) return NextResponse.next();

  const secret = process.env.ADMIN_AUTH_SECRET;
  const secretOk = Boolean(secret && secret.length >= 32);
  const adminOk = secretOk
    ? await carries(request.cookies.get(SESSION_COOKIE)?.value, secret as string, ADMIN_AUDIENCE, ISSUER, 'admin')
    : false;

  const isAdminArea =
    pathname === '/admin' || pathname.startsWith('/admin/') || pathname === '/api/admin' || pathname.startsWith('/api/admin/');

  if (isAdminArea) {
    if (!secretOk) {
      // Misconfiguration must fail closed, and say why.
      if (isApi) return NextResponse.json({ error: 'Admin authentication is not configured.' }, { status: 503 });
      return NextResponse.redirect(new URL('/admin/login?error=unconfigured', request.url));
    }
    if (adminOk) return NextResponse.next();

    if (isApi) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const loginUrl = new URL('/admin/login', request.url);
    loginUrl.searchParams.set('next', pathname + search);
    return NextResponse.redirect(loginUrl);
  }

  // The public site. SITE_GATE=off reopens it without a code change.
  if (process.env.SITE_GATE?.trim().toLowerCase() === 'off') return NextResponse.next();

  const siteOk = secretOk
    ? await carries(request.cookies.get(SITE_COOKIE)?.value, secret as string, SITE_AUDIENCE, SITE_ISSUER, 'visitor')
    : false;

  if (adminOk || siteOk) return privately(NextResponse.next());

  if (isApi) return privately(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));

  const gateUrl = new URL('/enter', request.url);
  gateUrl.searchParams.set('next', pathname + search);
  return privately(NextResponse.redirect(gateUrl));
}
