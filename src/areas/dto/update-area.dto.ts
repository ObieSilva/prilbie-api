import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const UpdateAreaSchema = z.object({
  name: z.string().min(1).max(100).trim().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export class UpdateAreaDto extends createZodDto(UpdateAreaSchema) {}
