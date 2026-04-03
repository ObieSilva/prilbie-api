import { z } from 'zod';

export const ReorderSystemsSchema = z.object({
  orderedIds: z.array(z.string().min(1)).min(1),
});

export type ReorderSystemsDto = z.infer<typeof ReorderSystemsSchema>;
