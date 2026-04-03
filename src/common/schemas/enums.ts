import { z } from 'zod';

export const EffortLevelSchema = z.enum(['baseline', 'normal', 'stretch']);
export type EffortLevel = z.infer<typeof EffortLevelSchema>;

export const TimeAnchorSchema = z.enum([
  'morning',
  'midday',
  'afternoon',
  'evening',
  'anytime',
]);
export type TimeAnchor = z.infer<typeof TimeAnchorSchema>;

export const ConversationTypeSchema = z.enum([
  'coaching',
  'system_builder',
  'general_chat',
]);
export type ConversationType = z.infer<typeof ConversationTypeSchema>;

export const DateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format');
export type DateString = z.infer<typeof DateStringSchema>;

export const TimezoneSchema = z.string().min(1).max(50);
export type Timezone = z.infer<typeof TimezoneSchema>;
