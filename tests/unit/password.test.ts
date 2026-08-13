import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '@/lib/password';

/**
 * Password hashing, and the encoding hazard that motivated its format.
 */

describe('hashPassword', () => {
  it('round-trips a correct password', async () => {
    const hash = await hashPassword('a-sufficiently-long-password');
    expect(await verifyPassword('a-sufficiently-long-password', hash)).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('a-sufficiently-long-password');
    expect(await verifyPassword('a-sufficiently-long-passwore', hash)).toBe(false);
    expect(await verifyPassword('', hash)).toBe(false);
  });

  it('produces a different hash each time', async () => {
    const a = await hashPassword('a-sufficiently-long-password');
    const b = await hashPassword('a-sufficiently-long-password');
    expect(a).not.toBe(b);
  });

  it('refuses a short password', async () => {
    await expect(hashPassword('short')).rejects.toThrow(/at least 12/);
  });

  /**
   * Regression guard for a bug that made admin login impossible on any
   * .env-based deployment: dotenv runs variable expansion over .env values,
   * so a `$`-delimited hash had `$32768`, `$8` and `$1` replaced with empty
   * strings before it ever reached the verifier.
   */
  it('emits a hash containing no characters dotenv would expand', async () => {
    const hash = await hashPassword('a-sufficiently-long-password');

    expect(hash).not.toContain('$');
    expect(hash.split(':')).toHaveLength(6);
    expect(hash.startsWith('scrypt:')).toBe(true);
    // base64url only — safe in URLs, YAML and shell arguments.
    expect(hash).toMatch(/^scrypt:\d+:\d+:\d+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$/);
  });

  it('survives the exact mangling dotenv would apply to the legacy format', async () => {
    const hash = await hashPassword('a-sufficiently-long-password');
    // Simulate dotenv-expand: strip every $VAR reference.
    const mangled = hash.replace(/\$\w+/g, '');
    expect(mangled).toBe(hash);
    expect(await verifyPassword('a-sufficiently-long-password', mangled)).toBe(true);
  });

  it('still verifies a hash generated in the legacy $ encoding', async () => {
    // Hand-built in the old format so existing deployments keep working.
    const modern = await hashPassword('a-sufficiently-long-password');
    const [, n, r, p, salt, digest] = modern.split(':');
    const legacy = ['scrypt', n, r, p, salt, digest].join('$');

    expect(await verifyPassword('a-sufficiently-long-password', legacy)).toBe(true);
    expect(await verifyPassword('wrong-password-entirely', legacy)).toBe(false);
  });

  it('reports a malformed hash rather than treating it as a wrong password', async () => {
    expect(await verifyPassword('anything', 'not-a-hash')).toBe(false);
    expect(await verifyPassword('anything', 'scrypt:32768:8')).toBe(false);
    expect(await verifyPassword('anything', '')).toBe(false);
  });
});
