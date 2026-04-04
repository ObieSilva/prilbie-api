export const RATE_LIMITS = {
  GLOBAL: { limit: 100, ttl: 60_000 },
  WRITE: { limit: 30, ttl: 60_000 },
  AI_CHAT: { limit: 30, ttl: 3_600_000 },
  AI_SUGGEST: { limit: 10, ttl: 3_600_000 },
} as const;
