import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const UpsertReflectionSchema = z.object({
  text: z.string().min(1).max(2000).trim(),
});

export class UpsertReflectionDto extends createZodDto(UpsertReflectionSchema) {}
