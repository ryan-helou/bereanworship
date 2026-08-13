import { NextResponse } from 'next/server';
import { suggest } from '@/lib/search';
import { env } from '@/lib/env';
import { clientFingerprint, rateLimit } from '@/lib/ratelimit';

/**
 * Typeahead suggestions for the search box.
 *
 * Read-only and public, but still rate limited — an unthrottled search
 * endpoint is an easy way to hammer the database.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = (url.searchParams.get('q') ?? '').trim().slice(0, 120);

  if (query.length < 2) {
    return NextResponse.json({ suggestions: [] });
  }

  const fingerprint = clientFingerprint(request, env.adminAuthSecret);
  const limit = await rateLimit('suggest', fingerprint, 120, 60);
  if (!limit.allowed) {
    return NextResponse.json(
      { suggestions: [], error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': '60' } },
    );
  }

  try {
    const suggestions = await suggest(query, 8);
    return NextResponse.json(
      { suggestions },
      { headers: { 'Cache-Control': 'private, max-age=30' } },
    );
  } catch {
    // A failing suggestion endpoint must never break the search box; the form
    // still submits and the full-page search still works.
    return NextResponse.json({ suggestions: [] });
  }
}
