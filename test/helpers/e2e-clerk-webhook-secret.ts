/**
 * Fixed test signing secret (also documented in `.env.test.example`).
 * Used when `CLERK_WEBHOOK_SECRET` is unset so e2e signing matches the app config.
 */
export const E2E_FALLBACK_CLERK_WEBHOOK_SECRET =
  'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw';
