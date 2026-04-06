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
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SkipThrottle, Throttle } from '@nestjs/throttler';

import { RATE_LIMITS } from '../common/constants/rate-limits';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { CreateSystemDto } from './dto/create-system.dto';
import { ReorderSystemsDto } from './dto/reorder-systems.dto';
import { UpdateSystemDto } from './dto/update-system.dto';
import { SystemsService } from './systems.service';

@ApiTags('systems')
@ApiBearerAuth('clerk-jwt')
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
  create(
    @CurrentUser() auth: { userId: string },
    @Body(new ZodValidationPipe(CreateSystemDto.schema)) dto: CreateSystemDto,
  ) {
    return this.systemsService.create(auth.userId, dto);
  }

  @Patch('reorder')
  @Throttle({ default: RATE_LIMITS.WRITE })
  @HttpCode(HttpStatus.OK)
  reorder(
    @CurrentUser() auth: { userId: string },
    @Body(new ZodValidationPipe(ReorderSystemsDto.schema))
    dto: ReorderSystemsDto,
  ) {
    return this.systemsService.reorder(auth.userId, dto);
  }

  @Get(':id')
  getById(@CurrentUser() auth: { userId: string }, @Param('id') id: string) {
    return this.systemsService.getById(auth.userId, id);
  }

  @Patch(':id')
  @Throttle({ default: RATE_LIMITS.WRITE })
  update(
    @CurrentUser() auth: { userId: string },
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateSystemDto.schema)) dto: UpdateSystemDto,
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
