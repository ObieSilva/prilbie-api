import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UsePipes,
} from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';

import { RATE_LIMITS } from '../common/constants/rate-limits';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import type { CreateSystemDto } from './dto/create-system.dto';
import { CreateSystemSchema } from './dto/create-system.dto';
import type { ReorderSystemsDto } from './dto/reorder-systems.dto';
import { ReorderSystemsSchema } from './dto/reorder-systems.dto';
import type { UpdateSystemDto } from './dto/update-system.dto';
import { UpdateSystemSchema } from './dto/update-system.dto';
import { SystemsService } from './systems.service';

@Controller('systems')
@SkipThrottle({ ai: true })
export class SystemsController {
  constructor(private readonly systemsService: SystemsService) {}

  @Get()
  list(@CurrentUser() auth: { userId: string }) {
    return this.systemsService.list(auth.userId);
  }

  @Post()
  @Throttle({ default: RATE_LIMITS.WRITE })
  @HttpCode(HttpStatus.CREATED)
  @UsePipes(new ZodValidationPipe(CreateSystemSchema))
  create(
    @CurrentUser() auth: { userId: string },
    @Body() dto: CreateSystemDto,
  ) {
    return this.systemsService.create(auth.userId, dto);
  }

  @Patch('reorder')
  @Throttle({ default: RATE_LIMITS.WRITE })
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ZodValidationPipe(ReorderSystemsSchema))
  reorder(
    @CurrentUser() auth: { userId: string },
    @Body() dto: ReorderSystemsDto,
  ) {
    return this.systemsService.reorder(auth.userId, dto);
  }

  @Get(':id')
  getById(@CurrentUser() auth: { userId: string }, @Param('id') id: string) {
    return this.systemsService.getById(auth.userId, id);
  }

  @Patch(':id')
  @Throttle({ default: RATE_LIMITS.WRITE })
  @UsePipes(new ZodValidationPipe(UpdateSystemSchema))
  update(
    @CurrentUser() auth: { userId: string },
    @Param('id') id: string,
    @Body() dto: UpdateSystemDto,
  ) {
    return this.systemsService.update(auth.userId, id, dto);
  }

  @Delete(':id')
  @Throttle({ default: RATE_LIMITS.WRITE })
  @HttpCode(HttpStatus.OK)
  softDelete(@CurrentUser() auth: { userId: string }, @Param('id') id: string) {
    return this.systemsService.softDelete(auth.userId, id);
  }
}
