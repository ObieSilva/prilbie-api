import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SkipThrottle, Throttle } from '@nestjs/throttler';

import { RATE_LIMITS } from '../common/constants/rate-limits';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { DateStringSchema } from '../common/schemas/enums';
import { SetGlobalEnergyDto } from './dto/set-global-energy.dto';
import { SetSystemEnergyDto } from './dto/set-system-energy.dto';
import { EnergyService } from './energy.service';

@ApiTags('energy')
@ApiBearerAuth('clerk-jwt')
@Controller('energy')
@SkipThrottle({ ai: true })
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
  @Throttle({ default: RATE_LIMITS.WRITE })
  @HttpCode(HttpStatus.OK)
  setGlobal(
    @CurrentUser() auth: { userId: string },
    @Param('date', new ZodValidationPipe(DateStringSchema)) date: string,
    @Body(new ZodValidationPipe(SetGlobalEnergyDto.schema))
    dto: SetGlobalEnergyDto,
  ) {
    return this.energyService.setGlobal(auth.userId, date, dto);
  }

  @Put(':date/systems/:systemId')
  @Throttle({ default: RATE_LIMITS.WRITE })
  @HttpCode(HttpStatus.OK)
  setSystemOverride(
    @CurrentUser() auth: { userId: string },
    @Param('date', new ZodValidationPipe(DateStringSchema)) date: string,
    @Param('systemId') systemId: string,
    @Body(new ZodValidationPipe(SetSystemEnergyDto.schema))
    dto: SetSystemEnergyDto,
  ) {
    return this.energyService.setSystemOverride(
      auth.userId,
      date,
      systemId,
      dto,
    );
  }
}
