import type { IncomingHttpHeaders } from 'node:http';
import type { Request } from 'express';

/** Express request after ClerkAuthGuard attaches `auth`. */
export type AuthenticatedRequest = Request & {
  auth?: { userId: string };
};

/** Parse `Authorization: Bearer <jwt>` without unsafe `any` from header unions. */
export function readBearerToken(
  headers: IncomingHttpHeaders,
): string | undefined {
  const raw = headers.authorization;
  let header: string | undefined;
  if (typeof raw === 'string') {
    header = raw;
  } else if (Array.isArray(raw)) {
    const first = raw[0];
    header = typeof first === 'string' ? first : undefined;
  }
  if (header === undefined) return undefined;
  const trimmed = header.replace(/^Bearer\s+/i, '').trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
