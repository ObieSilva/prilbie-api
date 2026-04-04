import { z } from 'zod';

import { ConversationTypeSchema } from '../../common/schemas/enums';

export const CreateConversationSchema = z.object({
  type: ConversationTypeSchema,
  title: z.string().max(200).trim().optional(),
});

export type CreateConversationDto = z.infer<typeof CreateConversationSchema>;
