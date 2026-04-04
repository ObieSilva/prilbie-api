import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Put,
} from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';

import { RATE_LIMITS } from '../common/constants/rate-limits';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { DateStringSchema } from '../common/schemas/enums';
import type { UpsertReflectionDto } from './dto/upsert-reflection.dto';
import { UpsertReflectionSchema } from './dto/upsert-reflection.dto';
import { ReflectionsService } from './reflections.service';

@Controller('reflections')
@SkipThrottle({ ai: true })
export class ReflectionsController {
  constructor(private readonly reflectionsService: ReflectionsService) {}

  @Get(':date')
  getByDate(
    @CurrentUser() auth: { userId: string },
    @Param('date', new ZodValidationPipe(DateStringSchema)) date: string,
  ) {
    return this.reflectionsService.getByDate(auth.userId, date);
  }

  @Put(':date')
  @Throttle({ default: RATE_LIMITS.WRITE })
  @HttpCode(HttpStatus.OK)
  upsert(
    @CurrentUser() auth: { userId: string },
    @Param('date', new ZodValidationPipe(DateStringSchema)) date: string,
    @Body(new ZodValidationPipe(UpsertReflectionSchema))
    dto: UpsertReflectionDto,
  ) {
    return this.reflectionsService.upsert(auth.userId, date, dto);
  }
}
