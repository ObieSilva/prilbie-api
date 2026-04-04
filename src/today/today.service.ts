import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { EffortLevel } from '@prisma/client';

import { CACHE_SERVICE } from '../cache/cache.interface';
import type { ICacheService } from '../cache/cache.interface';
import { getMonday, getTodayInTimezone } from '../common/utils/date.utils';
import { computeHealth } from '../common/utils/system-health.utils';
import { MomentumService } from '../momentum/momentum.service';
import { PrismaService } from '../prisma/prisma.service';

const TODAY_TTL = 300; // 5 min

@Injectable()
export class TodayService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly momentumService: MomentumService,
    @Inject(CACHE_SERVICE) private readonly cache: ICacheService,
  ) {}

  async getTodayPayload(clerkUserId: string) {
    const user = await this.resolveUser(clerkUserId);
    const today = getTodayInTimezone(user.timezone);

    const cacheKey = `today:${user.id}:${today}`;
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

    const mondayOfWeek = getMonday(today);

    const [systems, todayCheckins, energy, reflection, streak, weeklyMomentum] =
      await Promise.all([
        this.prisma.system.findMany({
          where: { userId: user.id, deletedAt: null },
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
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        }),
        this.prisma.checkin.findMany({
          where: { system: { userId: user.id, deletedAt: null }, date: today },
          select: {
            id: true,
            systemId: true,
            areaId: true,
            actionId: true,
            energyLevel: true,
            note: true,
            date: true,
          },
        }),
        this.prisma.dailyEnergy.findUnique({
          where: { userId_date: { userId: user.id, date: today } },
          include: { overrides: true },
        }),
        this.prisma.dailyReflection.findUnique({
          where: { userId_date: { userId: user.id, date: today } },
          select: { text: true },
        }),
        this.momentumService.calculateStreak(user.id, user.timezone),
        this.momentumService.calculateWeeklyMomentum(user.id, mondayOfWeek),
      ]);

    const { momentumTier, nextTier } =
      this.momentumService.resolveTier(weeklyMomentum);

    const overrides: Record<string, EffortLevel> = {};
    if (energy) {
      for (const o of energy.overrides) {
        overrides[o.systemId] = o.level;
      }
    }

    const payload = {
      user: {
        userName: user.userName,
        onboarded: user.onboarded,
        timezone: user.timezone,
        lastReviewDate: user.lastReviewDate
          ? user.lastReviewDate.toISOString().slice(0, 10)
          : null,
        lastMilestoneSeen: user.lastMilestoneSeen,
        accountCreatedAt: user.createdAt?.toISOString() ?? null,
        focusedActionId: user.focusedActionId,
      },
      energy: {
        globalLevel: energy?.globalLevel ?? null,
        overrides,
      },
      systems: systems.map(({ areas, checkins, ...sys }) => ({
        system: {
          id: sys.id,
          name: sys.name,
          icon: sys.icon,
          replacedHabit: sys.replacedHabit,
          sortOrder: sys.sortOrder,
        },
        ...computeHealth(checkins[0]?.date, today),
        areas: areas.map(({ bundles, ...area }) => ({
          area: {
            id: area.id,
            name: area.name,
            sortOrder: area.sortOrder,
          },
          bundles: bundles.map(({ actions, ...bundle }) => ({
            bundle: {
              id: bundle.id,
              bundleTitle: bundle.bundleTitle,
              sortOrder: bundle.sortOrder,
            },
            actions,
          })),
        })),
      })),
      todayCheckins,
      streak,
      weeklyMomentum,
      momentumTier,
      nextTier,
      reflection: reflection?.text ?? null,
    };

    await this.cache.set(cacheKey, payload, TODAY_TTL);
    return payload;
  }

  private async resolveUser(clerkUserId: string) {
    const user = await this.prisma.userProfile.findUnique({
      where: { clerkUserId },
      select: {
        id: true,
        userName: true,
        onboarded: true,
        timezone: true,
        lastReviewDate: true,
        lastMilestoneSeen: true,
        focusedActionId: true,
        createdAt: true,
      },
    });
    if (!user) {
      throw new NotFoundException('User profile not found');
    }
    return user;
  }
}
