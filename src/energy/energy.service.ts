import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type {
  DailyEnergy,
  EffortLevel,
  SystemEnergyOverride,
} from '@prisma/client';

import { CACHE_SERVICE } from '../cache/cache.interface';
import type { ICacheService } from '../cache/cache.interface';
import { PrismaService } from '../prisma/prisma.service';
import type { SetGlobalEnergyDto } from './dto/set-global-energy.dto';
import type { SetSystemEnergyDto } from './dto/set-system-energy.dto';

type DailyEnergyWithOverrides = DailyEnergy & {
  overrides: SystemEnergyOverride[];
};

@Injectable()
export class EnergyService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_SERVICE) private readonly cache: ICacheService,
  ) {}

  async getByDate(clerkUserId: string, date: string) {
    const { id: userId } = await this.resolveUser(clerkUserId);

    const energy = await this.prisma.dailyEnergy.findUnique({
      where: { userId_date: { userId, date } },
      include: { overrides: true },
    });

    if (!energy) {
      throw new NotFoundException('No energy set for this date');
    }

    return this.buildResponse(energy);
  }

  async setGlobal(clerkUserId: string, date: string, dto: SetGlobalEnergyDto) {
    const { id: userId } = await this.resolveUser(clerkUserId);

    const energy = await this.prisma.$transaction(async (tx) => {
      const upserted = await tx.dailyEnergy.upsert({
        where: { userId_date: { userId, date } },
        create: { userId, date, globalLevel: dto.level },
        update: { globalLevel: dto.level },
      });

      await tx.systemEnergyOverride.deleteMany({
        where: { dailyEnergyId: upserted.id },
      });

      return tx.dailyEnergy.findUniqueOrThrow({
        where: { id: upserted.id },
        include: { overrides: true },
      });
    });

    await this.cache.del(`today:${userId}:${date}`);

    return this.buildResponse(energy);
  }

  async setSystemOverride(
    clerkUserId: string,
    date: string,
    systemId: string,
    dto: SetSystemEnergyDto,
  ) {
    const { id: userId } = await this.resolveUser(clerkUserId);

    const system = await this.prisma.system.findFirst({
      where: { id: systemId, userId, deletedAt: null },
      select: { id: true },
    });
    if (!system) {
      throw new NotFoundException('System not found');
    }

    const energy = await this.prisma.$transaction(async (tx) => {
      const dailyEnergy = await tx.dailyEnergy.upsert({
        where: { userId_date: { userId, date } },
        create: { userId, date, globalLevel: 'normal' },
        update: {},
      });

      await tx.systemEnergyOverride.upsert({
        where: {
          dailyEnergyId_systemId: {
            dailyEnergyId: dailyEnergy.id,
            systemId,
          },
        },
        create: {
          dailyEnergyId: dailyEnergy.id,
          systemId,
          level: dto.level,
        },
        update: { level: dto.level },
      });

      return tx.dailyEnergy.findUniqueOrThrow({
        where: { id: dailyEnergy.id },
        include: { overrides: true },
      });
    });

    await this.cache.del(`today:${userId}:${date}`);

    return this.buildResponse(energy);
  }

  private buildResponse(energy: DailyEnergyWithOverrides) {
    const overrides: Record<string, EffortLevel> = {};
    for (const o of energy.overrides) {
      overrides[o.systemId] = o.level;
    }
    return {
      date: energy.date,
      globalLevel: energy.globalLevel,
      overrides,
    };
  }

  private async resolveUser(clerkUserId: string) {
    const user = await this.prisma.userProfile.findUnique({
      where: { clerkUserId },
      select: { id: true },
    });
    if (!user) {
      throw new NotFoundException('User profile not found');
    }
    return user;
  }
}
