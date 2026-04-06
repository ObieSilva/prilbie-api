import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { config } from 'dotenv';

import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/configure-app';
import { ClerkAuthGuard } from '../../src/common/guards/clerk-auth.guard';

import { mockClerkAuthGuard, TEST_CLERK_USER_ID } from './mock-auth';

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
  testEnvLoaded = true;
}

export type CreateE2eApplicationOptions = {
  clerkUserId?: string;
};

/**
 * Creates a Nest application for HTTP e2e tests (Supertest).
 * When `clerkUserId` is set, {@link ClerkAuthGuard} is replaced with a no-JWT mock.
 */
export async function createE2eApplication(
  options: CreateE2eApplicationOptions = {},
): Promise<INestApplication> {
  loadTestEnv();

  let builder = Test.createTestingModule({
    imports: [AppModule],
  });

  if (options.clerkUserId !== undefined) {
    builder = builder
      .overrideGuard(ClerkAuthGuard)
      .useValue(mockClerkAuthGuard(options.clerkUserId));
  }

  const moduleFixture: TestingModule = await builder.compile();
  const app = moduleFixture.createNestApplication({ bufferLogs: true });
  configureApp(app);
  await app.init();
  return app;
}

export { TEST_CLERK_USER_ID };
