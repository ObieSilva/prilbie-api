import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { TodayService } from './today.service';

@ApiTags('today')
@ApiBearerAuth('clerk-jwt')
@Controller('today')
@SkipThrottle({ ai: true })
export class TodayController {
  constructor(private readonly todayService: TodayService) {}

  @Get()
  getToday(@CurrentUser() auth: { userId: string }) {
    return this.todayService.getTodayPayload(auth.userId);
  }
}
