import { describe, expect, it } from 'vitest';
import {
  BUCKET_INFO,
  MAX_NOTE_CHARS,
  MAX_SUBJECT_CHARS,
  NOTE_BUCKETS,
  NOTE_ERRORS,
  isNoteErrorCode,
  parseBucket,
  parseNoteForm,
  parseNoteId,
} from '@/lib/notes-schema';

const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

describe('notes: the three buckets', () => {
  it('are Approved, Maybe and Rejected, in that display order', () => {
    expect([...NOTE_BUCKETS]).toEqual(['APPROVED', 'MAYBE', 'REJECTED']);
  });

  it('each carry a label and a one-line meaning', () => {
    for (const bucket of NOTE_BUCKETS) {
      expect(BUCKET_INFO[bucket].label.length).toBeGreaterThan(0);
      expect(BUCKET_INFO[bucket].blurb.length).toBeGreaterThan(0);
    }
  });

  it('parses only known buckets', () => {
    expect(parseBucket('MAYBE')).toBe('MAYBE');
    expect(parseBucket('maybe')).toBeNull();
    expect(parseBucket('DELETED')).toBeNull();
    expect(parseBucket(undefined)).toBeNull();
  });
});

describe('notes: reading the form', () => {
  it('accepts a note and trims it', () => {
    const r = parseNoteForm(form({ body: '  Keep this one.  ', bucket: 'APPROVED', subject: '  Living Hope ' }));
    expect(r).toEqual({ ok: true, data: { body: 'Keep this one.', bucket: 'APPROVED', subject: 'Living Hope' } });
  });

  it('treats a blank subject as none, not as an empty string', () => {
    const r = parseNoteForm(form({ body: 'x', bucket: 'MAYBE', subject: '   ' }));
    expect(r.ok && r.data.subject).toBeNull();
  });

  it('survives a missing subject field entirely', () => {
    const r = parseNoteForm(form({ body: 'x', bucket: 'MAYBE' }));
    expect(r.ok && r.data.subject).toBeNull();
  });

  it('refuses a blank or whitespace-only note', () => {
    expect(parseNoteForm(form({ body: '', bucket: 'MAYBE' }))).toEqual({ ok: false, code: 'empty' });
    expect(parseNoteForm(form({ body: '   \n  ', bucket: 'MAYBE' }))).toEqual({ ok: false, code: 'empty' });
  });

  it('refuses a note over the length limit, and accepts one exactly at it', () => {
    expect(parseNoteForm(form({ body: 'a'.repeat(MAX_NOTE_CHARS + 1), bucket: 'MAYBE' }))).toEqual({ ok: false, code: 'long' });
    expect(parseNoteForm(form({ body: 'a'.repeat(MAX_NOTE_CHARS), bucket: 'MAYBE' })).ok).toBe(true);
  });

  it('refuses an unknown or missing bucket', () => {
    expect(parseNoteForm(form({ body: 'x', bucket: 'LATER' }))).toEqual({ ok: false, code: 'bucket' });
    expect(parseNoteForm(form({ body: 'x' }))).toEqual({ ok: false, code: 'bucket' });
  });

  it('refuses an over-long subject', () => {
    expect(parseNoteForm(form({ body: 'x', bucket: 'MAYBE', subject: 'a'.repeat(MAX_SUBJECT_CHARS + 1) }))).toEqual({
      ok: false,
      code: 'subject',
    });
  });

  it('keeps line breaks inside the note', () => {
    const r = parseNoteForm(form({ body: 'line one\nline two', bucket: 'MAYBE' }));
    expect(r.ok && r.data.body).toBe('line one\nline two');
  });
});

describe('notes: ids and error codes', () => {
  it('accepts a plausible id and refuses blank or absurd ones', () => {
    expect(parseNoteId('cmtm0j37i0002rpgaz4iflef2')).toBe('cmtm0j37i0002rpgaz4iflef2');
    expect(parseNoteId('')).toBeNull();
    expect(parseNoteId('   ')).toBeNull();
    expect(parseNoteId('x'.repeat(65))).toBeNull();
    expect(parseNoteId(null)).toBeNull();
  });

  it('only ever reflects a known error code into the page', () => {
    for (const code of Object.keys(NOTE_ERRORS)) expect(isNoteErrorCode(code)).toBe(true);
    expect(isNoteErrorCode('<script>alert(1)</script>')).toBe(false);
    expect(isNoteErrorCode('toString')).toBe(false);
    expect(isNoteErrorCode(undefined)).toBe(false);
  });
});
