import { expect, test } from '@playwright/test';
import { SignJWT } from 'jose';
import { E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, E2E_AUTH_SECRET, E2E_SITE_PASSWORD } from '../../playwright.config';

/**
 * The site gate, deliberately run with no cookie at all.
 *
 * The brief is that the whole website needs the password. These assert the
 * real thing: every page and API a stranger could reach is refused, nothing of
 * the site leaks into the refusal, and the pass a visitor earns opens the
 * public site and nothing more.
 *
 * Every attempt at the gate counts toward its rate limit (ten per fifteen
 * minutes), so this file keeps its attempts few on purpose.
 */

test.describe('a stranger', () => {
  test('is sent to the gate from every page, and the page they wanted is remembered', async ({ page }) => {
    for (const route of ['/', '/songs', '/songs/amazing-grace-john-newton', '/artists', '/methodology', '/request', '/sitemap.xml']) {
      await page.goto(route);
      await expect(page, `${route} must require the password`).toHaveURL(/\/enter/);
    }

    await page.goto('/songs?sort=score');
    await expect(page).toHaveURL(/\/enter\?next=%2Fsongs%3Fsort%3Dscore/);
  });

  test('is refused the search suggestions, which would otherwise list song titles', async ({ request }) => {
    const response = await request.get('/api/search/suggest?q=abi', { failOnStatusCode: false });
    expect(response.status()).toBe(401);
    expect(await response.text()).not.toContain('suggestions');
  });

  test('learns nothing about the site from the refusal', async ({ page }) => {
    await page.goto('/songs/amazing-grace-john-newton');
    await expect(page.getByText('Amazing Grace')).toHaveCount(0);
    await expect(page.getByRole('navigation', { name: 'Primary' })).toHaveCount(0);
    await expect(page.getByRole('table')).toHaveCount(0);
  });

  test('still reaches the health check, which Railway needs, and robots.txt', async ({ request }) => {
    expect((await request.get('/api/health')).status()).toBe(200);

    const robots = await request.get('/robots.txt');
    expect(robots.status()).toBe(200);
    const body = await robots.text();
    expect(body).toMatch(/Disallow: \/\s/);
    expect(body).toContain('Disallow: /admin');
    // A sitemap behind the password is not worth advertising.
    expect(body).not.toContain('Sitemap:');
  });

  test('meets a gate that is hidden from search engines and offers no way around it', async ({ page }) => {
    await page.goto('/songs');
    await expect(page.getByRole('heading', { level: 1, name: 'This site is private' })).toBeVisible();
    expect(await page.locator('meta[name="robots"]').getAttribute('content')).toContain('noindex');

    // No navigation, no search, no footer: every link would only lead back here.
    await expect(page.getByRole('link', { name: 'Songs' })).toHaveCount(0);
    await expect(page.getByPlaceholder(/search/i)).toHaveCount(0);
    await expect(page.getByRole('contentinfo')).toHaveCount(0);
  });

  test('is told a wrong password was not recognised, and stays at the gate', async ({ page }) => {
    await page.goto('/enter');
    await page.getByLabel('Password').fill('definitely-the-wrong-password');
    await page.getByRole('button', { name: 'Enter' }).click();

    await expect(page.getByRole('alert').filter({ hasText: 'not recognised' })).toBeVisible();
    await expect(page).toHaveURL(/\/enter/);
  });
});

test.describe('a visitor with the site password', () => {
  test('gets the page they asked for, with a cookie scripts cannot read', async ({ page, context }) => {
    await page.goto('/methodology');
    await page.getByLabel('Password').fill(E2E_SITE_PASSWORD);
    await page.getByRole('button', { name: 'Enter' }).click();

    await expect(page).toHaveURL(/\/methodology$/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    const pass = (await context.cookies()).find((c) => c.name === 'bw_site_access');
    expect(pass, 'the site pass cookie').toBeDefined();
    expect(pass?.httpOnly).toBe(true);
    expect(pass?.sameSite).toBe('Lax');
  });

  test('does NOT get the admin area: the site password is not an administrator', async ({ page }) => {
    await page.goto('/enter');
    await page.getByLabel('Password').fill(E2E_SITE_PASSWORD);
    await page.getByRole('button', { name: 'Enter' }).click();
    await expect(page).toHaveURL(/\/$/);

    for (const route of ['/admin', '/admin/notes', '/admin/jobs']) {
      await page.goto(route);
      await expect(page, `${route} must still need an admin sign-in`).toHaveURL(/\/admin\/login/);
    }
  });

  test('cannot be sent to another site by a crafted link', async ({ page, baseURL }) => {
    await page.goto('/enter?next=//evil.example/songs');
    await page.getByLabel('Password').fill(E2E_SITE_PASSWORD);
    await page.getByRole('button', { name: 'Enter' }).click();

    await expect(page).toHaveURL(`${baseURL}/`);
  });
});

test.describe('the administrator', () => {
  test('may also enter with the admin password, so the gate works with nothing new to set up', async ({ page }) => {
    await page.goto('/enter');
    await page.getByLabel('Password').fill(E2E_ADMIN_PASSWORD);
    await page.getByRole('button', { name: 'Enter' }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible();
  });

  test('is let into the whole site by signing in as admin, without the site password', async ({ page }) => {
    await page.goto('/admin/login');
    await page.getByLabel('Email').fill(E2E_ADMIN_EMAIL);
    await page.getByLabel('Password').fill(E2E_ADMIN_PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();

    await page.goto('/songs');
    await expect(page).toHaveURL(/\/songs$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Songs' })).toBeVisible();
  });
});

/**
 * Forged passes. The control comes first: a token this file builds, with the
 * right secret and audience, IS accepted. That is what makes each refusal
 * below mean something, rather than the forgery simply being malformed.
 */
test.describe('forged passes', () => {
  const key = (secret: string) => new TextEncoder().encode(secret);
  const mint = (opts: { secret?: string; audience: string; role: string; issuer?: string; expiresIn?: string }) =>
    new SignJWT({ role: opts.role })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(opts.role === 'admin' ? E2E_ADMIN_EMAIL : 'visitor')
      .setIssuer(opts.issuer ?? 'bereanworship')
      .setAudience(opts.audience)
      .setIssuedAt()
      .setExpirationTime(opts.expiresIn ?? '1h')
      .sign(key(opts.secret ?? E2E_AUTH_SECRET));

  test('a correctly built site pass is accepted, so the refusals below are real', async ({ context, page, baseURL }) => {
    const token = await mint({ audience: 'bereanworship:site', role: 'visitor' });
    await context.addCookies([{ name: 'bw_site_access', value: token, url: baseURL! }]);
    await page.goto('/methodology');
    await expect(page).toHaveURL(/\/methodology$/);
  });

  for (const [label, build] of [
    ['garbage', async () => 'not.a.token'],
    ['one signed with the wrong secret', () => mint({ audience: 'bereanworship:site', role: 'visitor', secret: 'a-completely-different-secret-of-32-chars!!' })],
    ['one that has expired', () => mint({ audience: 'bereanworship:site', role: 'visitor', expiresIn: '-1h' })],
    ['an admin session offered as a site pass', () => mint({ audience: 'bereanworship:admin', role: 'admin' })],
    ['a pass for another audience', () => mint({ audience: 'somewhere-else', role: 'visitor' })],
    ['a pass from another issuer', () => mint({ audience: 'bereanworship:site', role: 'visitor', issuer: 'someone-else' })],
    ['a site pass claiming the admin role', () => mint({ audience: 'bereanworship:site', role: 'admin' })],
  ] as const) {
    test(`refuses ${label}`, async ({ context, page, baseURL }) => {
      await context.addCookies([{ name: 'bw_site_access', value: await build(), url: baseURL! }]);
      await page.goto('/songs');
      await expect(page).toHaveURL(/\/enter/);
    });
  }

  test('a site pass cannot be replayed as an admin session', async ({ context, page, baseURL }) => {
    const token = await mint({ audience: 'bereanworship:site', role: 'visitor' });
    await context.addCookies([{ name: 'bw_admin_session', value: token, url: baseURL! }]);
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/admin\/login/);
  });
});
