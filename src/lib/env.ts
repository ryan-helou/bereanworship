import './server-guard';

/**
 * Environment access, validated once and centrally.
 *
 * Design note: the app must *boot and serve* even when the AI provider is not
 * configured — browsing an existing review database has nothing to do with
 * running new reviews. So AI config is validated lazily, at the point of use,
 * and a missing key produces a clear job error instead of a dead site.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(
      `Missing required environment variable ${name}. See .env.example for the full list.`,
    );
  }
  return value;
}

function optional(name: string, fallback = ''): string {
  const value = process.env[name];
  return value && value.trim() !== '' ? value : fallback;
}

function optionalInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function optionalBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(raw.trim().toLowerCase());
}

export const isProduction = process.env.NODE_ENV === 'production';
export const isTest = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';

export const env = {
  get databaseUrl(): string {
    return required('DATABASE_URL');
  },

  get adminAuthSecret(): string {
    const secret = required('ADMIN_AUTH_SECRET');
    if (secret.length < 32) {
      throw new Error('ADMIN_AUTH_SECRET must be at least 32 characters. Generate with: openssl rand -base64 48');
    }
    return secret;
  },

  get adminEmail(): string {
    return required('ADMIN_EMAIL').trim().toLowerCase();
  },

  get adminPasswordHash(): string {
    return required('ADMIN_PASSWORD_HASH');
  },

  /**
   * A password that opens the public site and nothing else. Optional: when it
   * is unset the gate accepts the admin password instead.
   */
  get sitePasswordHash(): string | null {
    return process.env.SITE_PASSWORD_HASH?.trim() || null;
  },

  /** The whole site sits behind the password unless SITE_GATE=off. */
  get siteGateEnabled(): boolean {
    return process.env.SITE_GATE?.trim().toLowerCase() !== 'off';
  },

  /** True when there is a password to check and a secret to sign the pass with. */
  get siteGateConfigured(): boolean {
    return Boolean(
      (process.env.SITE_PASSWORD_HASH?.trim() || process.env.ADMIN_PASSWORD_HASH?.trim()) &&
        (process.env.ADMIN_AUTH_SECRET?.length ?? 0) >= 32,
    );
  },

  /** True when an admin account is fully configured; drives a clear login error. */
  get adminConfigured(): boolean {
    return Boolean(
      process.env.ADMIN_EMAIL?.trim() &&
        process.env.ADMIN_PASSWORD_HASH?.trim() &&
        (process.env.ADMIN_AUTH_SECRET?.length ?? 0) >= 32,
    );
  },

  get anthropicApiKey(): string | null {
    const key = process.env.ANTHROPIC_API_KEY;
    return key && key.trim() !== '' ? key.trim() : null;
  },

  get anthropicModel(): string {
    return optional('ANTHROPIC_MODEL', 'claude-opus-5');
  },

  get anthropicBaseUrl(): string | undefined {
    const url = process.env.ANTHROPIC_BASE_URL;
    return url && url.trim() !== '' ? url.trim() : undefined;
  },

  get aiConfigured(): boolean {
    return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
  },

  get workerConcurrency(): number {
    return Math.max(1, Math.min(16, optionalInt('WORKER_CONCURRENCY', 2)));
  },

  get workerPollIntervalMs(): number {
    return Math.max(500, optionalInt('WORKER_POLL_INTERVAL_MS', 4000));
  },

  get workerMaxAttempts(): number {
    return Math.max(1, optionalInt('WORKER_MAX_ATTEMPTS', 3));
  },

  get runInlineWorker(): boolean {
    return optionalBool('RUN_INLINE_WORKER', false);
  },

  get siteUrl(): string {
    const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
    if (explicit) return explicit.replace(/\/+$/, '');
    // Railway injects this for the deployed service.
    const railway = process.env.RAILWAY_PUBLIC_DOMAIN?.trim();
    if (railway) return `https://${railway.replace(/\/+$/, '')}`;
    return 'http://localhost:3000';
  },
};

export const SITE_NAME = 'BereanWorship';
export const SITE_TAGLINE = 'Test what you sing.';
export const SITE_DESCRIPTION =
  'Worship songs examined against Scripture — evaluated for biblical soundness, congregational suitability, and clarity, with sources and reasoning behind every review.';
