import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SkipThrottle, Throttle } from '@nestjs/throttler';

import { RATE_LIMITS } from '../common/constants/rate-limits';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { OnboardingDto } from './dto/onboarding.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth('clerk-jwt')
@Controller('users/me')
@SkipThrottle({ ai: true })
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  getProfile(@CurrentUser() auth: { userId: string }) {
    return this.usersService.getProfile(auth.userId);
  }

  @Patch()
  @Throttle({ default: RATE_LIMITS.WRITE })
  updateProfile(
    @CurrentUser() auth: { userId: string },
    @Body(new ZodValidationPipe(UpdateUserDto.schema)) dto: UpdateUserDto,
  ) {
    return this.usersService.updateProfile(auth.userId, dto);
  }

  @Post('onboard')
  @Throttle({ default: RATE_LIMITS.WRITE })
  @HttpCode(HttpStatus.CREATED)
  onboard(
    @CurrentUser() auth: { userId: string },
    @Body(new ZodValidationPipe(OnboardingDto.schema)) dto: OnboardingDto,
  ) {
    return this.usersService.onboard(auth.userId, dto);
  }

  @Delete()
  @Throttle({ default: RATE_LIMITS.WRITE })
  @HttpCode(HttpStatus.OK)
  softDelete(@CurrentUser() auth: { userId: string }) {
    return this.usersService.softDelete(auth.userId);
  }
}
