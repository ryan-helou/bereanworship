#!/usr/bin/env node
/**
 * Generates an ADMIN_PASSWORD_HASH value.
 *
 *   node scripts/hash-password.mjs 'my-long-admin-password'
 *
 * The plaintext is never written anywhere — copy the printed hash into your
 * environment (locally .env, in production the Railway variable).
 *
 * The encoding uses `:` separators rather than the conventional `$` ones.
 * That is deliberate: dotenv runs variable expansion over .env values, so a
 * `scrypt$32768$8$1$…` hash has its `$32768`, `$8` and `$1` silently replaced
 * with empty strings, and login then fails with no usable diagnostic. See the
 * note in src/lib/password.ts.
 */
import { randomBytes, scrypt as scryptCb } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb);
const PARAMS = { N: 2 ** 15, r: 8, p: 1 };
const KEY_LENGTH = 64;

const password = process.argv[2];

if (!password) {
  console.error('Usage: node scripts/hash-password.mjs <password>');
  process.exit(1);
}

if (password.length < 12) {
  console.error('Refusing: admin password must be at least 12 characters.');
  process.exit(1);
}

const salt = randomBytes(16);
const derived = await scrypt(password.normalize('NFKC'), salt, KEY_LENGTH, {
  ...PARAMS,
  maxmem: 128 * PARAMS.N * PARAMS.r * 2,
});

const encoded = [
  'scrypt',
  PARAMS.N,
  PARAMS.r,
  PARAMS.p,
  salt.toString('base64url'),
  derived.toString('base64url'),
].join(':');

console.log('\nADMIN_PASSWORD_HASH:\n');
console.log(encoded);
console.log('\nPaste this into your .env (local) or Railway variables (production).');
console.log('Also generate a session secret:  openssl rand -base64 48\n');
