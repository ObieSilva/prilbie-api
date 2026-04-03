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

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import type { OnboardingDto } from './dto/onboarding.dto';
import { OnboardingSchema } from './dto/onboarding.dto';
import type { UpdateUserDto } from './dto/update-user.dto';
import { UpdateUserSchema } from './dto/update-user.dto';
import { UsersService } from './users.service';

@Controller('users/me')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  getProfile(@CurrentUser() auth: { userId: string }) {
    return this.usersService.getProfile(auth.userId);
  }

  @Patch()
  @UsePipes(new ZodValidationPipe(UpdateUserSchema))
  updateProfile(
    @CurrentUser() auth: { userId: string },
    @Body() dto: UpdateUserDto,
  ) {
    return this.usersService.updateProfile(auth.userId, dto);
  }

  @Post('onboard')
  @HttpCode(HttpStatus.CREATED)
  @UsePipes(new ZodValidationPipe(OnboardingSchema))
  onboard(@CurrentUser() auth: { userId: string }, @Body() dto: OnboardingDto) {
    return this.usersService.onboard(auth.userId, dto);
  }

  @Delete()
  @HttpCode(HttpStatus.OK)
  softDelete(@CurrentUser() auth: { userId: string }) {
    return this.usersService.softDelete(auth.userId);
  }
}
