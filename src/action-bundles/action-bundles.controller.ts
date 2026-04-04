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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SkipThrottle, Throttle } from '@nestjs/throttler';

import { RATE_LIMITS } from '../common/constants/rate-limits';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { CreateBundleDto } from './dto/create-bundle.dto';
import { UpdateBundleDto } from './dto/update-bundle.dto';
import { ActionBundlesService } from './action-bundles.service';

@ApiTags('bundles')
@ApiBearerAuth('clerk-jwt')
@Controller()
@SkipThrottle({ ai: true })
export class ActionBundlesController {
  constructor(private readonly actionBundlesService: ActionBundlesService) {}

  @Get('areas/:areaId/bundles')
  listByArea(
    @CurrentUser() auth: { userId: string },
    @Param('areaId') areaId: string,
  ) {
    return this.actionBundlesService.listByArea(auth.userId, areaId);
  }

  @Post('areas/:areaId/bundles')
  @Throttle({ default: RATE_LIMITS.WRITE })
  @HttpCode(HttpStatus.CREATED)
  @UsePipes(new ZodValidationPipe(CreateBundleDto.schema))
  create(
    @CurrentUser() auth: { userId: string },
    @Param('areaId') areaId: string,
    @Body() dto: CreateBundleDto,
  ) {
    return this.actionBundlesService.create(auth.userId, areaId, dto);
  }

  @Patch('bundles/:id')
  @Throttle({ default: RATE_LIMITS.WRITE })
  @UsePipes(new ZodValidationPipe(UpdateBundleDto.schema))
  update(
    @CurrentUser() auth: { userId: string },
    @Param('id') id: string,
    @Body() dto: UpdateBundleDto,
  ) {
    return this.actionBundlesService.update(auth.userId, id, dto);
  }

  @Delete('bundles/:id')
  @Throttle({ default: RATE_LIMITS.WRITE })
  @HttpCode(HttpStatus.OK)
  softDelete(@CurrentUser() auth: { userId: string }, @Param('id') id: string) {
    return this.actionBundlesService.softDelete(auth.userId, id);
  }
}
