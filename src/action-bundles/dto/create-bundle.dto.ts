import { z } from 'zod';

import { BundleLevelsSchema } from '../../common/schemas/shared';

export const CreateBundleSchema = BundleLevelsSchema;
export type CreateBundleDto = z.infer<typeof CreateBundleSchema>;
