import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { TodayService } from './today.service';

@Controller('today')
@SkipThrottle({ ai: true })
export class TodayController {
  constructor(private readonly todayService: TodayService) {}

  @Get()
  getToday(@CurrentUser() auth: { userId: string }) {
    return this.todayService.getTodayPayload(auth.userId);
  }
}
