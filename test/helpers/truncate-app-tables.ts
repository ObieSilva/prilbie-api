import { execSync } from 'node:child_process';

const truncateAppTablesSql = `
TRUNCATE TABLE
  checkins,
  system_energy_overrides,
  daily_energies,
  daily_reflections,
  ai_messages,
  ai_conversations,
  actions,
  action_bundles,
  areas,
  systems,
  user_profiles
RESTART IDENTITY CASCADE;
`;

/**
 * Runs TRUNCATE via `prisma db execute` in a subprocess. This avoids Neon +
 * Prisma driver-adapter issues with `$executeRawUnsafe` inside the same Jest
 * process that hosts Nest.
 */
export function truncateAppTables(): void {
  execSync('npx prisma db execute --stdin', {
    cwd: process.cwd(),
    input: truncateAppTablesSql,
    env: process.env,
    stdio: ['pipe', 'inherit', 'inherit'],
  });
}
