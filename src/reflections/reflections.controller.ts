import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Put,
} from '@nestjs/common';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { DateStringSchema } from '../common/schemas/enums';
import type { UpsertReflectionDto } from './dto/upsert-reflection.dto';
import { UpsertReflectionSchema } from './dto/upsert-reflection.dto';
import { ReflectionsService } from './reflections.service';

@Controller('reflections')
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
