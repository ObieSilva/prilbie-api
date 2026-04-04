import { z } from 'zod';

import { DateStringSchema } from '../../common/schemas/enums';

export const CreateCheckinSchema = z.object({
  actionId: z.string().min(1),
  date: DateStringSchema,
  note: z.string().max(500).trim().optional(),
});

export type CreateCheckinDto = z.infer<typeof CreateCheckinSchema>;
