import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

import { ConversationTypeSchema } from '../../common/schemas/enums';

const CreateConversationSchema = z.object({
  type: ConversationTypeSchema,
  title: z.string().max(200).trim().optional(),
});

export class CreateConversationDto extends createZodDto(
  CreateConversationSchema,
) {}
