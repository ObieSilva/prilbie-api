import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

import { PaginationSchema } from '../../common/dto/pagination.dto';
import { DateStringSchema } from '../../common/schemas/enums';

const ListCheckinsSchema = PaginationSchema.extend({
  date: DateStringSchema.optional(),
  systemId: z.string().optional(),
  from: DateStringSchema.optional(),
  to: DateStringSchema.optional(),
});

export class ListCheckinsDto extends createZodDto(ListCheckinsSchema) {}
