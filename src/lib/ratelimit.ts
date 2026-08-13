import './server-guard';
import { createHmac } from 'node:crypto';
import { prisma } from './db';
import { log, events } from './logger';

/**
 * Database-backed fixed-window rate limiting.
 *
 * Deliberately in Postgres rather than in-memory: the site can run more than
 * one web instance, and an in-memory counter silently stops limiting the
 * moment it scales past one. Correctness beats the microseconds here.
 */

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
}

export async function rateLimit(
  scope: string,
  identifier: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const now = new Date();
  // Fixed windows keyed by epoch bucket so old keys age out predictably.
  const bucket = Math.floor(now.getTime() / (windowSeconds * 1000));
  const key = `${scope}:${identifier}:${bucket}`;
  const expiresAt = new Date((bucket + 1) * windowSeconds * 1000);

  try {
    const record = await prisma.rateLimitBucket.upsert({
      where: { key },
      create: { key, count: 1, expiresAt },
      update: { count: { increment: 1 } },
    });

    const allowed = record.count <= limit;
    if (!allowed) {
      log.warn(events.rateLimited, { scope, limit, windowSeconds, count: record.count });
    }
    return { allowed, remaining: Math.max(0, limit - record.count), resetAt: expiresAt };
  } catch (error) {
    // Fail open on infrastructure trouble — a database blip must not take the
    // public request form offline. The failure is logged loudly.
    log.error('ratelimit.error', { scope, error });
    return { allowed: true, remaining: limit, resetAt: expiresAt };
  }
}

/** Best-effort cleanup of expired buckets; called opportunistically. */
export async function pruneRateLimits(): Promise<number> {
  const result = await prisma.rateLimitBucket.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  return result.count;
}

/**
 * A stable, non-reversible client identifier. Raw IPs are never persisted —
 * only an HMAC keyed with the app secret.
 */
export function clientFingerprint(request: Request, secret: string): string {
  const forwarded = request.headers.get('x-forwarded-for') ?? '';
  const real = request.headers.get('x-real-ip') ?? '';
  const ip = forwarded.split(',')[0]?.trim() || real || 'unknown';
  const ua = request.headers.get('user-agent') ?? '';
  return createHmac('sha256', secret).update(`${ip}|${ua}`).digest('hex').slice(0, 32);
}
