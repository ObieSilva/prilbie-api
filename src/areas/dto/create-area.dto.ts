import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const CreateAreaSchema = z.object({
  name: z.string().min(1).max(100).trim(),
});

export class CreateAreaDto extends createZodDto(CreateAreaSchema) {}
