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
import { CreateAreaDto } from './dto/create-area.dto';
import { UpdateAreaDto } from './dto/update-area.dto';
import { AreasService } from './areas.service';

@ApiTags('areas')
@ApiBearerAuth('clerk-jwt')
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
  create(
    @CurrentUser() auth: { userId: string },
    @Param('systemId') systemId: string,
    @Body(new ZodValidationPipe(CreateAreaDto.schema)) dto: CreateAreaDto,
  ) {
    return this.areasService.create(auth.userId, systemId, dto);
  }

  @Patch('areas/:id')
  @Throttle({ default: RATE_LIMITS.WRITE })
  update(
    @CurrentUser() auth: { userId: string },
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateAreaDto.schema)) dto: UpdateAreaDto,
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
