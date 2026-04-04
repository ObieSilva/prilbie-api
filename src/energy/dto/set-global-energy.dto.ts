import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

import { EffortLevelSchema } from '../../common/schemas/enums';

const SetGlobalEnergySchema = z.object({
  level: EffortLevelSchema,
});

export class SetGlobalEnergyDto extends createZodDto(SetGlobalEnergySchema) {}
