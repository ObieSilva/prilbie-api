import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { config } from 'dotenv';

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

beforeAll(() => {
  execSync('npx prisma migrate deploy', {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: process.env,
  });
}, 120000);
