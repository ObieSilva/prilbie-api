import { z } from 'zod';

import { TimeAnchorSchema } from './enums';

export const TierInputSchema = z.object({
  title: z.string().min(1).max(200).trim(),
  anchor: TimeAnchorSchema,
});

export type TierInputDto = z.infer<typeof TierInputSchema>;

export const BundleLevelsSchema = z.object({
  bundleTitle: z.string().max(200).trim().default(''),
  baseline: TierInputSchema,
  normal: TierInputSchema,
  stretch: TierInputSchema,
});

export type BundleLevelsDto = z.infer<typeof BundleLevelsSchema>;
