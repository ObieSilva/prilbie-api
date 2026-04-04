import { z } from 'zod';

import { EffortLevelSchema } from '../../common/schemas/enums';

export const SetGlobalEnergySchema = z.object({
  level: EffortLevelSchema,
});

export type SetGlobalEnergyDto = z.infer<typeof SetGlobalEnergySchema>;
