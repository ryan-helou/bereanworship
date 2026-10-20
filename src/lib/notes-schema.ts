import { z } from 'zod';

/**
 * Private notes: what a note may contain and how it is validated.
 *
 * Kept free of the database so it can be unit-tested and imported by the page
 * as well as the server actions. The database side lives in `notes.ts`.
 */

/** In display order: Approved, Maybe, Rejected. */
export const NOTE_BUCKETS = ['APPROVED', 'MAYBE', 'REJECTED'] as const;
export type NoteBucketValue = (typeof NOTE_BUCKETS)[number];

export const BUCKET_INFO: Record<NoteBucketValue, { label: string; blurb: string; tone: 'brand' | 'warn' | 'danger' }> = {
  APPROVED: { label: 'Approved', blurb: 'Good to go.', tone: 'brand' },
  MAYBE: { label: 'Maybe', blurb: 'Undecided — needs a second look.', tone: 'warn' },
  REJECTED: { label: 'Rejected', blurb: 'Not for us.', tone: 'danger' },
};

export const MAX_NOTE_CHARS = 5000;
export const MAX_SUBJECT_CHARS = 200;

/** Short codes travel in the redirect URL; the page maps them to these sentences. */
export const NOTE_ERRORS = {
  empty: 'Write something first — a note cannot be blank.',
  long: `Notes are limited to ${MAX_NOTE_CHARS.toLocaleString('en-US')} characters.`,
  bucket: 'Pick Approved, Maybe or Rejected.',
  subject: `"About" is limited to ${MAX_SUBJECT_CHARS} characters.`,
  missing: 'That note no longer exists. It may have been deleted already.',
  failed: 'The note could not be saved. Try again.',
} as const;
export type NoteErrorCode = keyof typeof NOTE_ERRORS;

export const NoteFields = z.object({
  body: z.string().trim().min(1).max(MAX_NOTE_CHARS),
  bucket: z.enum(NOTE_BUCKETS),
  subject: z
    .string()
    .trim()
    .max(MAX_SUBJECT_CHARS)
    .transform((value) => (value === '' ? null : value)),
});
export type NoteFieldsInput = z.infer<typeof NoteFields>;

export const NoteId = z.string().trim().min(1).max(64);

function codeFor(error: z.ZodError): NoteErrorCode {
  const issue = error.issues[0];
  const field = issue?.path[0];
  if (field === 'body') return issue?.code === 'too_big' ? 'long' : 'empty';
  if (field === 'bucket') return 'bucket';
  if (field === 'subject') return 'subject';
  return 'failed';
}

export type ParsedNote = { ok: true; data: NoteFieldsInput } | { ok: false; code: NoteErrorCode };

/** Reads a submitted note form. Missing fields are treated as blank, never as a crash. */
export function parseNoteForm(form: FormData): ParsedNote {
  const parsed = NoteFields.safeParse({
    body: String(form.get('body') ?? ''),
    bucket: String(form.get('bucket') ?? ''),
    subject: String(form.get('subject') ?? ''),
  });
  return parsed.success ? { ok: true, data: parsed.data } : { ok: false, code: codeFor(parsed.error) };
}

export function parseBucket(value: unknown): NoteBucketValue | null {
  const parsed = z.enum(NOTE_BUCKETS).safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function parseNoteId(value: unknown): string | null {
  const parsed = NoteId.safeParse(typeof value === 'string' ? value : '');
  return parsed.success ? parsed.data : null;
}

/** Whether a query-string value is one of our error codes — never reflect arbitrary text into the page. */
export function isNoteErrorCode(value: unknown): value is NoteErrorCode {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(NOTE_ERRORS, value);
}
