const { execSync } = require('node:child_process');
const { existsSync } = require('node:fs');
const { resolve } = require('node:path');

const { config } = require('dotenv');

/**
 * Runs once before any e2e suite (parent Jest process). Avoids repeated
 * `prisma migrate deploy` and Postgres advisory-lock contention on Neon.
 */
module.exports = async function globalSetupE2e() {
  const envTestPath = resolve(process.cwd(), '.env.test');
  if (!existsSync(envTestPath)) {
    throw new Error(
      `Missing ${envTestPath}. Copy .env.test.example to .env.test and set DATABASE_URL.`,
    );
  }
  config({ path: envTestPath, override: true });
  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error(
      'DATABASE_URL is missing or empty in .env.test after load.',
    );
  }
  execSync('npx prisma migrate deploy', {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: process.env,
  });
};
