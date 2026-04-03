import { z } from 'zod';

export const CreateAreaSchema = z.object({
  name: z.string().min(1).max(100).trim(),
});

export type CreateAreaDto = z.infer<typeof CreateAreaSchema>;
