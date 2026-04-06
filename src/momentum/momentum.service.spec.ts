import { Test, TestingModule } from '@nestjs/testing';

import { CACHE_SERVICE } from '../cache/cache.interface';
import { MOMENTUM_POINTS, MOMENTUM_TIERS } from '../common/constants/momentum';
import * as dateUtils from '../common/utils/date.utils';
import { PrismaService } from '../prisma/prisma.service';
import { MomentumService } from './momentum.service';

describe('MomentumService', () => {
  let service: MomentumService;
  let prisma: {
    checkin: { findMany: jest.Mock };
  };
  let cache: {
    get: jest.Mock;
    set: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      checkin: {
        findMany: jest.fn(),
      },
    };
    cache = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MomentumService,
        { provide: PrismaService, useValue: prisma },
        { provide: CACHE_SERVICE, useValue: cache },
      ],
    }).compile();

    service = module.get(MomentumService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('resolveTier', () => {
    it('returns first tier and next tier at zero momentum', () => {
      const result = service.resolveTier(0);
      expect(result.momentumTier).toEqual({ ...MOMENTUM_TIERS[0] });
      expect(result.nextTier).toEqual({ ...MOMENTUM_TIERS[1] });
    });

    it('stays on first tier below second threshold', () => {
      const result = service.resolveTier(19);
      expect(result.momentumTier.label).toBe('Getting Started');
      expect(result.nextTier?.threshold).toBe(20);
    });

    it('advances to tier matching exact threshold', () => {
      const result = service.resolveTier(20);
      expect(result.momentumTier.label).toBe('Warming Up');
      expect(result.nextTier?.threshold).toBe(40);
    });

    it('returns top tier with null nextTier at or above max threshold', () => {
      const result = service.resolveTier(100);
      expect(result.momentumTier.label).toBe('Unstoppable');
      expect(result.nextTier).toBeNull();
    });

    it('returns top tier for momentum above defined tiers', () => {
      const result = service.resolveTier(500);
      expect(result.momentumTier.label).toBe('Unstoppable');
      expect(result.nextTier).toBeNull();
    });
  });

  describe('calculateWeeklyMomentum', () => {
    it('sums momentum points and caches result when cache misses', async () => {
      cache.get.mockResolvedValue(null);
      prisma.checkin.findMany.mockResolvedValue([
        { energyLevel: 'baseline' },
        { energyLevel: 'stretch' },
        { energyLevel: 'normal' },
      ]);

      const total = await service.calculateWeeklyMomentum(
        'user-1',
        '2026-01-05',
      );

      expect(total).toBe(
        MOMENTUM_POINTS.baseline +
          MOMENTUM_POINTS.stretch +
          MOMENTUM_POINTS.normal,
      );
      expect(prisma.checkin.findMany).toHaveBeenCalledWith({
        where: {
          system: { userId: 'user-1', deletedAt: null },
          date: { gte: '2026-01-05' },
        },
        select: { energyLevel: true },
      });
      expect(cache.set).toHaveBeenCalledWith(
        'weekly-momentum:user-1',
        total,
        expect.any(Number),
      );
    });

    it('returns cached weekly momentum without querying Prisma', async () => {
      cache.get.mockResolvedValue(42);
      const total = await service.calculateWeeklyMomentum(
        'user-1',
        '2026-01-05',
      );
      expect(total).toBe(42);
      expect(prisma.checkin.findMany).not.toHaveBeenCalled();
    });
  });

  describe('calculateStreak', () => {
    const today = '2026-01-15';

    beforeEach(() => {
      jest.spyOn(dateUtils, 'getTodayInTimezone').mockReturnValue(today);
    });

    it('returns zero when there are no check-in dates', async () => {
      prisma.checkin.findMany.mockResolvedValue([]);
      const streak = await service.calculateStreak('user-1', 'UTC');
      expect(streak).toBe(0);
    });

    it('counts consecutive days including today when today has a check-in', async () => {
      prisma.checkin.findMany.mockResolvedValue([
        { date: today },
        { date: dateUtils.subtractDays(today, 1) },
        { date: dateUtils.subtractDays(today, 2) },
      ]);
      const streak = await service.calculateStreak('user-1', 'UTC');
      expect(streak).toBe(3);
    });

    it('counts from yesterday when today has no check-in', async () => {
      prisma.checkin.findMany.mockResolvedValue([
        { date: dateUtils.subtractDays(today, 1) },
        { date: dateUtils.subtractDays(today, 2) },
      ]);
      const streak = await service.calculateStreak('user-1', 'UTC');
      expect(streak).toBe(2);
    });

    it('stops at first gap in the streak', async () => {
      prisma.checkin.findMany.mockResolvedValue([
        { date: today },
        { date: dateUtils.subtractDays(today, 2) },
      ]);
      const streak = await service.calculateStreak('user-1', 'UTC');
      expect(streak).toBe(1);
    });

    it('returns cached streak without querying Prisma', async () => {
      cache.get.mockResolvedValue(7);
      const streak = await service.calculateStreak('user-1', 'UTC');
      expect(streak).toBe(7);
      expect(prisma.checkin.findMany).not.toHaveBeenCalled();
    });
  });
});
