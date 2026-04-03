import { z } from 'zod';

import { BundleLevelsSchema } from '../../common/schemas/shared';

export const UpdateBundleSchema = BundleLevelsSchema;
export type UpdateBundleDto = z.infer<typeof UpdateBundleSchema>;
