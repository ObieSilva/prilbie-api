import { z } from 'zod';

import { VALID_ICONS } from '../../common/constants/icons';
import { TimezoneSchema } from '../../common/schemas/enums';
import { BundleLevelsSchema } from '../../common/schemas/shared';

export const OnboardingSchema = z.object({
  userName: z.string().min(1).max(100).trim(),
  timezone: TimezoneSchema,
  system: z.object({
    name: z.string().min(1).max(100).trim(),
    icon: z
      .string()
      .min(1)
      .max(50)
      .refine((v) => VALID_ICONS.has(v), { message: 'Invalid icon name' }),
    replacedHabit: z.string().max(200).trim().optional(),
  }),
  bundle: BundleLevelsSchema,
});

export type OnboardingDto = z.infer<typeof OnboardingSchema>;
