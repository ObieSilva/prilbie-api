import type { Prisma } from '@prisma/client';

/**
 * Builds PrismaClient constructor options for the current `DATABASE_URL` / `USE_NEON`.
 * Shared by {@link PrismaService}.
 */
export function createPrismaClientOptions():
  | Prisma.PrismaClientOptions
  | undefined {
  const useNeon = process.env.USE_NEON === 'true';

  if (!useNeon) {
    return undefined;
  }

  // BACKEND_SPEC §2.4 — require() avoids bundling ws/neon in local dev
  /* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
  const { neonConfig } = require('@neondatabase/serverless');
  const { PrismaNeon } = require('@prisma/adapter-neon');
  const ws = require('ws');
  neonConfig.webSocketConstructor = ws;

  const connectionString = process.env.DATABASE_URL;
  if (typeof connectionString !== 'string' || connectionString.length === 0) {
    throw new Error('DATABASE_URL is required when USE_NEON=true');
  }

  // PrismaNeon is a factory: it builds `Pool` from config via `connect()`. Do not pass a Pool instance.
  const adapter = new PrismaNeon({ connectionString });

  return { adapter } as Prisma.PrismaClientOptions;
  /* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
}
