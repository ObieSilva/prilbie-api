import request, { type Test } from 'supertest';
import type { App } from 'supertest/types';

/** Must match `TEST_CLERK_USER_ID` in `mock-auth.ts` and `setup-e2e-clerk.ts` mock payload `sub`. */
const E2E_BEARER = 'Bearer e2e-test-jwt';

function withAuth(test: Test) {
  return test.set('Authorization', E2E_BEARER);
}

/**
 * Supertest shortcuts that attach `Authorization` for protected `/api/v1/*` routes.
 * (Avoid `request(app).set` — Supertest only exposes `.set` after a verb like `.get`.)
 */
export function authedRequest(server: App) {
  const base = request(server);
  return {
    get: (url: string) => withAuth(base.get(url)),
    post: (url: string) => withAuth(base.post(url).type('json')),
    patch: (url: string) => withAuth(base.patch(url).type('json')),
    put: (url: string) => withAuth(base.put(url).type('json')),
    delete: (url: string) => withAuth(base.delete(url)),
  };
}
