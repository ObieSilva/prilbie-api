import { z } from 'zod';

const nodeEnvSchema = z.enum(['development', 'production', 'test']);

/** Parsed and validated env exposed via ConfigService after bootstrap. */
export const envSchema = z
  .object({
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    NODE_ENV: z
      .string()
      .optional()
      .transform((v) => (v === undefined || v === '' ? 'development' : v))
      .pipe(nodeEnvSchema),
    PORT: z.preprocess((val) => {
      if (val === undefined || val === null || val === '') return 3001;
      if (typeof val === 'number' && Number.isInteger(val)) return val;
      const s = String(val).trim();
      if (s === '') return 3001;
      const n = Number.parseInt(s, 10);
      return Number.isNaN(n) ? val : n;
    }, z.number().int().min(1).max(65535)),
    CLERK_SECRET_KEY: z.string().optional(),
    CLERK_JWT_KEY: z.string().optional(),
  })
  .passthrough()
  .superRefine((data, ctx) => {
    if (data.NODE_ENV !== 'production') return;
    if (!data.CLERK_SECRET_KEY?.trim()) {
      ctx.addIssue({
        code: 'custom',
        message: 'CLERK_SECRET_KEY is required when NODE_ENV=production',
        path: ['CLERK_SECRET_KEY'],
      });
    }
    if (!data.CLERK_JWT_KEY?.trim()) {
      ctx.addIssue({
        code: 'custom',
        message: 'CLERK_JWT_KEY is required when NODE_ENV=production',
        path: ['CLERK_JWT_KEY'],
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

export function validateEnv(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    const msg = result.error.issues
      .map((i) => `${i.path.join('.') || 'env'}: ${i.message}`)
      .join('; ');
    throw new Error(`Environment validation failed: ${msg}`);
  }
  return result.data as Record<string, unknown>;
}
