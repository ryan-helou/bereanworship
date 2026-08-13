import './server-guard';
import { PrismaClient } from '@prisma/client';

/**
 * A single Prisma client per process. Next's dev server re-evaluates modules
 * on every hot reload, so without the global cache you exhaust the connection
 * pool within a few edits.
 */

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export type { Prisma } from '@prisma/client';
