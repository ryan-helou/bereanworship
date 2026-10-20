import { expect, test } from '@playwright/test';
import { E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD } from '../../playwright.config';

/**
 * Admin access control, deliberately run *unauthenticated*.
 *
 * The brief is explicit that a hidden URL is not access control, so these
 * tests assert the real thing: every admin route and API refuses an
 * unauthenticated caller, and the login form is not an account oracle.
 */

test.describe('unauthenticated access', () => {
  test('redirects the dashboard to the login page', async ({ page }) => {
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/admin\/login/);
    await expect(page.getByRole('heading', { name: 'Administration' })).toBeVisible();
  });

  test('protects every admin route, not just the dashboard', async ({ page }) => {
    const routes = ['/admin/import', '/admin/jobs', '/admin/requests', '/admin/songs', '/admin/artists', '/admin/sources', '/admin/notes'];

    for (const route of routes) {
      await page.goto(route);
      await expect(page, `${route} must require authentication`).toHaveURL(/\/admin\/login/);
    }
  });

  test('does not leak admin content in the redirect response', async ({ page }) => {
    await page.goto('/admin/songs');
    await expect(page.getByRole('table')).toHaveCount(0);
    await expect(page.getByRole('navigation', { name: 'Admin' })).toHaveCount(0);
  });

  test('preserves the requested page for after sign-in', async ({ page }) => {
    await page.goto('/admin/jobs');
    await expect(page).toHaveURL(/\/admin\/login\?next=%2Fadmin%2Fjobs/);
  });

  test('refuses an unauthenticated admin API call', async ({ request }) => {
    const response = await request.get('/api/admin/status', { failOnStatusCode: false });
    // 401 from the middleware, or 404 if no such handler — never 200.
    expect(response.status()).not.toBe(200);
  });

  test('keeps the admin area out of the public navigation', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: /admin/i })).toHaveCount(0);
    await expect(page.getByRole('contentinfo').getByRole('link', { name: /admin/i })).toHaveCount(0);
  });
});

test.describe('login form', () => {
  test('rejects a wrong password without revealing which field was wrong', async ({ page }) => {
    await page.goto('/admin/login');
    await page.getByLabel('Email').fill(E2E_ADMIN_EMAIL);
    await page.getByLabel('Password').fill('definitely-the-wrong-password');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.locator('form').getByRole('alert')).toContainText('Those credentials were not recognised');
  });

  test('gives an unknown address the identical message', async ({ page }) => {
    await page.goto('/admin/login');
    await page.getByLabel('Email').fill('nobody@example.com');
    await page.getByLabel('Password').fill(E2E_ADMIN_PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();

    // Identical wording: the form must not confirm whether an account exists.
    await expect(page.locator('form').getByRole('alert')).toContainText('Those credentials were not recognised');
  });

  test('is excluded from search engines', async ({ page }) => {
    await page.goto('/admin/login');
    const robots = await page.locator('meta[name="robots"]').getAttribute('content');
    expect(robots).toContain('noindex');
  });
});
