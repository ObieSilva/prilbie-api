import { z } from 'zod';

export const SuggestActionsSchema = z.object({
  systemId: z.string().min(1),
  context: z.string().max(1000).optional(),
});

export type SuggestActionsDto = z.infer<typeof SuggestActionsSchema>;
