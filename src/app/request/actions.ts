'use server';

import { headers } from 'next/headers';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { env } from '@/lib/env';
import { normalizeArtist, normalizeTitle, canonicalize } from '@/lib/normalize';
import { findExistingReview } from '@/lib/reviews';
import { clientFingerprint, rateLimit } from '@/lib/ratelimit';
import { log, events } from '@/lib/logger';

/**
 * Public song requests.
 *
 * Four outcomes, all of them useful to the visitor:
 *   · the song is already reviewed  → send them straight to it;
 *   · it is already requested       → tell them, and count the interest;
 *   · it is new                     → record the request;
 *   · it is malformed or abusive    → reject with a clear reason.
 */

const RequestSchema = z.object({
  title: z.string().trim().min(2, 'Please enter a song title.').max(200, 'That title is too long.'),
  artist: z.string().trim().max(200, 'That artist name is too long.').optional(),
  notes: z.string().trim().max(1000, 'Please keep notes under 1000 characters.').optional(),
  // Honeypot: a real person never fills this in.
  website: z.string().max(0).optional(),
});

export type RequestState =
  | { status: 'idle' }
  | { status: 'error'; message: string; fieldErrors?: Record<string, string> }
  | {
      status: 'already_reviewed';
      message: string;
      song: { title: string; artist: string; slug: string; score: number | null };
    }
  | { status: 'already_requested'; message: string; requestCount: number }
  | { status: 'received'; message: string };

export async function submitSongRequest(_prev: RequestState, formData: FormData): Promise<RequestState> {
  const parsed = RequestSchema.safeParse({
    title: formData.get('title') ?? '',
    artist: formData.get('artist') ?? '',
    notes: formData.get('notes') ?? '',
    website: formData.get('website') ?? '',
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === 'string' && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { status: 'error', message: 'Please correct the highlighted fields.', fieldErrors };
  }

  const { title, artist, notes, website } = parsed.data;

  // Silently accept-and-drop honeypot submissions: telling a bot it was caught
  // only helps it try again differently.
  if (website) {
    log.warn('song_request.honeypot_triggered', {});
    return { status: 'received', message: 'Thank you — your request has been recorded.' };
  }

  // --- Rate limit ---------------------------------------------------------
  const headerList = await headers();
  const pseudoRequest = new Request('https://bereanworship.local/request', { headers: headerList });
  const fingerprint = clientFingerprint(pseudoRequest, env.adminAuthSecret);

  const limit = await rateLimit('song_request', fingerprint, 8, 60 * 60);
  if (!limit.allowed) {
    return {
      status: 'error',
      message:
        'You have submitted several requests recently. Please try again later — this limit exists to keep the queue usable for everyone.',
    };
  }

  const normalizedTitle = normalizeTitle(title);
  // Empty string, not null: see the schema note on SongRequest.normalizedArtist.
  const normalizedArtist = artist ? normalizeArtist(artist) : '';

  if (!normalizedTitle) {
    return {
      status: 'error',
      message: 'That title could not be read. Please try again.',
      fieldErrors: { title: 'Enter a song title.' },
    };
  }

  // --- Already reviewed? --------------------------------------------------
  const existing = await findExistingReview(title, artist);
  if (existing && existing.reviewStatus === 'COMPLETED') {
    log.info(events.requestDeduplicated, { reason: 'already_reviewed', songId: existing.id });

    // Record the interest anyway, resolved — useful signal for the admin.
    await prisma.songRequest
      .upsert({
        where: { request_identity: { normalizedTitle, normalizedArtist } },
        create: {
          rawTitle: canonicalize(title),
          rawArtist: artist ? canonicalize(artist) : null,
          notes: notes || null,
          normalizedTitle,
          normalizedArtist,
          status: 'ALREADY_REVIEWED',
          songId: existing.id,
          submitterHash: fingerprint,
          resolutionNote: 'Matched an existing review at submission time.',
        },
        update: { requestCount: { increment: 1 } },
      })
      .catch(() => undefined);

    return {
      status: 'already_reviewed',
      message: 'Good news — this song has already been reviewed.',
      song: {
        title: existing.displayTitle,
        artist: existing.artist.displayName,
        slug: existing.slug,
        score: existing.overallScore,
      },
    };
  }

  // --- Already requested? -------------------------------------------------
  const pending = await prisma.songRequest.findUnique({
    where: { request_identity: { normalizedTitle, normalizedArtist } },
  });

  if (pending && ['PENDING', 'QUEUED'].includes(pending.status)) {
    const updated = await prisma.songRequest.update({
      where: { id: pending.id },
      data: { requestCount: { increment: 1 } },
    });
    log.info(events.requestDeduplicated, { reason: 'already_requested', requestId: pending.id });

    return {
      status: 'already_requested',
      message:
        pending.status === 'QUEUED'
          ? 'This song has already been requested and is in the review queue.'
          : 'This song has already been requested and is waiting to be queued.',
      requestCount: updated.requestCount,
    };
  }

  // --- New request --------------------------------------------------------
  await prisma.songRequest.upsert({
    where: { request_identity: { normalizedTitle, normalizedArtist } },
    create: {
      rawTitle: canonicalize(title),
      rawArtist: artist ? canonicalize(artist) : null,
      notes: notes || null,
      normalizedTitle,
      normalizedArtist,
      status: 'PENDING',
      submitterHash: fingerprint,
    },
    // A previously completed or rejected request asked for again reopens it.
    update: { status: 'PENDING', requestCount: { increment: 1 }, notes: notes || undefined },
  });

  log.info(events.requestReceived, { normalizedTitle, hasArtist: Boolean(normalizedArtist) });

  return {
    status: 'received',
    message:
      'Request received. It will be published once it has been through the review pipeline — usually within a few days.',
  };
}
