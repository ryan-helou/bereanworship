import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

/**
 * Password hashing with scrypt from the Node standard library.
 *
 * Deliberately dependency-free: bcrypt/argon2 bindings are a recurring source
 * of native-build failures on managed hosts, and scrypt is a memory-hard KDF
 * that is entirely adequate for a single administrative account.
 *
 * ---------------------------------------------------------------------------
 * ENCODING:  scrypt:N:r:p:<salt-base64url>:<hash-base64url>
 * ---------------------------------------------------------------------------
 *
 * The obvious encoding here is the PHC/crypt convention, `scrypt$N$r$p$…`.
 * It must not be used, and the reason is worth recording.
 *
 * This value lives in an environment variable, and environment variables get
 * read out of `.env` files by dotenv — which Next.js runs with *variable
 * expansion* enabled. dotenv-expand reads `$32768`, `$8` and `$1` inside the
 * value as references to other variables, finds nothing, and substitutes the
 * empty string. `scrypt$32768$8$1$SALT$HASH` silently becomes `scryptSALTHASH`
 * and every login attempt fails with "credentials not recognised" — with no
 * hint that the stored hash was destroyed in transit.
 *
 * Colons have no meaning to any shell or to dotenv. base64url avoids `+` and
 * `/`, which keeps the value safe to paste into a URL, a YAML file, or a
 * hosting provider's variable editor without escaping.
 *
 * The legacy `$` form is still accepted on verification so that a hash
 * generated before this change keeps working.
 */

const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem?: number },
) => Promise<Buffer>;

const PARAMS = { N: 2 ** 15, r: 8, p: 1 };
const KEY_LENGTH = 64;
// scrypt's default maxmem (32 MiB) is below what N=2^15, r=8 needs.
const MAXMEM = 128 * PARAMS.N * PARAMS.r * 2;

export const HASH_SEPARATOR = ':';

/**
 * Hard floor. Below this a password is trivially brute-forced even through the
 * login rate limit, so it is refused outright.
 */
export const MIN_PASSWORD_LENGTH = 8;
/** Below this we still accept it, but say so — it is not a good password. */
export const RECOMMENDED_PASSWORD_LENGTH = 12;

export async function hashPassword(password: string): Promise<string> {
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Admin password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  const salt = randomBytes(16);
  const derived = await scrypt(password.normalize('NFKC'), salt, KEY_LENGTH, { ...PARAMS, maxmem: MAXMEM });

  return [
    'scrypt',
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    salt.toString('base64url'),
    derived.toString('base64url'),
  ].join(HASH_SEPARATOR);
}

/**
 * Returns true only for a genuine match.
 *
 * A malformed stored hash and a wrong password both return false, but they are
 * very different problems — one is a misconfigured deployment, the other is
 * routine. The reason is logged (never the password or the hash itself) so a
 * configuration failure is diagnosable rather than silent.
 */
export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const fail = (reason: string): false => {
    console.warn(JSON.stringify({ event: 'password.verify_failed', reason }));
    return false;
  };

  const raw = encoded.trim();
  // Accept both the current `:` encoding and the legacy `$` one.
  const parts = raw.includes(HASH_SEPARATOR) ? raw.split(HASH_SEPARATOR) : raw.split('$');

  if (parts.length !== 6 || parts[0] !== 'scrypt') {
    return fail(
      `malformed hash: expected 6 separated parts, got ${parts.length}. ` +
        `If this value came from a .env file, check that dotenv variable expansion has not eaten it — ` +
        `regenerate with: node scripts/hash-password.mjs '<password>'`,
    );
  }

  const N = Number.parseInt(parts[1], 10);
  const r = Number.parseInt(parts[2], 10);
  const p = Number.parseInt(parts[3], 10);
  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p) || N <= 1) {
    return fail('malformed hash: invalid scrypt parameters');
  }

  // base64url decodes standard base64 too, so both encodings work here.
  const salt = Buffer.from(parts[4], 'base64url');
  const expected = Buffer.from(parts[5], 'base64url');
  if (salt.length === 0 || expected.length === 0) {
    return fail('malformed hash: empty salt or digest');
  }

  let derived: Buffer;
  try {
    derived = await scrypt(password.normalize('NFKC'), salt, expected.length, {
      N,
      r,
      p,
      maxmem: 128 * N * r * 2,
    });
  } catch (error) {
    return fail(`scrypt failed: ${error instanceof Error ? error.message : 'unknown'}`);
  }

  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}
