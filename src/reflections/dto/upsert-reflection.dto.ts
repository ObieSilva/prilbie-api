import { z } from 'zod';

export const UpsertReflectionSchema = z.object({
  text: z.string().min(1).max(2000).trim(),
});

export type UpsertReflectionDto = z.infer<typeof UpsertReflectionSchema>;
