/**
 * The site gate: shared constants and path rules.
 *
 * Kept free of Node APIs, the database and the environment so the edge
 * middleware can import it and the unit tests can exercise it directly.
 *
 * The gate keeps the whole site behind a password. A visitor who enters it
 * gets a read-only pass for the public pages; it is a different credential
 * from an admin session and grants none of its powers.
 */

export const SITE_COOKIE = 'bw_site_access';
export const SITE_AUDIENCE = 'bereanworship:site';
export const SITE_ISSUER = 'bereanworship';
export const SITE_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

/**
 * The only paths a stranger may load.
 *
 *   /enter            the gate itself
 *   /api/health       Railway's health check must work with no cookie
 *   /robots.txt       so crawlers learn they are not welcome
 *   /admin/login      the admin sign-in; an admin session also unlocks the site
 *   /api/admin/login  its API twin
 *
 * Everything else, including the sitemap and the search suggestions, is behind
 * the password: a sitemap alone would list every song title.
 */
const OPEN_PATHS = new Set(['/enter', '/api/health', '/robots.txt', '/admin/login', '/api/admin/login']);

export function isGateExempt(pathname: string): boolean {
  return OPEN_PATHS.has(pathname);
}

/**
 * A post-sign-in destination, or null when it is not safe to follow.
 *
 * Only same-site relative paths. `//host` and `/\host` are read by browsers as
 * a different origin, so a naive "starts with a slash" check is an open
 * redirect. Never bounces back to the gate itself.
 */
export function safeNext(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  if (value.length === 0 || value.length > 500) return null;
  if (!value.startsWith('/') || value.startsWith('//')) return null;
  if (value.includes('\\')) return null;
  if (/[\u0000-\u001f\u007f]/.test(value)) return null;
  if (value === '/enter' || value.startsWith('/enter?') || value.startsWith('/enter/')) return null;
  return value;
}
