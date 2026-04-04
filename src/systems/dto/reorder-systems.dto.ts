import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const ReorderSystemsSchema = z.object({
  orderedIds: z.array(z.string().min(1)).min(1),
});

export class ReorderSystemsDto extends createZodDto(ReorderSystemsSchema) {}
