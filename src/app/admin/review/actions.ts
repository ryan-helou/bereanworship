'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { audit, getSession } from '@/lib/auth';
import { applyReview, purgeCatalogue, ReviewPayload, type AppliedReview } from '@/lib/manual-review';
import { log } from '@/lib/logger';

async function requireAdmin(): Promise<string> {
  const session = await getSession();
  if (!session) redirect('/admin/login');
  return session.email;
}

export type ApplyState =
  | { status: 'idle' }
  | { status: 'error'; message: string; detail?: string }
  | { status: 'applied'; review: AppliedReview };

export async function applyReviewAction(_prev: ApplyState, formData: FormData): Promise<ApplyState> {
  const actor = await requireAdmin();
  const raw = String(formData.get('payload') ?? '').trim();

  if (!raw) {
    return { status: 'error', message: 'Paste a review payload first.' };
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (error) {
    return {
      status: 'error',
      message: 'That is not valid JSON.',
      detail: error instanceof Error ? error.message : undefined,
    };
  }

  // Validated by the same schemas the pipeline uses — a manual review cannot
  // take a shape the automated pipeline could not have produced.
  const parsed = ReviewPayload.safeParse(json);
  if (!parsed.success) {
    return {
      status: 'error',
      message: 'The payload did not validate against the review schema.',
      detail: JSON.stringify(parsed.error.format(), null, 2).slice(0, 4000),
    };
  }

  try {
    const review = await applyReview(parsed.data);

    await audit(actor, 'review.apply_manual', review.slug, {
      kind: review.kind,
      overall: review.overall,
      reviewVersion: review.reviewVersion,
    });

    revalidatePath('/');
    revalidatePath('/songs');
    revalidatePath('/artists');
    revalidatePath(review.kind === 'song' ? `/songs/${review.slug}` : `/artists/${review.slug}`);
    revalidatePath('/admin');

    return { status: 'applied', review };
  } catch (error) {
    log.error('review.apply_manual_failed', { error });
    return {
      status: 'error',
      message: 'Saving the review failed.',
      detail: error instanceof Error ? error.message : undefined,
    };
  }
}

export type PurgeState = { status: 'idle' } | { status: 'error'; message: string } | { status: 'purged'; message: string };

export async function purgeCatalogueAction(_prev: PurgeState, formData: FormData): Promise<PurgeState> {
  const actor = await requireAdmin();

  // Typed confirmation: a destructive action should not be one stray click.
  const confirmation = String(formData.get('confirm') ?? '').trim();
  if (confirmation !== 'DELETE EVERYTHING') {
    return { status: 'error', message: 'Type DELETE EVERYTHING exactly to confirm.' };
  }

  const before = await purgeCatalogue();
  await audit(actor, 'catalogue.purge', undefined, before);

  revalidatePath('/');
  revalidatePath('/songs');
  revalidatePath('/artists');
  revalidatePath('/admin');

  return {
    status: 'purged',
    message:
      `Removed ${before.songs} songs, ${before.artists} artists, ${before.sources} sources, ` +
      `${before.jobs} jobs and ${before.requests} requests. Themes were kept.`,
  };
}
