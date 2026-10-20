import { describe, expect, it } from 'vitest';
import { SITE_AUDIENCE, isGateExempt, safeNext } from '@/lib/site-gate';

describe('site gate: what a stranger may load', () => {
  it('opens only the gate, the health check, robots and the admin sign-in', () => {
    for (const path of ['/enter', '/api/health', '/robots.txt', '/admin/login', '/api/admin/login']) {
      expect(isGateExempt(path), path).toBe(true);
    }
  });

  it('keeps every other page, and the sitemap, behind the password', () => {
    for (const path of ['/', '/songs', '/songs/abide-aaron-williams', '/artists', '/methodology', '/request', '/sitemap.xml']) {
      expect(isGateExempt(path), path).toBe(false);
    }
  });

  it('keeps the search suggestions and the admin area behind the password', () => {
    expect(isGateExempt('/api/search/suggest')).toBe(false);
    expect(isGateExempt('/admin')).toBe(false);
    expect(isGateExempt('/admin/notes')).toBe(false);
  });

  it('does not open a path by prefix or lookalike', () => {
    for (const path of ['/enter/x', '/entering', '/api/health/deep', '/admin/login/', '/admin/login2', '/ENTER', '/robots.txt.bak']) {
      expect(isGateExempt(path), path).toBe(false);
    }
  });

  it('issues the site pass for a different audience than the admin session', () => {
    expect(SITE_AUDIENCE).not.toBe('bereanworship:admin');
  });
});

describe('site gate: where to go after entering', () => {
  it('follows a same-site path, query string included', () => {
    expect(safeNext('/songs')).toBe('/songs');
    expect(safeNext('/songs?sort=score&page=2')).toBe('/songs?sort=score&page=2');
    expect(safeNext('  /methodology  ')).toBe('/methodology');
  });

  it('refuses anything that could leave the site', () => {
    for (const bad of [
      '//evil.example',
      '//evil.example/songs',
      '/\\evil.example',
      '/songs\\..\\admin',
      'https://evil.example',
      'javascript:alert(1)',
      'songs',
      '',
      '   ',
    ]) {
      expect(safeNext(bad), JSON.stringify(bad)).toBeNull();
    }
  });

  it('refuses control characters and absurd lengths', () => {
    expect(safeNext('/songs\n/x')).toBeNull();
    expect(safeNext('/songs\u0000')).toBeNull();
    expect(safeNext('/' + 'a'.repeat(600))).toBeNull();
  });

  it('never bounces a visitor back to the gate', () => {
    expect(safeNext('/enter')).toBeNull();
    expect(safeNext('/enter?next=/songs')).toBeNull();
    expect(safeNext('/enter/anything')).toBeNull();
  });

  it('ignores a value that is not text', () => {
    expect(safeNext(undefined)).toBeNull();
    expect(safeNext(null)).toBeNull();
    expect(safeNext(42)).toBeNull();
    expect(safeNext(['/songs'])).toBeNull();
  });
});
