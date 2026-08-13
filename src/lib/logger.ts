/**
 * Structured logging for the review pipeline.
 *
 * Hard rule: secrets never reach the log. `redact()` strips anything that
 * looks like a key, token, password or authorization header from structured
 * context before it is serialized.
 */

type Level = 'debug' | 'info' | 'warn' | 'error';

const SENSITIVE_KEY = /(api[-_ ]?key|secret|password|passwd|token|authorization|auth|cookie|session|hash)/i;
const SENSITIVE_VALUE = /\b(sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9]{16,})\b/g;

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[depth-limit]';
  if (value === null || value === undefined) return value;

  if (typeof value === 'string') {
    return value.replace(SENSITIVE_VALUE, '[redacted]');
  }
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1));
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) {
    return { name: value.name, message: redact(value.message, depth + 1), stack: value.stack?.split('\n').slice(0, 4) };
  }

  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SENSITIVE_KEY.test(key) ? '[redacted]' : redact(val, depth + 1);
  }
  return out;
}

function emit(level: Level, event: string, context?: Record<string, unknown>) {
  const line = {
    ts: new Date().toISOString(),
    level,
    event,
    ...(context ? (redact(context) as Record<string, unknown>) : {}),
  };

  const serialized = JSON.stringify(line);
  if (level === 'error') console.error(serialized);
  else if (level === 'warn') console.warn(serialized);
  else console.log(serialized);
}

export const log = {
  debug: (event: string, context?: Record<string, unknown>) => {
    if (process.env.NODE_ENV !== 'production') emit('debug', event, context);
  },
  info: (event: string, context?: Record<string, unknown>) => emit('info', event, context),
  warn: (event: string, context?: Record<string, unknown>) => emit('warn', event, context),
  error: (event: string, context?: Record<string, unknown>) => emit('error', event, context),
};

/** Canonical event names — keeps log queries greppable across the codebase. */
export const events = {
  jobClaimed: 'review_job.claimed',
  jobStarted: 'review_job.started',
  jobStageChanged: 'review_job.stage_changed',
  jobCompleted: 'review_job.completed',
  jobFailed: 'review_job.failed',
  jobRetryScheduled: 'review_job.retry_scheduled',
  researchStarted: 'research.started',
  researchCompleted: 'research.completed',
  reviewCompleted: 'review.completed',
  artistResearchCompleted: 'artist_research.completed',
  artistResearchReused: 'artist_research.reused',
  duplicateDetected: 'import.duplicate_detected',
  importCompleted: 'import.completed',
  requestReceived: 'song_request.received',
  requestDeduplicated: 'song_request.deduplicated',
  adminLogin: 'admin.login',
  adminLoginFailed: 'admin.login_failed',
  rateLimited: 'security.rate_limited',
} as const;
