import { NextResponse, type NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

/**
 * Edge guard for the admin area.
 *
 * This is the *first* of two checks, not the only one. It keeps unauthenticated
 * traffic from ever reaching admin route code, but every admin page and API
 * handler independently verifies the session server-side as well. A guard that
 * can be bypassed by a routing quirk is not a guard.
 *
 * Deliberately lean: no database, no Prisma, no application imports — only
 * what the edge runtime can cheaply do.
 */

const SESSION_COOKIE = 'bw_admin_session';
const ISSUER = 'bereanworship';
const AUDIENCE = 'bereanworship:admin';

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*'],
};

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // The login page and its action must stay reachable.
  if (pathname === '/admin/login' || pathname === '/api/admin/login') {
    return NextResponse.next();
  }

  const secret = process.env.ADMIN_AUTH_SECRET;
  if (!secret || secret.length < 32) {
    // Misconfiguration must fail closed, and say why.
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Admin authentication is not configured.' }, { status: 503 });
    }
    return NextResponse.redirect(new URL('/admin/login?error=unconfigured', request.url));
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (token) {
    try {
      const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
        issuer: ISSUER,
        audience: AUDIENCE,
        algorithms: ['HS256'],
      });
      if (payload.role === 'admin' && payload.sub) {
        return NextResponse.next();
      }
    } catch {
      // Expired, tampered with, or signed by a rotated secret — treat as absent.
    }
  }

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const loginUrl = new URL('/admin/login', request.url);
  loginUrl.searchParams.set('next', pathname + request.nextUrl.search);
  return NextResponse.redirect(loginUrl);
}
