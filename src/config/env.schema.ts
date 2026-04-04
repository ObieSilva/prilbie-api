import { prettifyError, z } from 'zod';

const nodeEnvSchema = z.enum(['development', 'production', 'test']);

const PRODUCTION_REQUIRED_KEYS = [
  'CLERK_SECRET_KEY',
  'CLERK_JWT_KEY',
  'OPENAI_API_KEY',
] as const;

function parsePortFromEnv(val: unknown): unknown {
  if (typeof val !== 'string' || val.trim() === '') return 3001;
  const n = Number.parseInt(val.trim(), 10);
  return Number.isNaN(n) ? val : n;
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
    CLERK_WEBHOOK_SECRET: z.string().optional(),
    OPENAI_API_KEY: z.string().optional(),
    AI_MODEL: z.string().optional().default('gpt-4o-mini'),
  })
  .passthrough()
  .superRefine((data, ctx) => {
    if (data.NODE_ENV !== 'production') return;
    for (const key of PRODUCTION_REQUIRED_KEYS) {
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
