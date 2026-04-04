import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { DateStringSchema } from '../common/schemas/enums';
import { MomentumService } from './momentum.service';

@ApiTags('momentum')
@ApiBearerAuth('clerk-jwt')
@Controller('momentum')
@SkipThrottle({ ai: true })
export class MomentumController {
  constructor(private readonly momentumService: MomentumService) {}

  @Get('overview')
  getOverview(@CurrentUser() auth: { userId: string }) {
    return this.momentumService.getOverview(auth.userId);
  }

  @Get('week-grid')
  getWeekGrid(@CurrentUser() auth: { userId: string }) {
    return this.momentumService.getWeekGrid(auth.userId);
  }

  @Get('history')
  getHistory(
    @CurrentUser() auth: { userId: string },
    @Query(new ZodValidationPipe(PaginationDto.schema))
    pagination: PaginationDto,
  ) {
    return this.momentumService.getHistory(auth.userId, pagination);
  }

  @Get('weeks/:weekStart')
  getWeekDetail(
    @CurrentUser() auth: { userId: string },
    @Param('weekStart', new ZodValidationPipe(DateStringSchema))
    weekStart: string,
  ) {
    return this.momentumService.getWeekDetail(auth.userId, weekStart);
  }

  @Get('days/:date')
  getDayDetail(
    @CurrentUser() auth: { userId: string },
    @Param('date', new ZodValidationPipe(DateStringSchema)) date: string,
  ) {
    return this.momentumService.getDayDetail(auth.userId, date);
  }
}
