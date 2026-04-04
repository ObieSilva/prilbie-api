import { z } from 'zod';

export const SuggestSystemsSchema = z.object({
  goals: z.string().min(1).max(2000),
});

export type SuggestSystemsDto = z.infer<typeof SuggestSystemsSchema>;
