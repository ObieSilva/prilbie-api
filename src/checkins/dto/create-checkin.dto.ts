import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

import { DateStringSchema } from '../../common/schemas/enums';

const CreateCheckinSchema = z.object({
  actionId: z.string().min(1),
  date: DateStringSchema,
  note: z.string().max(500).trim().optional(),
});

export class CreateCheckinDto extends createZodDto(CreateCheckinSchema) {}
