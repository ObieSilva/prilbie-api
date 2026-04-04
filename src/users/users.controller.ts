import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  UsePipes,
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
  @UsePipes(new ZodValidationPipe(UpdateUserDto.schema))
  updateProfile(
    @CurrentUser() auth: { userId: string },
    @Body() dto: UpdateUserDto,
  ) {
    return this.usersService.updateProfile(auth.userId, dto);
  }

  @Post('onboard')
  @Throttle({ default: RATE_LIMITS.WRITE })
  @HttpCode(HttpStatus.CREATED)
  @UsePipes(new ZodValidationPipe(OnboardingDto.schema))
  onboard(@CurrentUser() auth: { userId: string }, @Body() dto: OnboardingDto) {
    return this.usersService.onboard(auth.userId, dto);
  }

  @Delete()
  @Throttle({ default: RATE_LIMITS.WRITE })
  @HttpCode(HttpStatus.OK)
  softDelete(@CurrentUser() auth: { userId: string }) {
    return this.usersService.softDelete(auth.userId);
  }
}
