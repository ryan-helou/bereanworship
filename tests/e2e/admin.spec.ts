import { expect, test } from '@playwright/test';

/**
 * Authenticated admin flows.
 *
 * Runs with a session restored from storageState (see auth.setup.ts), so the
 * suite signs in exactly once rather than tripping the login rate limit.
 * Unauthenticated access control lives in admin-access.spec.ts.
 */

test.describe('dashboard', () => {
  test('reports database and queue metrics', async ({ page }) => {
    await page.goto('/admin');

    await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
    await expect(page.getByText('Songs reviewed')).toBeVisible();
    await expect(page.getByText('Artists reviewed')).toBeVisible();
    await expect(page.getByText('Average song score')).toBeVisible();
    await expect(page.getByText('Average artist score')).toBeVisible();
    await expect(page.getByText('Pending', { exact: true }).first()).toBeVisible();
  });

  test('says plainly that automated reviews are off, and points at the alternative', async ({ page }) => {
    await page.goto('/admin');
    // E2E runs deliberately without an API key.
    await expect(page.getByText('Automated reviews are turned off')).toBeVisible();
    await expect(page.getByText('ANTHROPIC_API_KEY')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Publish a review' })).toBeVisible();
  });

  test('signs out and the session stops working', async ({ page }) => {
    await page.goto('/admin');
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/admin\/login/);

    await page.goto('/admin/jobs');
    await expect(page).toHaveURL(/\/admin\/login/);
  });
});

test.describe('bulk import', () => {
  test('parses a list, skips existing reviews and queues the rest', async ({ page }) => {
    await page.goto('/admin/import');

    await page.getByLabel('Batch label (optional)').fill('E2E batch');
    await page.getByLabel('Song list').fill(
      [
        'Amazing Grace — John Newton', // already reviewed by the seed
        'In Christ Alone — Keith Getty',
        'Before The Throne Of God Above — Charitie Bancroft',
        'In Christ Alone — Keith Getty', // duplicate within the paste
      ].join('\n'),
    );

    await page.getByRole('button', { name: 'Parse and queue' }).click();

    await expect(page.getByRole('heading', { name: 'Import complete' })).toBeVisible();
    await expect(page.getByText('4 submitted')).toBeVisible();

    // Every line's outcome must be explained, not just counted.
    await expect(page.getByText('Already reviewed').first()).toBeVisible();
    await expect(page.getByText('Duplicate in paste').first()).toBeVisible();
    await expect(page.getByText('Queued', { exact: true }).first()).toBeVisible();
  });

  test('tracks a batch through to the queue', async ({ page }) => {
    await page.goto('/admin/import');
    await page.getByLabel('Song list').fill('A Trackable Song — A Trackable Artist');
    await page.getByRole('button', { name: 'Parse and queue' }).click();

    await expect(page.getByRole('heading', { name: 'Import complete' })).toBeVisible();
    await page.getByRole('link', { name: 'Track this batch' }).click();

    await expect(page).toHaveURL(/\/admin\/jobs\?batch=/);
    await expect(page.getByText('A Trackable Song')).toBeVisible();
  });

  test('queues artist research once per artist, not once per song', async ({ page }) => {
    await page.goto('/admin/import');
    await page.getByLabel('Song list').fill(
      ['Song One — Repeated Artist', 'Song Two — Repeated Artist', 'Song Three — Repeated Artist'].join('\n'),
    );
    await page.getByRole('button', { name: 'Parse and queue' }).click();

    await expect(page.getByRole('heading', { name: 'Import complete' })).toBeVisible();
    await expect(page.getByText(/1 queued for research/)).toBeVisible();
  });

  test('handles a 200-song paste', async ({ page }) => {
    const lines = Array.from({ length: 200 }, (_, i) => `Scale Song ${i + 1} — Scale Artist ${(i % 20) + 1}`);

    await page.goto('/admin/import');
    await page.getByLabel('Batch label (optional)').fill('Two hundred');
    await page.getByLabel('Song list').fill(lines.join('\n'));
    await page.getByRole('button', { name: 'Parse and queue' }).click();

    await expect(page.getByRole('heading', { name: 'Import complete' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('200 submitted')).toBeVisible();
  });
});

test.describe('review queue', () => {
  test('shows progress counts and filters by status', async ({ page }) => {
    await page.goto('/admin/jobs');

    await expect(page.getByRole('heading', { level: 1, name: 'Review queue' })).toBeVisible();
    await expect(page.getByText('Pending', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Completed', { exact: true }).first()).toBeVisible();

    await page.getByRole('link', { name: 'pending', exact: true }).click();
    await expect(page).toHaveURL(/status=PENDING/);
  });

  test('cancels a pending job', async ({ page }) => {
    await page.goto('/admin/import');
    await page.getByLabel('Song list').fill('A Cancellable Song — A Cancellable Artist');
    await page.getByRole('button', { name: 'Parse and queue' }).click();
    await expect(page.getByRole('heading', { name: 'Import complete' })).toBeVisible();

    await page.goto('/admin/jobs?status=PENDING');
    const pendingRow = page.locator('tr', { hasText: 'A Cancellable Song' }).first();
    await expect(pendingRow).toBeVisible();
    await pendingRow.getByRole('button', { name: 'Cancel' }).click();

    // Wait for the mutation to actually land before navigating. Without this
    // the next goto can race the server action's revalidation and read the
    // pre-cancel state, which fails intermittently under a full-suite run.
    await expect(page.locator('tr', { hasText: 'A Cancellable Song' })).toHaveCount(0);

    await page.goto('/admin/jobs?status=CANCELLED');
    await expect(page.getByText('A Cancellable Song')).toBeVisible();
  });
});

test.describe('requests', () => {
  test('lists a public request and queues it for review', async ({ page, browser }) => {
    // Submit as an anonymous member of the public, in a clean context.
    const publicContext = await browser.newContext({ storageState: undefined });
    const publicPage = await publicContext.newPage();
    await publicPage.goto('/request');
    await publicPage.locator('#title').fill('An Admin Queued Song');
    await publicPage.locator('#artist').fill('An Admin Queued Artist');
    await publicPage.getByRole('button', { name: 'Request review' }).click();
    await expect(publicPage.getByRole('heading', { name: 'Request received' })).toBeVisible();
    await publicContext.close();

    await page.goto('/admin/requests');
    const row = page.locator('tr', { hasText: 'An Admin Queued Song' }).first();
    await expect(row).toBeVisible();

    await row.getByRole('button', { name: 'Queue' }).click();
    await expect(page.locator('tr', { hasText: 'An Admin Queued Song' }).first()).toContainText('queued');
  });
});

test.describe('songs, artists and sources', () => {
  test('lists songs including unreviewed ones', async ({ page }) => {
    await page.goto('/admin/songs?q=Amazing+Grace');
    await expect(page.getByRole('heading', { level: 1, name: 'Songs' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Amazing Grace', exact: true })).toBeVisible();
  });

  test('flags a song for attention and clears it again', async ({ page }) => {
    await page.goto('/admin/songs?q=Amazing+Grace');
    const row = () => page.locator('tr', { hasText: 'Amazing Grace' }).first();

    await row().getByRole('button', { name: 'Flag', exact: true }).click();
    await expect(row()).toContainText('Flagged');

    await row().getByRole('button', { name: 'Unflag' }).click();
    await expect(row()).not.toContainText('Flagged');
  });

  test('queues a re-review without disturbing the published one', async ({ page }) => {
    await page.goto('/admin/songs?q=Amazing+Grace');
    await page.locator('tr', { hasText: 'Amazing Grace' }).first().getByRole('button', { name: 'Re-review' }).click();

    // The queue holds hundreds of jobs from the import tests, so assert on the
    // song's own admin row rather than hoping the new job lands on page one.
    await page.goto('/admin/songs?q=Amazing+Grace');
    await expect(page.locator('tr', { hasText: 'Amazing Grace' }).first()).toBeVisible();

    // The published review stays live until a new one actually lands.
    await page.goto('/songs/amazing-grace-john-newton');
    await expect(page.getByRole('heading', { level: 1, name: 'Amazing Grace' })).toBeVisible();
    await expect(page.getByText('Song validity', { exact: true })).toBeVisible();
  });

  test('lists artists with a research refresh action', async ({ page }) => {
    await page.goto('/admin/artists');
    await expect(page.getByRole('heading', { level: 1, name: 'Artists' })).toBeVisible();

    const row = page.locator('tr', { hasText: 'John Newton' }).first();
    await expect(row.getByRole('button', { name: /Refresh research|Research/ })).toBeVisible();
  });

  test('surfaces stale or unresearched artists', async ({ page }) => {
    await page.goto('/admin/artists');
    await expect(page.getByRole('link', { name: /Stale or unresearched/ })).toBeVisible();
  });

  test('shows source credibility tiers and what they mean', async ({ page }) => {
    await page.goto('/admin/sources');
    await expect(page.getByRole('heading', { level: 1, name: 'Sources' })).toBeVisible();
    await expect(page.getByText('TIER 1').first()).toBeVisible();
    await expect(page.getByText('Cannot independently establish a serious claim.')).toBeVisible();
  });
});
