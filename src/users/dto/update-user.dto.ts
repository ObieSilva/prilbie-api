import { z } from 'zod';

import { DateStringSchema, TimezoneSchema } from '../../common/schemas/enums';

export const UpdateUserSchema = z.object({
  userName: z.string().min(1).max(100).trim().optional(),
  timezone: TimezoneSchema.optional(),
  lastMilestoneSeen: z.number().int().min(0).optional(),
  lastReviewDate: DateStringSchema.optional(),
  focusedActionId: z.string().nullable().optional(),
});

export type UpdateUserDto = z.infer<typeof UpdateUserSchema>;
