import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const SendMessageSchema = z.object({
  content: z.string().min(1).max(5000),
});

export class SendMessageDto extends createZodDto(SendMessageSchema) {}
