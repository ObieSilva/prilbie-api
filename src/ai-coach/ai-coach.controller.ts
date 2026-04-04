import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Sse,
  UsePipes,
} from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import type { Observable } from 'rxjs';

import { RATE_LIMITS } from '../common/constants/rate-limits';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { AiCoachService } from './ai-coach.service';
import { ApplySuggestionSchema } from './dto/apply-suggestion.dto';
import type { ApplySuggestionDto } from './dto/apply-suggestion.dto';
import { CreateConversationSchema } from './dto/create-conversation.dto';
import type { CreateConversationDto } from './dto/create-conversation.dto';
import { SendMessageSchema } from './dto/send-message.dto';
import type { SendMessageDto } from './dto/send-message.dto';
import { SuggestActionsSchema } from './dto/suggest-actions.dto';
import type { SuggestActionsDto } from './dto/suggest-actions.dto';
import { SuggestSystemsSchema } from './dto/suggest-systems.dto';
import type { SuggestSystemsDto } from './dto/suggest-systems.dto';

@Controller('ai')
export class AiCoachController {
  constructor(private readonly aiCoachService: AiCoachService) {}

  @Get('conversations')
  @SkipThrottle({ ai: true })
  listConversations(@CurrentUser() auth: { userId: string }) {
    return this.aiCoachService.listConversations(auth.userId);
  }

  @Post('conversations')
  @Throttle({ default: RATE_LIMITS.WRITE })
  @SkipThrottle({ ai: true })
  @HttpCode(HttpStatus.CREATED)
  @UsePipes(new ZodValidationPipe(CreateConversationSchema))
  createConversation(
    @CurrentUser() auth: { userId: string },
    @Body() dto: CreateConversationDto,
  ) {
    return this.aiCoachService.createConversation(auth.userId, dto);
  }

  @Get('conversations/:id')
  @SkipThrottle({ ai: true })
  getConversation(
    @CurrentUser() auth: { userId: string },
    @Param('id') id: string,
  ) {
    return this.aiCoachService.getConversation(auth.userId, id);
  }

  @Post('conversations/:id/messages')
  @Throttle({ default: RATE_LIMITS.WRITE })
  sendMessage(
    @CurrentUser() auth: { userId: string },
    @Param('id') id: string,
    @Body(new ZodValidationPipe(SendMessageSchema)) dto: SendMessageDto,
  ) {
    return this.aiCoachService.sendMessage(auth.userId, id, dto);
  }

  @Sse('conversations/:id/stream')
  @SkipThrottle({ ai: true })
  streamResponse(
    @CurrentUser() auth: { userId: string },
    @Param('id') id: string,
    @Query('messageId') messageId: string,
  ): Observable<MessageEvent> {
    return this.aiCoachService.streamResponse(auth.userId, id, messageId);
  }

  @Delete('conversations/:id')
  @Throttle({ default: RATE_LIMITS.WRITE })
  @SkipThrottle({ ai: true })
  @HttpCode(HttpStatus.OK)
  deleteConversation(
    @CurrentUser() auth: { userId: string },
    @Param('id') id: string,
  ) {
    return this.aiCoachService.deleteConversation(auth.userId, id);
  }

  @Post('suggest/systems')
  @Throttle({ default: RATE_LIMITS.WRITE, ai: RATE_LIMITS.AI_SUGGEST })
  suggestSystems(
    @CurrentUser() auth: { userId: string },
    @Body(new ZodValidationPipe(SuggestSystemsSchema)) dto: SuggestSystemsDto,
  ) {
    return this.aiCoachService.suggestSystems(auth.userId, dto);
  }

  @Post('suggest/actions')
  @Throttle({ default: RATE_LIMITS.WRITE, ai: RATE_LIMITS.AI_SUGGEST })
  suggestActions(
    @CurrentUser() auth: { userId: string },
    @Body(new ZodValidationPipe(SuggestActionsSchema)) dto: SuggestActionsDto,
  ) {
    return this.aiCoachService.suggestActions(auth.userId, dto);
  }

  @Post('apply-suggestion')
  @Throttle({ default: RATE_LIMITS.WRITE })
  @SkipThrottle({ ai: true })
  @UsePipes(new ZodValidationPipe(ApplySuggestionSchema))
  applySuggestion(
    @CurrentUser() auth: { userId: string },
    @Body() dto: ApplySuggestionDto,
  ) {
    return this.aiCoachService.applySuggestion(auth.userId, dto);
  }
}
