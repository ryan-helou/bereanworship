import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { env } from '@/lib/env';

/**
 * Health check for the platform.
 *
 * Reports database reachability and whether the review pipeline is configured.
 * Returns 200 when the site can serve traffic — a missing AI key degrades the
 * pipeline but not the site, so it is reported without failing the check.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const started = Date.now();

  try {
    await prisma.$queryRaw`SELECT 1`;

    return NextResponse.json(
      {
        status: 'ok',
        database: 'connected',
        aiPipeline: env.aiConfigured ? 'configured' : 'not_configured',
        adminAuth: env.adminConfigured ? 'configured' : 'not_configured',
        latencyMs: Date.now() - started,
        timestamp: new Date().toISOString(),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        status: 'degraded',
        database: 'unreachable',
        error: error instanceof Error ? error.message.slice(0, 200) : 'unknown',
        timestamp: new Date().toISOString(),
      },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
