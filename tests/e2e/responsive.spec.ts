import { expect, test } from '@playwright/test';

/**
 * Mobile layout.
 *
 * Runs on an iPhone 13 viewport. The checks that matter are the ones a
 * desktop run cannot catch: the nav collapses to a working menu, and nothing
 * overflows the viewport horizontally.
 */

/** Horizontal overflow is the classic mobile failure and is invisible on desktop. */
async function expectNoHorizontalScroll(page: import('@playwright/test').Page) {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth };
  });
  expect(
    overflow.scrollWidth,
    `page scrolls horizontally: ${overflow.scrollWidth}px content in a ${overflow.clientWidth}px viewport`,
  ).toBeLessThanOrEqual(overflow.clientWidth + 1);
}

test.describe('mobile', () => {
  test('homepage fits the viewport and shows the hero', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Test what you sing.' })).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test('primary navigation collapses into a working menu', async ({ page }) => {
    await page.goto('/');

    // The desktop nav must be hidden at this width.
    await expect(page.getByRole('navigation', { name: 'Primary' })).toBeHidden();

    await page.getByRole('button', { name: 'Open menu' }).click();
    const mobileNav = page.getByRole('navigation', { name: 'Mobile' });
    await expect(mobileNav).toBeVisible();

    await mobileNav.getByRole('link', { name: 'Songs' }).click();
    await expect(page).toHaveURL(/\/songs$/);
  });

  test('song list is usable and does not overflow', async ({ page }) => {
    await page.goto('/songs');
    await expect(page.getByRole('heading', { level: 1, name: 'Songs' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Amazing Grace' })).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test('song detail reflows the score panel without overflowing', async ({ page }) => {
    await page.goto('/songs/amazing-grace-john-newton');

    await expect(page.getByRole('heading', { level: 1, name: 'Amazing Grace' })).toBeVisible();
    await expect(page.getByText('Song validity', { exact: true })).toBeVisible();
    // The label now appears in the score bar and in the breakdown, so assert that it is shown rather than that it is unique.
    await expect(page.getByText('Biblical / Theological').first()).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test('artist page fits the viewport', async ({ page }) => {
    await page.goto('/artists/john-newton');
    await expect(page.getByRole('heading', { level: 1, name: 'John Newton' })).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test('methodology tables scroll inside themselves, not the page', async ({ page }) => {
    await page.goto('/methodology');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test('the request form is fully usable on a phone', async ({ page }) => {
    await page.goto('/request');

    await page.locator('#title').fill('A Mobile Requested Song');
    await page.locator('#artist').fill('A Mobile Artist');
    await expectNoHorizontalScroll(page);

    await page.getByRole('button', { name: 'Request review' }).click();
    await expect(page.getByRole('heading', { name: 'Request received' })).toBeVisible();
  });

  test('tap targets on the song card are large enough', async ({ page }) => {
    await page.goto('/songs');
    const card = page.getByRole('link', { name: /Amazing Grace/ }).first();
    await expect(card).toBeVisible();
    const box = await card.boundingBox();

    expect(box).not.toBeNull();
    // Comfortably above the 44px minimum for a primary tap target.
    expect(box!.height).toBeGreaterThanOrEqual(44);
  });
});
