import { expect, test as setup } from '@playwright/test';
import {
  E2E_ADMIN_EMAIL,
  E2E_ADMIN_PASSWORD,
  E2E_SITE_PASSWORD,
  ADMIN_STORAGE_STATE,
  SITE_STORAGE_STATE,
} from '../../playwright.config';

/**
 * Signs in once and saves the session for the admin project.
 *
 * Not just a speed optimisation: admin sign-in is rate limited to 10 attempts
 * per fifteen minutes, and a suite that logs in for every test would trip its
 * own defences. Weakening the limit for tests would be the wrong trade — the
 * limit is there to make the single admin password unbruteforceable.
 */
setup('authenticate as admin', async ({ page }) => {
  await page.goto('/admin/login');

  await page.getByLabel('Email').fill(E2E_ADMIN_EMAIL);
  await page.getByLabel('Password').fill(E2E_ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();

  await page.context().storageState({ path: ADMIN_STORAGE_STATE });
});

/**
 * Enters the site through the gate with the *site* password, in a fresh
 * context that holds no admin cookie. The public and mobile projects run as
 * this visitor, so they exercise the public site the way a stranger who was
 * given the password would see it, not as an administrator.
 */
setup('enter the site as a visitor', async ({ page }) => {
  await page.goto('/songs');
  await expect(page).toHaveURL(/\/enter/);

  await page.getByLabel('Password').fill(E2E_SITE_PASSWORD);
  await page.getByRole('button', { name: 'Enter' }).click();

  await expect(page).toHaveURL(/\/songs$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Songs' })).toBeVisible();

  await page.context().storageState({ path: SITE_STORAGE_STATE });
});
