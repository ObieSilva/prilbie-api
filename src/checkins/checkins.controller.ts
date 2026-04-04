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
  UsePipes,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SkipThrottle, Throttle } from '@nestjs/throttler';

import { RATE_LIMITS } from '../common/constants/rate-limits';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { CreateCheckinDto } from './dto/create-checkin.dto';
import { ListCheckinsDto } from './dto/list-checkins.dto';
import { CheckinsService } from './checkins.service';

@ApiTags('checkins')
@ApiBearerAuth('clerk-jwt')
@Controller('checkins')
@SkipThrottle({ ai: true })
export class CheckinsController {
  constructor(private readonly checkinsService: CheckinsService) {}

  @Get()
  list(
    @CurrentUser() auth: { userId: string },
    @Query(new ZodValidationPipe(ListCheckinsDto.schema))
    filters: ListCheckinsDto,
  ) {
    return this.checkinsService.list(auth.userId, filters);
  }

  @Post()
  @Throttle({ default: RATE_LIMITS.WRITE })
  @HttpCode(HttpStatus.CREATED)
  @UsePipes(new ZodValidationPipe(CreateCheckinDto.schema))
  create(
    @CurrentUser() auth: { userId: string },
    @Body() dto: CreateCheckinDto,
  ) {
    return this.checkinsService.create(auth.userId, dto);
  }

  @Delete(':id')
  @Throttle({ default: RATE_LIMITS.WRITE })
  @HttpCode(HttpStatus.OK)
  delete(@CurrentUser() auth: { userId: string }, @Param('id') id: string) {
    return this.checkinsService.delete(auth.userId, id);
  }
}
