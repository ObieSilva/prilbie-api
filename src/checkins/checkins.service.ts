import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, EffortLevel } from '@prisma/client';

import { CACHE_SERVICE } from '../cache/cache.interface';
import type { ICacheService } from '../cache/cache.interface';
import { MOMENTUM_POINTS } from '../common/constants/momentum';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateCheckinDto } from './dto/create-checkin.dto';
import type { ListCheckinsDto } from './dto/list-checkins.dto';

const HIGHER_LEVELS: Record<EffortLevel, EffortLevel[]> = {
  baseline: ['normal', 'stretch'],
  normal: ['stretch'],
  stretch: [],
};

@Injectable()
export class CheckinsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_SERVICE) private readonly cache: ICacheService,
  ) {}

  async list(clerkUserId: string, filters: ListCheckinsDto) {
    const { id: userId } = await this.resolveUser(clerkUserId);
    const { page, pageSize, date, systemId, from, to } = filters;

    const where: Prisma.CheckinWhereInput = {
      system: { userId, deletedAt: null },
      ...(systemId && { systemId }),
      ...this.buildDateFilter(date, from, to),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.checkin.findMany({
        where,
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.checkin.count({ where }),
    ]);

    return { data, meta: { page, pageSize, total } };
  }

  async create(clerkUserId: string, dto: CreateCheckinDto) {
    const { id: userId } = await this.resolveUser(clerkUserId);

    const action = await this.prisma.action.findFirst({
      where: {
        id: dto.actionId,
        deletedAt: null,
        bundle: {
          deletedAt: null,
          area: {
            deletedAt: null,
            system: { userId, deletedAt: null },
          },
        },
      },
      include: {
        bundle: {
          select: { areaId: true, area: { select: { systemId: true } } },
        },
      },
    });
    if (!action) {
      throw new NotFoundException('Action not found');
    }

    const systemId = action.bundle.area.systemId;
    const areaId = action.bundle.areaId;

    let checkin;
    try {
      checkin = await this.prisma.checkin.create({
        data: {
          systemId,
          areaId,
          actionId: dto.actionId,
          energyLevel: action.effortLevel,
          note: dto.note,
          date: dto.date,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Checkin already exists for this action on this date',
        );
      }
      throw error;
    }

    const expansionOffers = await this.computeExpansionOffers(
      action.effortLevel,
      systemId,
      areaId,
      dto.date,
    );

    await this.invalidateCache(userId, dto.date);

    return { checkin, expansionOffers };
  }

  async delete(clerkUserId: string, checkinId: string) {
    const { id: userId } = await this.resolveUser(clerkUserId);

    const checkin = await this.prisma.checkin.findFirst({
      where: { id: checkinId, system: { userId } },
    });
    if (!checkin) {
      throw new NotFoundException('Checkin not found');
    }

    await this.prisma.checkin.delete({ where: { id: checkin.id } });

    await this.invalidateCache(userId, checkin.date);

    return checkin;
  }

  private async computeExpansionOffers(
    effortLevel: EffortLevel,
    systemId: string,
    areaId: string,
    date: string,
  ) {
    const higherLevels = HIGHER_LEVELS[effortLevel];
    if (higherLevels.length === 0) return [];

    const actions = await this.prisma.action.findMany({
      where: {
        effortLevel: { in: higherLevels },
        deletedAt: null,
        bundle: {
          deletedAt: null,
          area: {
            deletedAt: null,
            systemId,
            system: { deletedAt: null },
          },
        },
      },
      select: {
        id: true,
        title: true,
        effortLevel: true,
        bundle: { select: { areaId: true } },
      },
    });

    const doneActionIds = new Set(
      (
        await this.prisma.checkin.findMany({
          where: { actionId: { in: actions.map((a) => a.id) }, date },
          select: { actionId: true },
        })
      ).map((c) => c.actionId),
    );

    actions.sort((a, b) => {
      const aLocal = a.bundle.areaId === areaId ? 0 : 1;
      const bLocal = b.bundle.areaId === areaId ? 0 : 1;
      if (aLocal !== bLocal) return aLocal - bLocal;
      return a.id.localeCompare(b.id);
    });

    return actions.map((a) => ({
      actionId: a.id,
      title: a.title,
      effortLevel: a.effortLevel,
      momentumPoints: MOMENTUM_POINTS[a.effortLevel],
      alreadyDoneToday: doneActionIds.has(a.id),
    }));
  }

  private async invalidateCache(userId: string, date: string) {
    await Promise.all([
      this.cache.del(`streak:${userId}`),
      this.cache.del(`weekly-momentum:${userId}`),
      this.cache.del(`today:${userId}:${date}`),
      this.cache.del(`momentum-overview:${userId}`),
    ]);
  }

  private buildDateFilter(
    date?: string,
    from?: string,
    to?: string,
  ): Pick<Prisma.CheckinWhereInput, 'date'> {
    if (date) return { date };
    if (from || to) {
      return {
        date: {
          ...(from && { gte: from }),
          ...(to && { lte: to }),
        },
      };
    }
    return {};
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
