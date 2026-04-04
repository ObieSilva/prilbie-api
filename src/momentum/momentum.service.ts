import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { EffortLevel } from '@prisma/client';

import { CACHE_SERVICE } from '../cache/cache.interface';
import type { ICacheService } from '../cache/cache.interface';
import { MOMENTUM_POINTS, MOMENTUM_TIERS } from '../common/constants/momentum';
import type { PaginationDto } from '../common/dto/pagination.dto';
import {
  addDays,
  getMonday,
  getTodayInTimezone,
  subtractDays,
} from '../common/utils/date.utils';
import { PrismaService } from '../prisma/prisma.service';

const EFFORT_RANK: Record<EffortLevel, number> = {
  baseline: 0,
  normal: 1,
  stretch: 2,
};

const RANK_TO_LEVEL = Object.fromEntries(
  Object.entries(EFFORT_RANK).map(([level, rank]) => [rank, level]),
) as Record<number, EffortLevel>;

const OVERVIEW_TTL = 600; // 10 min
const STREAK_TTL = 86_400; // 24 h
const WEEKLY_MOMENTUM_TTL = 3_600; // 1 h

@Injectable()
export class MomentumService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_SERVICE) private readonly cache: ICacheService,
  ) {}

  async getOverview(clerkUserId: string) {
    const { id: userId, timezone } = await this.resolveUser(clerkUserId);

    const cached = await this.cache.get<ReturnType<typeof this.buildOverview>>(
      `momentum-overview:${userId}`,
    );
    if (cached) return cached;

    const today = getTodayInTimezone(timezone);
    const mondayOfWeek = getMonday(today);

    const [
      streak,
      weeklyMomentum,
      effortCounts,
      weeklyGroups,
      perSystemRows,
      activeDays,
    ] = await Promise.all([
      this.calculateStreak(userId, timezone),
      this.calculateWeeklyMomentum(userId, mondayOfWeek),
      this.prisma.checkin.groupBy({
        by: ['energyLevel'],
        where: { system: { userId, deletedAt: null } },
        _count: true,
      }),
      this.getWeeklyMomentumGroups(userId),
      this.prisma.checkin.groupBy({
        by: ['systemId', 'energyLevel'],
        where: { system: { userId, deletedAt: null } },
        _count: true,
      }),
      this.prisma.checkin.findMany({
        where: { system: { userId, deletedAt: null } },
        select: { date: true },
        distinct: ['date'],
      }),
    ]);

    const systems = await this.prisma.system.findMany({
      where: {
        userId,
        deletedAt: null,
        id: { in: perSystemRows.map((r) => r.systemId) },
      },
      select: { id: true, name: true, icon: true },
    });
    const systemMap = new Map(systems.map((system) => [system.id, system]));

    const result = this.buildOverview(
      streak,
      weeklyMomentum,
      effortCounts,
      weeklyGroups,
      perSystemRows,
      systemMap,
      activeDays.length,
    );

    await this.cache.set(`momentum-overview:${userId}`, result, OVERVIEW_TTL);
    return result;
  }

  async getWeekGrid(clerkUserId: string) {
    const { id: userId, timezone } = await this.resolveUser(clerkUserId);
    const today = getTodayInTimezone(timezone);

    const dates = Array.from({ length: 7 }, (_, day) =>
      subtractDays(today, 6 - day),
    );

    const checkins = await this.prisma.checkin.findMany({
      where: {
        system: { userId, deletedAt: null },
        date: { in: dates },
      },
      select: { date: true, energyLevel: true },
    });

    const checkinsByDate = new Map<
      string,
      { count: number; maxRank: number }
    >();
    for (const checkin of checkins) {
      const entry = checkinsByDate.get(checkin.date) ?? {
        count: 0,
        maxRank: -1,
      };
      entry.count++;
      entry.maxRank = Math.max(entry.maxRank, EFFORT_RANK[checkin.energyLevel]);
      checkinsByDate.set(checkin.date, entry);
    }

    return dates.map((date) => {
      const entry = checkinsByDate.get(date);
      return {
        date,
        maxLevel: entry ? RANK_TO_LEVEL[entry.maxRank] : null,
        checkinCount: entry?.count ?? 0,
      };
    });
  }

  async getHistory(clerkUserId: string, pagination: PaginationDto) {
    const { id: userId } = await this.resolveUser(clerkUserId);
    const { page, pageSize } = pagination;

    const weeklyGroups = await this.getWeeklyMomentumGroups(userId);

    const total = weeklyGroups.length;
    const start = (page - 1) * pageSize;
    const paged = weeklyGroups.slice(start, start + pageSize);

    return {
      data: paged,
      meta: { page, pageSize, total },
    };
  }

  async getWeekDetail(clerkUserId: string, weekStart: string) {
    const { id: userId } = await this.resolveUser(clerkUserId);

    const dates = Array.from({ length: 7 }, (_, day) =>
      addDays(weekStart, day),
    );

    const checkins = await this.prisma.checkin.findMany({
      where: {
        system: { userId, deletedAt: null },
        date: { in: dates },
      },
      select: { date: true, energyLevel: true },
    });

    const momentumByDate = new Map<
      string,
      { momentum: number; count: number }
    >();
    for (const checkin of checkins) {
      const entry = momentumByDate.get(checkin.date) ?? {
        momentum: 0,
        count: 0,
      };
      entry.momentum += MOMENTUM_POINTS[checkin.energyLevel];
      entry.count++;
      momentumByDate.set(checkin.date, entry);
    }

    return dates.map((date) => ({
      date,
      momentum: momentumByDate.get(date)?.momentum ?? 0,
      checkinCount: momentumByDate.get(date)?.count ?? 0,
    }));
  }

  async getDayDetail(clerkUserId: string, date: string) {
    const { id: userId } = await this.resolveUser(clerkUserId);

    const [checkins, reflection] = await Promise.all([
      this.prisma.checkin.findMany({
        where: {
          system: { userId, deletedAt: null },
          date,
        },
        select: {
          id: true,
          systemId: true,
          energyLevel: true,
          note: true,
          action: { select: { title: true } },
          system: { select: { name: true, icon: true } },
        },
      }),
      this.prisma.dailyReflection.findUnique({
        where: { userId_date: { userId, date } },
        select: { text: true },
      }),
    ]);

    const systemMap = new Map<
      string,
      {
        systemId: string;
        systemName: string;
        systemIcon: string;
        momentum: number;
        checkins: Array<{
          id: string;
          actionTitle: string;
          energyLevel: EffortLevel;
          points: number;
          note: string | null;
        }>;
      }
    >();

    for (const checkin of checkins) {
      const points = MOMENTUM_POINTS[checkin.energyLevel];

      if (!systemMap.has(checkin.systemId)) {
        systemMap.set(checkin.systemId, {
          systemId: checkin.systemId,
          systemName: checkin.system.name,
          systemIcon: checkin.system.icon,
          momentum: 0,
          checkins: [],
        });
      }

      const entry = systemMap.get(checkin.systemId)!;
      entry.momentum += points;
      entry.checkins.push({
        id: checkin.id,
        actionTitle: checkin.action.title,
        energyLevel: checkin.energyLevel,
        points,
        note: checkin.note,
      });
    }

    const totalMomentum = [...systemMap.values()].reduce(
      (sum, system) => sum + system.momentum,
      0,
    );

    return {
      date,
      totalMomentum,
      reflection: reflection?.text ?? null,
      systems: [...systemMap.values()],
    };
  }

  async calculateStreak(userId: string, timezone: string): Promise<number> {
    const cached = await this.cache.get<number>(`streak:${userId}`);
    if (cached !== null) return cached;

    const today = getTodayInTimezone(timezone);

    const checkinDates = new Set(
      (
        await this.prisma.checkin.findMany({
          where: { system: { userId, deletedAt: null } },
          select: { date: true },
          distinct: ['date'],
          orderBy: { date: 'desc' },
        })
      ).map((row) => row.date),
    );

    const startOffset = checkinDates.has(today) ? 0 : 1;
    let streak = 0;
    for (
      let daysBack = startOffset;
      checkinDates.has(subtractDays(today, daysBack));
      daysBack++
    ) {
      streak++;
    }

    await this.cache.set(`streak:${userId}`, streak, STREAK_TTL);
    return streak;
  }

  async calculateWeeklyMomentum(
    userId: string,
    mondayOfWeek: string,
  ): Promise<number> {
    const cached = await this.cache.get<number>(`weekly-momentum:${userId}`);
    if (cached !== null) return cached;

    const checkins = await this.prisma.checkin.findMany({
      where: {
        system: { userId, deletedAt: null },
        date: { gte: mondayOfWeek },
      },
      select: { energyLevel: true },
    });

    const total = checkins.reduce(
      (sum, checkin) => sum + MOMENTUM_POINTS[checkin.energyLevel],
      0,
    );

    await this.cache.set(
      `weekly-momentum:${userId}`,
      total,
      WEEKLY_MOMENTUM_TTL,
    );
    return total;
  }

  /**
   * Groups all checkins into ISO weeks (Mon-Sun) with total momentum per week,
   * sorted newest-first.
   */
  private async getWeeklyMomentumGroups(userId: string) {
    const checkins = await this.prisma.checkin.findMany({
      where: { system: { userId, deletedAt: null } },
      select: { date: true, energyLevel: true },
      orderBy: { date: 'desc' },
    });

    const momentumByWeek = new Map<string, number>();
    for (const checkin of checkins) {
      const monday = getMonday(checkin.date);
      momentumByWeek.set(
        monday,
        (momentumByWeek.get(monday) ?? 0) +
          MOMENTUM_POINTS[checkin.energyLevel],
      );
    }

    return [...momentumByWeek.entries()]
      .sort(([a], [b]) => b.localeCompare(a)) // newest first
      .map(([weekStart, totalMomentum]) => ({
        weekStart,
        weekEnd: addDays(weekStart, 6),
        totalMomentum,
      }));
  }

  private buildOverview(
    streak: number,
    weeklyMomentum: number,
    effortCounts: Array<{ energyLevel: EffortLevel; _count: number }>,
    weeklyGroups: Array<{
      weekStart: string;
      weekEnd: string;
      totalMomentum: number;
    }>,
    perSystemRows: Array<{
      systemId: string;
      energyLevel: EffortLevel;
      _count: number;
    }>,
    systemMap: Map<string, { id: string; name: string; icon: string }>,
    totalActiveDays: number,
  ) {
    const countsByLevel: Record<EffortLevel, number> = {
      baseline: 0,
      normal: 0,
      stretch: 0,
    };
    for (const row of effortCounts) {
      countsByLevel[row.energyLevel] = row._count;
    }

    const totalCheckins = Object.values(countsByLevel).reduce(
      (sum, count) => sum + count,
      0,
    );
    const totalMomentum = Object.entries(countsByLevel).reduce(
      (sum, [level, count]) =>
        sum + count * MOMENTUM_POINTS[level as EffortLevel],
      0,
    );

    const bestWeekMomentum = weeklyGroups.reduce(
      (max, week) => Math.max(max, week.totalMomentum),
      0,
    );

    const tier = this.resolveTier(weeklyMomentum);

    const perSystemMap = new Map<
      string,
      { total: number; baseline: number; normal: number; stretch: number }
    >();
    for (const row of perSystemRows) {
      if (!perSystemMap.has(row.systemId)) {
        perSystemMap.set(row.systemId, {
          total: 0,
          baseline: 0,
          normal: 0,
          stretch: 0,
        });
      }
      const entry = perSystemMap.get(row.systemId)!;
      entry[row.energyLevel] += row._count;
      entry.total += row._count;
    }

    const perSystemStats = [...perSystemMap.entries()]
      .filter(([id]) => systemMap.has(id))
      .map(([id, counts]) => {
        const system = systemMap.get(id)!;
        return {
          systemId: id,
          systemName: system.name,
          systemIcon: system.icon,
          ...counts,
        };
      });

    return {
      streak,
      totalActiveDays,
      totalCheckins,
      totalMomentum,
      baselineCount: countsByLevel.baseline,
      normalCount: countsByLevel.normal,
      stretchCount: countsByLevel.stretch,
      weeklyMomentum,
      bestWeekMomentum,
      ...tier,
      perSystemStats,
    };
  }

  resolveTier(weeklyMomentum: number) {
    const matchedIndex = MOMENTUM_TIERS.reduce(
      (lastMatch, tier, index) =>
        weeklyMomentum >= tier.threshold ? index : lastMatch,
      0,
    );

    const currentTier = MOMENTUM_TIERS[matchedIndex];
    const nextTier = MOMENTUM_TIERS[matchedIndex + 1] ?? null;

    return {
      momentumTier: { ...currentTier },
      nextTier: nextTier ? { ...nextTier } : null,
    };
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
}
