import { jest } from '@jest/globals';

/**
 * `APP_GUARD` + `useClass` is not reliably overridden by `TestingModule.overrideGuard` in this setup.
 * Mock Clerk JWT verification so e2e can send a fixed Bearer token (see {@link e2e-authed-request.ts}).
 */
jest.mock('@clerk/backend', () => ({
  verifyToken: jest.fn(async () => ({
    sub: 'test-clerk-user-id',
  })),
}));
