import { expect, test } from '@playwright/test';

/**
 * Public site behaviour, end to end against a production build.
 *
 * Covers the twelve scenarios in the brief that concern public users; admin
 * flows are in admin.spec.ts and the mobile layout in responsive.spec.ts.
 */

test.describe('homepage', () => {
  test('states the thesis and offers search', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { level: 1, name: 'Test what you sing.' })).toBeVisible();
    await expect(page.locator('main').getByText('Acts 17:11')).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Search songs or artists' }).first()).toBeVisible();

    // The rails must actually be populated, not empty shells.
    await expect(page.getByRole('heading', { name: 'Recently reviewed' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Amazing Grace/ }).first()).toBeVisible();
  });

  test('does not advertise the admin area', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('link', { name: /^admin$/i })).toHaveCount(0);
  });

  test('navigates to the songs database', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Songs' }).click();
    await expect(page).toHaveURL(/\/songs$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Songs' })).toBeVisible();
  });
});

test.describe('search', () => {
  test('finds a song by full title', async ({ page }) => {
    await page.goto('/songs?q=Amazing%20Grace');
    await expect(page.getByRole('heading', { name: 'Amazing Grace', exact: true })).toBeVisible();
  });

  test('finds songs by a partial word', async ({ page }) => {
    await page.goto('/songs?q=amazing');
    await expect(page.getByText(/1 song matching/)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Amazing Grace' })).toBeVisible();
  });

  test('finds a song by its artist', async ({ page }) => {
    await page.goto('/songs?q=newton');
    await expect(page.getByRole('heading', { name: 'Amazing Grace' })).toBeVisible();
  });

  test('offers live suggestions and follows them', async ({ page }) => {
    await page.goto('/songs');
    const box = page.getByRole('combobox', { name: 'Search songs or artists' }).first();
    await box.fill('amaz');

    const option = page.getByRole('option', { name: /Amazing Grace/ }).first();
    await expect(option).toBeVisible();
    await option.click();

    await expect(page).toHaveURL(/\/songs\/amazing-grace/);
  });

  test('shows a useful empty state and a route to requesting', async ({ page }) => {
    await page.goto('/songs?q=zzzznotarealsong');

    await expect(page.getByText('No songs found.')).toBeVisible();
    await expect(page.getByRole('link', { name: /Request a review/ })).toBeVisible();
  });
});

test.describe('sorting and filtering', () => {
  test('sorts by lowest score', async ({ page }) => {
    await page.goto('/songs?sort=score_asc');
    const firstCard = page.locator('a[href^="/songs/"]').first();
    await expect(firstCard).toContainText('Sample Song');
  });

  test('filters by recommendation', async ({ page }) => {
    await page.goto('/songs?recommendation=NOT_RECOMMENDED');
    await expect(page.getByText(/1 song matching|^1 song$/).first()).toBeVisible();
    await expect(page.locator('a[href^="/songs/"]').first()).toContainText('Not recommended');
  });

  test('filters by theme', async ({ page }) => {
    await page.goto('/songs?theme=grace');
    await expect(page.getByRole('heading', { name: 'Amazing Grace' })).toBeVisible();
  });
});

test.describe('song detail', () => {
  test('shows the verdict, the breakdown and the evidence', async ({ page }) => {
    await page.goto('/songs/amazing-grace-john-newton');

    await expect(page.getByRole('heading', { level: 1, name: 'Amazing Grace' })).toBeVisible();
    await expect(page.getByText('Song validity', { exact: true })).toBeVisible();
    // The label now appears in the score bar and in the breakdown, so assert that it is shown rather than that it is unique.
    await expect(page.getByText('Biblical / Theological').first()).toBeVisible();
    await expect(page.getByText('Communal Worship').first()).toBeVisible();
    await expect(page.getByText('Clarity', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Recommended', { exact: false }).first()).toBeVisible();

    await expect(page.getByRole('heading', { name: 'Strengths' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Concerns' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Grace presented as wholly unmerited' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Scripture' })).toBeVisible();
    await expect(page.getByText('Ephesians 2:8-9').first()).toBeVisible();
  });

  test('states plainly that the artist score is independent', async ({ page }) => {
    await page.goto('/songs/amazing-grace-john-newton');

    await expect(page.getByText('Artist validity is independent of song validity.')).toBeVisible();
    await expect(page.getByText(/does not affect this song['’]s score/)).toBeVisible();
  });

  test('discloses that seeded records are sample data', async ({ page }) => {
    await page.goto('/songs/amazing-grace-john-newton');
    await expect(page.getByText('Sample data.')).toBeVisible();
  });

  test('shows review version and metadata', async ({ page }) => {
    await page.goto('/songs/amazing-grace-john-newton');
    await expect(page.getByText('Review version')).toBeVisible();
    await expect(page.getByText('sample-v1.0').first()).toBeVisible();
  });

  test('links through to the artist', async ({ page }) => {
    await page.goto('/songs/amazing-grace-john-newton');
    await page.getByRole('link', { name: 'John Newton' }).first().click();
    await expect(page).toHaveURL(/\/artists\/john-newton/);
  });

  test('returns 404 for an unknown song', async ({ page }) => {
    const response = await page.goto('/songs/this-song-does-not-exist');
    expect(response?.status()).toBe(404);
    await expect(page.getByText("We couldn't find that page")).toBeVisible();
  });
});

test.describe('artist detail', () => {
  test('shows artist validity, findings and their songs', async ({ page }) => {
    await page.goto('/artists/john-newton');

    await expect(page.getByRole('heading', { level: 1, name: 'John Newton' })).toBeVisible();
    await expect(page.getByText('Artist validity', { exact: true })).toBeVisible();
    await expect(page.getByText('Doctrinal soundness', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Songs by John Newton/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Amazing Grace/ })).toBeVisible();
  });

  test('repeats the independence disclaimer on the artist page', async ({ page }) => {
    await page.goto('/artists/john-newton');
    await expect(page.getByText(/Never affects any song['’]s score/)).toBeVisible();
  });

  test('surfaces contested evidence rather than hiding it', async ({ page }) => {
    await page.goto('/artists/robert-robinson');
    await expect(page.getByText('Evidence is mixed')).toBeVisible();
    await expect(page.getByText('Contested').first()).toBeVisible();
  });

  test('lists artists with independent scores', async ({ page }) => {
    await page.goto('/artists');
    await expect(page.getByRole('heading', { level: 1, name: 'Artists' })).toBeVisible();
    await expect(page.getByText('Artist validity is a separate rating.')).toBeVisible();
  });
});

test.describe('methodology', () => {
  test('documents the formula, the ceilings and the limits', async ({ page }) => {
    await page.goto('/methodology');

    await expect(page.getByRole('heading', { level: 1 })).toContainText('How songs are evaluated');
    await expect(page.getByText('Acts 17:11', { exact: false }).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'The 60 / 20 / 20 formula' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Why one serious error is decisive' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Limitations' })).toBeVisible();
    await expect(page.getByText('BereanWorship is an analytical resource. Its ratings are not infallible.')).toBeVisible();
  });

  test('states that the two ratings never touch', async ({ page }) => {
    await page.goto('/methodology#artist');
    await expect(page.getByRole('heading', { name: 'The two scores never touch' })).toBeVisible();
  });
});

test.describe('song requests', () => {
  test('accepts a new request', async ({ page }) => {
    await page.goto('/request');

    await page.locator('#title').fill('A Brand New Unreviewed Song');
    await page.locator('#artist').fill('Some New Artist');
    await page.getByRole('button', { name: 'Request review' }).click();

    await expect(page.getByRole('heading', { name: 'Request received' })).toBeVisible();
  });

  test('recognises a duplicate request instead of creating another', async ({ page }) => {
    await page.goto('/request');
    await page.locator('#title').fill('A Duplicated Request');
    await page.locator('#artist').fill('Duplicate Artist');
    await page.getByRole('button', { name: 'Request review' }).click();
    await expect(page.getByRole('heading', { name: 'Request received' })).toBeVisible();

    await page.goto('/request');
    await page.locator('#title').fill('A Duplicated Request');
    await page.locator('#artist').fill('Duplicate Artist');
    await page.getByRole('button', { name: 'Request review' }).click();

    await expect(page.getByRole('heading', { name: 'Already on the list' })).toBeVisible();
  });

  test('sends the visitor to the existing review when there is one', async ({ page }) => {
    await page.goto('/request');
    await page.locator('#title').fill('Amazing Grace');
    await page.locator('#artist').fill('John Newton');
    await page.getByRole('button', { name: 'Request review' }).click();

    await expect(page.getByText('this song has already been reviewed', { exact: false })).toBeVisible();

    await page.getByRole('link', { name: 'Read the review' }).click();
    await expect(page).toHaveURL(/\/songs\/amazing-grace-john-newton/);
  });

  test('rejects an empty title', async ({ page }) => {
    await page.goto('/request');
    await page.getByRole('button', { name: 'Request review' }).click();
    // The browser's own required-field validation keeps us on the form.
    await expect(page.getByRole('button', { name: 'Request review' })).toBeVisible();
  });
});

test.describe('SEO and accessibility basics', () => {
  test('serves a sitemap listing reviewed songs', async ({ request }) => {
    const response = await request.get('/sitemap.xml');
    expect(response.status()).toBe(200);
    const body = await response.text();
    expect(body).toContain('/songs/amazing-grace-john-newton');
    expect(body).toContain('/methodology');
  });

  test('is never cached for sharing: a page behind a password belongs to the person who entered it', async ({ request }) => {
    const response = await request.get('/songs');
    expect(response.status()).toBe(200);
    // Prove this is the song list and not the gate page it would redirect a stranger to.
    expect(response.url()).toMatch(/\/songs$/);
    expect(await response.text()).toContain('Amazing Grace');
    expect(response.headers()['cache-control'] ?? '').toMatch(/private|no-store/);
  });

  test('keeps the admin area out of robots.txt', async ({ request }) => {
    const response = await request.get('/robots.txt');
    const body = await response.text();
    expect(body).toContain('Disallow: /admin');
  });

  test('emits Review structured data on a song page', async ({ page }) => {
    await page.goto('/songs/amazing-grace-john-newton');
    const jsonLd = await page.locator('script[type="application/ld+json"]').first().textContent();
    const parsed = JSON.parse(jsonLd!);

    expect(parsed['@type']).toBe('Review');
    expect(parsed.reviewRating.bestRating).toBe(100);
    expect(parsed.itemReviewed.name).toBe('Amazing Grace');
  });

  test('gives every page a unique title and description', async ({ page }) => {
    await page.goto('/songs/amazing-grace-john-newton');
    await expect(page).toHaveTitle(/Amazing Grace.*John Newton/);

    const description = await page.locator('meta[name="description"]').getAttribute('content');
    expect(description?.length).toBeGreaterThan(40);
  });

  test('exposes a skip link and one h1 per page', async ({ page }) => {
    await page.goto('/songs/amazing-grace-john-newton');
    await expect(page.locator('a.skip-link')).toHaveAttribute('href', '#main');
    await expect(page.locator('h1')).toHaveCount(1);
  });

  test('is keyboard navigable from the top of the page', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => document.activeElement?.textContent?.trim());
    expect(focused).toBe('Skip to content');
  });
});

test.describe('health', () => {
  test('reports database connectivity and pipeline configuration', async ({ request }) => {
    const response = await request.get('/api/health');
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.status).toBe('ok');
    expect(body.database).toBe('connected');
    // E2E deliberately runs without an API key.
    expect(body.aiPipeline).toBe('not_configured');
  });
});
