import { z } from 'zod';

import { VALID_ICONS } from '../../common/constants/icons';
import { BundleLevelsSchema } from '../../common/schemas/shared';

const ApplySystemSchema = z.object({
  type: z.literal('system'),
  system: z.object({
    name: z.string().min(1).max(100).trim(),
    icon: z
      .string()
      .min(1)
      .max(50)
      .refine((v) => VALID_ICONS.has(v), { message: 'Invalid icon name' }),
    replacedHabit: z.string().max(200).trim().optional(),
    areas: z
      .array(
        z.object({
          name: z.string().min(1).max(100).trim(),
          bundles: z.array(BundleLevelsSchema).min(1),
        }),
      )
      .min(1),
  }),
});

const ApplyBundleSchema = z.object({
  type: z.literal('bundle'),
  bundle: BundleLevelsSchema.extend({
    areaId: z.string().min(1),
  }),
});

export const ApplySuggestionSchema = z.discriminatedUnion('type', [
  ApplySystemSchema,
  ApplyBundleSchema,
]);

export type ApplySuggestionDto = z.infer<typeof ApplySuggestionSchema>;
