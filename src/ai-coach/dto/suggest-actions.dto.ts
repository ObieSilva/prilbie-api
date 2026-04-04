import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const SuggestActionsSchema = z.object({
  systemId: z.string().min(1),
  context: z.string().max(1000).optional(),
});

export class SuggestActionsDto extends createZodDto(SuggestActionsSchema) {}
