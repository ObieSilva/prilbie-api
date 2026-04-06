import { type CanActivate, type ExecutionContext } from '@nestjs/common';

import type { AuthenticatedRequest } from '../../src/common/types/authenticated-request';

/** Default Clerk subject used in e2e when overriding {@link ClerkAuthGuard}. */
export const TEST_CLERK_USER_ID = 'test-clerk-user-id';

/**
 * Returns a guard that skips JWT verification and sets `request.auth` for tests.
 * Use with `TestingModule.overrideGuard(ClerkAuthGuard).useValue(...)`.
 */
export function mockClerkAuthGuard(userId: string): CanActivate {
  return {
    canActivate(context: ExecutionContext): boolean {
      const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
      request.auth = { userId };
      return true;
    },
  };
}
