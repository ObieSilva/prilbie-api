import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { config } from 'dotenv';

import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/configure-app';

import { E2E_FALLBACK_CLERK_WEBHOOK_SECRET } from './e2e-clerk-webhook-secret';
import { TEST_CLERK_USER_ID } from './mock-auth';

const testEnvPath = resolve(process.cwd(), '.env.test');

let testEnvLoaded = false;

/** Loads `.env.test` once so `DATABASE_URL` and other vars exist before Nest bootstraps. */
export function loadTestEnv(): void {
  if (testEnvLoaded) {
    return;
  }
  if (!existsSync(testEnvPath)) {
    throw new Error(
      `Missing ${testEnvPath}. Copy .env.test.example to .env.test and set DATABASE_URL (dedicated test DB).`,
    );
  }
  config({ path: testEnvPath, override: true });
  if (!process.env.CLERK_WEBHOOK_SECRET?.trim()) {
    process.env.CLERK_WEBHOOK_SECRET = E2E_FALLBACK_CLERK_WEBHOOK_SECRET;
  }
  testEnvLoaded = true;
}

/**
 * Creates a Nest application for HTTP e2e tests (Supertest).
 * Authenticated routes: use `authedRequest` from `test/helpers/e2e-authed-request.ts` and `setup-e2e-clerk.ts`
 * (mocked Clerk `sub` is always {@link TEST_CLERK_USER_ID}).
 */
export async function createE2eApplication(): Promise<INestApplication> {
  loadTestEnv();

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleFixture.createNestApplication({
    bufferLogs: true,
    rawBody: true,
  });
  configureApp(app);
  await app.init();
  return app;
}

export { TEST_CLERK_USER_ID };
