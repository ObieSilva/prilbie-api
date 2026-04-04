import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { getTodayInTimezone } from '../common/utils/date.utils';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateSystemDto } from './dto/create-system.dto';
import type { ReorderSystemsDto } from './dto/reorder-systems.dto';
import type { UpdateSystemDto } from './dto/update-system.dto';

type HealthStatus = 'maintained' | 'healthy' | 'attention' | 'neglected';

const HEALTH_MAP: Record<HealthStatus, string> = {
  maintained: 'Maintained',
  healthy: 'Healthy',
  attention: 'Needs attention',
  neglected: 'Neglected',
};

@Injectable()
export class SystemsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(clerkUserId: string) {
    const { id: userId, timezone } = await this.resolveUser(clerkUserId);
    const today = getTodayInTimezone(timezone);

    const systems = await this.prisma.system.findMany({
      where: { userId, deletedAt: null },
      include: {
        areas: {
          where: { deletedAt: null },
          select: {
            id: true,
            _count: { select: { bundles: { where: { deletedAt: null } } } },
          },
        },
        checkins: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { date: true },
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });

    return systems.map(({ areas, checkins, ...system }) => ({
      ...system,
      areaCount: areas.length,
      bundleCount: areas.reduce((sum, a) => sum + a._count.bundles, 0),
      ...this.computeHealth(checkins[0]?.date, today),
    }));
  }

  async getById(clerkUserId: string, systemId: string) {
    const { id: userId, timezone } = await this.resolveUser(clerkUserId);
    const today = getTodayInTimezone(timezone);

    const system = await this.prisma.system.findFirst({
      where: { id: systemId, userId, deletedAt: null },
      include: {
        areas: {
          where: { deletedAt: null },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          include: {
            bundles: {
              where: { deletedAt: null },
              orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
              include: {
                actions: {
                  where: { deletedAt: null },
                  select: {
                    id: true,
                    title: true,
                    effortLevel: true,
                    anchor: true,
                  },
                },
              },
            },
          },
        },
        checkins: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { date: true },
        },
      },
    });

    if (!system) {
      throw new NotFoundException('System not found');
    }

    const { checkins, ...rest } = system;
    return {
      ...rest,
      ...this.computeHealth(checkins[0]?.date, today),
    };
  }

  async create(clerkUserId: string, dto: CreateSystemDto) {
    const { id: userId } = await this.resolveUser(clerkUserId);

    return this.prisma.$transaction(async (tx) => {
      const system = await tx.system.create({
        data: {
          userId,
          name: dto.name,
          icon: dto.icon,
          replacedHabit: dto.replacedHabit,
        },
      });

      const area = await tx.area.create({
        data: { systemId: system.id, name: 'General' },
      });

      return { ...system, areas: [area] };
    });
  }

  async update(clerkUserId: string, systemId: string, dto: UpdateSystemDto) {
    const system = await this.findOwnedSystem(clerkUserId, systemId);

    return this.prisma.system.update({
      where: { id: system.id },
      data: dto,
    });
  }

  async softDelete(clerkUserId: string, systemId: string) {
    const system = await this.findOwnedSystem(clerkUserId, systemId);

    return this.prisma.system.update({
      where: { id: system.id },
      data: { deletedAt: new Date() },
    });
  }

  async reorder(clerkUserId: string, dto: ReorderSystemsDto) {
    const { id: userId } = await this.resolveUser(clerkUserId);

    return this.prisma.$transaction(async (tx) => {
      const systems = await tx.system.findMany({
        where: { id: { in: dto.orderedIds }, userId, deletedAt: null },
        select: { id: true },
      });

      const foundIds = new Set(systems.map((s) => s.id));
      const missing = dto.orderedIds.filter((id) => !foundIds.has(id));
      if (missing.length > 0) {
        throw new BadRequestException(
          `Systems not found or not owned: ${missing.join(', ')}`,
        );
      }

      await Promise.all(
        dto.orderedIds.map((id, index) =>
          tx.system.update({ where: { id }, data: { sortOrder: index } }),
        ),
      );
    });
  }

  private async resolveUser(clerkUserId: string) {
    const user = await this.prisma.userProfile.findUnique({
      where: { clerkUserId },
      select: { id: true, timezone: true },
    });
    if (!user) {
      throw new NotFoundException('User profile not found');
    }
    return user;
  }

  private async findOwnedSystem(clerkUserId: string, systemId: string) {
    const { id: userId } = await this.resolveUser(clerkUserId);

    const system = await this.prisma.system.findFirst({
      where: { id: systemId, userId, deletedAt: null },
    });
    if (!system) {
      throw new NotFoundException('System not found');
    }
    return system;
  }

  private computeHealth(
    lastCheckinDate: string | undefined,
    today: string,
  ): { healthStatus: HealthStatus; healthLabel: string } {
    if (!lastCheckinDate) {
      return { healthStatus: 'healthy', healthLabel: HEALTH_MAP.healthy };
    }

    const diffMs =
      new Date(today).getTime() - new Date(lastCheckinDate).getTime();
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (days <= 0)
      return {
        healthStatus: 'maintained',
        healthLabel: HEALTH_MAP.maintained,
      };
    if (days <= 2)
      return { healthStatus: 'healthy', healthLabel: HEALTH_MAP.healthy };
    if (days <= 5)
      return { healthStatus: 'attention', healthLabel: HEALTH_MAP.attention };
    return { healthStatus: 'neglected', healthLabel: HEALTH_MAP.neglected };
  }
}
