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
import type { CreateAreaDto } from './dto/create-area.dto';
import { CreateAreaSchema } from './dto/create-area.dto';
import type { UpdateAreaDto } from './dto/update-area.dto';
import { UpdateAreaSchema } from './dto/update-area.dto';
import { AreasService } from './areas.service';

@Controller()
@SkipThrottle({ ai: true })
export class AreasController {
  constructor(private readonly areasService: AreasService) {}

  @Get('systems/:systemId/areas')
  listBySystem(
    @CurrentUser() auth: { userId: string },
    @Param('systemId') systemId: string,
  ) {
    return this.areasService.listBySystem(auth.userId, systemId);
  }

  @Post('systems/:systemId/areas')
  @Throttle({ default: RATE_LIMITS.WRITE })
  @HttpCode(HttpStatus.CREATED)
  @UsePipes(new ZodValidationPipe(CreateAreaSchema))
  create(
    @CurrentUser() auth: { userId: string },
    @Param('systemId') systemId: string,
    @Body() dto: CreateAreaDto,
  ) {
    return this.areasService.create(auth.userId, systemId, dto);
  }

  @Patch('areas/:id')
  @Throttle({ default: RATE_LIMITS.WRITE })
  @UsePipes(new ZodValidationPipe(UpdateAreaSchema))
  update(
    @CurrentUser() auth: { userId: string },
    @Param('id') id: string,
    @Body() dto: UpdateAreaDto,
  ) {
    return this.areasService.update(auth.userId, id, dto);
  }

  @Delete('areas/:id')
  @Throttle({ default: RATE_LIMITS.WRITE })
  @HttpCode(HttpStatus.OK)
  softDelete(@CurrentUser() auth: { userId: string }, @Param('id') id: string) {
    return this.areasService.softDelete(auth.userId, id);
  }
}
