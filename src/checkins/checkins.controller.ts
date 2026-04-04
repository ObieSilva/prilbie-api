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

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import type { CreateCheckinDto } from './dto/create-checkin.dto';
import { CreateCheckinSchema } from './dto/create-checkin.dto';
import type { ListCheckinsDto } from './dto/list-checkins.dto';
import { ListCheckinsSchema } from './dto/list-checkins.dto';
import { CheckinsService } from './checkins.service';

@Controller('checkins')
export class CheckinsController {
  constructor(private readonly checkinsService: CheckinsService) {}

  @Get()
  list(
    @CurrentUser() auth: { userId: string },
    @Query(new ZodValidationPipe(ListCheckinsSchema)) filters: ListCheckinsDto,
  ) {
    return this.checkinsService.list(auth.userId, filters);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UsePipes(new ZodValidationPipe(CreateCheckinSchema))
  create(
    @CurrentUser() auth: { userId: string },
    @Body() dto: CreateCheckinDto,
  ) {
    return this.checkinsService.create(auth.userId, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  delete(@CurrentUser() auth: { userId: string }, @Param('id') id: string) {
    return this.checkinsService.delete(auth.userId, id);
  }
}
