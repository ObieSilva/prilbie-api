import { z } from 'zod';

export const UpdateAreaSchema = z.object({
  name: z.string().min(1).max(100).trim().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export type UpdateAreaDto = z.infer<typeof UpdateAreaSchema>;
