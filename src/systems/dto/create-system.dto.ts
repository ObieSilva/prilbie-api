import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

import { VALID_ICONS } from '../../common/constants/icons';

const CreateSystemSchema = z.object({
  name: z.string().min(1).max(100).trim(),
  icon: z
    .string()
    .min(1)
    .max(50)
    .refine((v) => VALID_ICONS.has(v), { message: 'Invalid icon name' }),
  replacedHabit: z.string().max(200).trim().optional(),
});

export class CreateSystemDto extends createZodDto(CreateSystemSchema) {}
