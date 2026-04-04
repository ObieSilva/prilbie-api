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
import type { SetGlobalEnergyDto } from './dto/set-global-energy.dto';
import { SetGlobalEnergySchema } from './dto/set-global-energy.dto';
import type { SetSystemEnergyDto } from './dto/set-system-energy.dto';
import { SetSystemEnergySchema } from './dto/set-system-energy.dto';
import { EnergyService } from './energy.service';

@Controller('energy')
export class EnergyController {
  constructor(private readonly energyService: EnergyService) {}

  @Get(':date')
  getByDate(
    @CurrentUser() auth: { userId: string },
    @Param('date', new ZodValidationPipe(DateStringSchema)) date: string,
  ) {
    return this.energyService.getByDate(auth.userId, date);
  }

  @Put(':date')
  @HttpCode(HttpStatus.OK)
  setGlobal(
    @CurrentUser() auth: { userId: string },
    @Param('date', new ZodValidationPipe(DateStringSchema)) date: string,
    @Body(new ZodValidationPipe(SetGlobalEnergySchema)) dto: SetGlobalEnergyDto,
  ) {
    return this.energyService.setGlobal(auth.userId, date, dto);
  }

  @Put(':date/systems/:systemId')
  @HttpCode(HttpStatus.OK)
  setSystemOverride(
    @CurrentUser() auth: { userId: string },
    @Param('date', new ZodValidationPipe(DateStringSchema)) date: string,
    @Param('systemId') systemId: string,
    @Body(new ZodValidationPipe(SetSystemEnergySchema)) dto: SetSystemEnergyDto,
  ) {
    return this.energyService.setSystemOverride(
      auth.userId,
      date,
      systemId,
      dto,
    );
  }
}
