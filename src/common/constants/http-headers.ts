import { randomUUID } from 'crypto';

/** Lowercase; matches Express normalized header keys. */
export const CORRELATION_ID_HEADER = 'x-correlation-id';

/** Pino `genReqId` — keep in sync with {@link CorrelationIdMiddleware}. */
export function pinoGenReqId(req: {
  headers: Record<string, string | string[] | undefined>;
}): string {
  const raw = req.headers[CORRELATION_ID_HEADER];
  const id = Array.isArray(raw) ? raw[0] : raw;
  return id || randomUUID();
}
