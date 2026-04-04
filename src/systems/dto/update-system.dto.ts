import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

import { VALID_ICONS } from '../../common/constants/icons';

const UpdateSystemSchema = z.object({
  name: z.string().min(1).max(100).trim().optional(),
  icon: z
    .string()
    .min(1)
    .max(50)
    .refine((v) => VALID_ICONS.has(v), { message: 'Invalid icon name' })
    .optional(),
  replacedHabit: z.string().max(200).trim().nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export class UpdateSystemDto extends createZodDto(UpdateSystemSchema) {}
