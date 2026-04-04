import { z } from 'zod';

import { DateStringSchema } from '../../common/schemas/enums';
import { PaginationSchema } from '../../common/dto/pagination.dto';

export const ListCheckinsSchema = PaginationSchema.extend({
  date: DateStringSchema.optional(),
  systemId: z.string().optional(),
  from: DateStringSchema.optional(),
  to: DateStringSchema.optional(),
});

export type ListCheckinsDto = z.infer<typeof ListCheckinsSchema>;
