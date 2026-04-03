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

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import type { CreateBundleDto } from './dto/create-bundle.dto';
import { CreateBundleSchema } from './dto/create-bundle.dto';
import type { UpdateBundleDto } from './dto/update-bundle.dto';
import { UpdateBundleSchema } from './dto/update-bundle.dto';
import { ActionBundlesService } from './action-bundles.service';

@Controller()
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
  @HttpCode(HttpStatus.CREATED)
  @UsePipes(new ZodValidationPipe(CreateBundleSchema))
  create(
    @CurrentUser() auth: { userId: string },
    @Param('areaId') areaId: string,
    @Body() dto: CreateBundleDto,
  ) {
    return this.actionBundlesService.create(auth.userId, areaId, dto);
  }

  @Patch('bundles/:id')
  @UsePipes(new ZodValidationPipe(UpdateBundleSchema))
  update(
    @CurrentUser() auth: { userId: string },
    @Param('id') id: string,
    @Body() dto: UpdateBundleDto,
  ) {
    return this.actionBundlesService.update(auth.userId, id, dto);
  }

  @Delete('bundles/:id')
  @HttpCode(HttpStatus.OK)
  softDelete(@CurrentUser() auth: { userId: string }, @Param('id') id: string) {
    return this.actionBundlesService.softDelete(auth.userId, id);
  }
}
