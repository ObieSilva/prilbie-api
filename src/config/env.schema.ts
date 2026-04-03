import { prettifyError, z } from 'zod';

const nodeEnvSchema = z.enum(['development', 'production', 'test']);

const PRODUCTION_CLERK_KEYS = ['CLERK_SECRET_KEY', 'CLERK_JWT_KEY'] as const;

/** Normalize ConfigModule / `process.env` values into a number for `PORT`. */
function parsePortFromEnv(val: unknown): unknown {
  if (val === undefined || val === null || val === '') return 3001;
  if (typeof val === 'number') return Number.isInteger(val) ? val : val;
  if (typeof val === 'string') {
    const s = val.trim();
    if (s === '') return 3001;
    const n = Number.parseInt(s, 10);
    return Number.isNaN(n) ? val : n;
  }
  return val;
}

/** Parsed and validated env exposed via ConfigService after bootstrap. */
export const envSchema = z
  .object({
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    NODE_ENV: z
      .string()
      .optional()
      .transform((v) => (v === undefined || v === '' ? 'development' : v))
      .pipe(nodeEnvSchema),
    PORT: z.preprocess(parsePortFromEnv, z.number().int().min(1).max(65535)),
    CLERK_SECRET_KEY: z.string().optional(),
    CLERK_JWT_KEY: z.string().optional(),
  })
  .passthrough()
  .superRefine((data, ctx) => {
    if (data.NODE_ENV !== 'production') return;
    for (const key of PRODUCTION_CLERK_KEYS) {
      if (data[key]?.trim()) continue;
      ctx.addIssue({
        code: 'custom',
        message: `${key} is required when NODE_ENV=production`,
        path: [key],
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

export function validateEnv(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    throw new Error(
      `Environment validation failed:\n${prettifyError(result.error)}`,
    );
  }
  return result.data as Record<string, unknown>;
}
