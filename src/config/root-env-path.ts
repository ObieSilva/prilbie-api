import { resolve } from 'node:path';

/**
 * Absolute path to the repo-root `.env`.
 * Used by Nest `ConfigModule` and loaded again in `prisma.config.ts` for Prisma CLI (migrate, generate, studio).
 */
export const rootEnvFilePath = resolve(process.cwd(), '.env');
