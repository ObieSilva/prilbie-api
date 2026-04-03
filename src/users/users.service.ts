import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EffortLevel } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import type { OnboardingDto } from './dto/onboarding.dto';
import type { UpdateUserDto } from './dto/update-user.dto';

const EFFORT_LEVELS: EffortLevel[] = ['baseline', 'normal', 'stretch'];

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(clerkUserId: string) {
    const user = await this.prisma.userProfile.findUnique({
      where: { clerkUserId },
    });
    if (!user) {
      throw new NotFoundException('User profile not found');
    }
    return user;
  }

  async updateProfile(clerkUserId: string, dto: UpdateUserDto) {
    await this.ensureUserExists(clerkUserId);

    const data: Record<string, unknown> = { ...dto };

    if ('focusedActionId' in dto) {
      data.focusedAt = dto.focusedActionId !== null ? new Date() : null;
    }

    return this.prisma.userProfile.update({
      where: { clerkUserId },
      data,
    });
  }

  async onboard(clerkUserId: string, dto: OnboardingDto) {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.userProfile.findUnique({
        where: { clerkUserId },
      });
      if (!user) {
        throw new NotFoundException('User profile not found');
      }
      if (user.onboarded) {
        throw new ConflictException('User has already been onboarded');
      }

      const updatedUser = await tx.userProfile.update({
        where: { clerkUserId },
        data: {
          userName: dto.userName,
          timezone: dto.timezone,
          onboarded: true,
        },
      });

      const system = await tx.system.create({
        data: {
          userId: user.id,
          name: dto.system.name,
          icon: dto.system.icon,
          replacedHabit: dto.system.replacedHabit,
        },
      });

      const area = await tx.area.create({
        data: {
          systemId: system.id,
          name: 'General',
        },
      });

      const bundle = await tx.actionBundle.create({
        data: {
          areaId: area.id,
          bundleTitle: dto.bundle.bundleTitle,
        },
      });

      const actions = await Promise.all(
        EFFORT_LEVELS.map((level) =>
          tx.action.create({
            data: {
              bundleId: bundle.id,
              title: dto.bundle[level].title,
              effortLevel: level,
              anchor: dto.bundle[level].anchor,
            },
          }),
        ),
      );

      return {
        ...updatedUser,
        systems: [
          {
            ...system,
            areas: [
              {
                ...area,
                bundles: [{ ...bundle, actions }],
              },
            ],
          },
        ],
      };
    });
  }

  async softDelete(clerkUserId: string) {
    await this.ensureUserExists(clerkUserId);

    return this.prisma.userProfile.update({
      where: { clerkUserId },
      data: { deletedAt: new Date() },
    });
  }

  private async ensureUserExists(clerkUserId: string) {
    const user = await this.prisma.userProfile.findUnique({
      where: { clerkUserId },
    });
    if (!user) {
      throw new NotFoundException('User profile not found');
    }
    return user;
  }
}
