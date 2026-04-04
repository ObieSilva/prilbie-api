import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const SuggestSystemsSchema = z.object({
  goals: z.string().min(1).max(2000),
});

export class SuggestSystemsDto extends createZodDto(SuggestSystemsSchema) {}
