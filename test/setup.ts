import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { config } from 'dotenv';

import { E2E_FALLBACK_CLERK_WEBHOOK_SECRET } from './helpers/e2e-clerk-webhook-secret';

const envTestPath = resolve(process.cwd(), '.env.test');
if (!existsSync(envTestPath)) {
  throw new Error(
    `Missing ${envTestPath}. Copy .env.test.example to .env.test and set DATABASE_URL (dedicated test DB).`,
  );
}
config({ path: envTestPath, override: true });

if (!process.env.DATABASE_URL?.trim()) {
  throw new Error(
    'DATABASE_URL is missing or empty in .env.test after load (check the file and dotenv parsing).',
  );
}

if (!process.env.CLERK_WEBHOOK_SECRET?.trim()) {
  process.env.CLERK_WEBHOOK_SECRET = E2E_FALLBACK_CLERK_WEBHOOK_SECRET;
}
