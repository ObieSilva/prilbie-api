import { ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';

import { CACHE_SERVICE } from '../cache/cache.interface';
import { MOMENTUM_POINTS } from '../common/constants/momentum';
import { PrismaService } from '../prisma/prisma.service';
import { CheckinsService } from './checkins.service';

describe('CheckinsService', () => {
  let service: CheckinsService;
  let prisma: {
    userProfile: { findUnique: jest.Mock };
    action: { findFirst: jest.Mock; findMany: jest.Mock };
    checkin: {
      findMany: jest.Mock;
      create: jest.Mock;
      count: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let cache: { del: jest.Mock };

  beforeEach(async () => {
    prisma = {
      userProfile: {
        findUnique: jest.fn().mockResolvedValue({ id: 'user-profile-1' }),
      },
      action: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      checkin: {
        findMany: jest.fn(),
        create: jest.fn(),
        count: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    cache = {
      del: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CheckinsService,
        { provide: PrismaService, useValue: prisma },
        { provide: CACHE_SERVICE, useValue: cache },
      ],
    }).compile();

    service = module.get(CheckinsService);
  });

  describe('create', () => {
    const systemId = 'sys-1';
    const areaId = 'area-1';
    const actionId = 'action-baseline';

    const baselineAction = {
      id: actionId,
      effortLevel: 'baseline' as const,
      bundle: {
        areaId,
        area: { systemId },
      },
    };

    beforeEach(() => {
      prisma.action.findFirst.mockResolvedValue(baselineAction);
      prisma.checkin.create.mockResolvedValue({
        id: 'checkin-1',
        systemId,
        areaId,
        actionId,
        energyLevel: 'baseline',
        date: '2026-01-10',
        note: null,
      });
      prisma.action.findMany.mockResolvedValue([
        {
          id: 'action-normal-same',
          title: 'N1',
          effortLevel: 'normal' as const,
          bundle: { areaId },
        },
        {
          id: 'action-stretch-other',
          title: 'S1',
          effortLevel: 'stretch' as const,
          bundle: { areaId: 'area-2' },
        },
      ]);
      prisma.checkin.findMany.mockResolvedValue([
        { actionId: 'action-normal-same' },
      ]);
    });

    it('persists systemId and areaId resolved from the action bundle path', async () => {
      await service.create('clerk-1', {
        actionId,
        date: '2026-01-10',
      });

      expect(prisma.checkin.create).toHaveBeenCalledWith({
        data: {
          systemId,
          areaId,
          actionId,
          energyLevel: 'baseline',
          note: undefined,
          date: '2026-01-10',
        },
      });
    });

    it('returns expansion offers sorted with same-area actions first and flags already done', async () => {
      const result = await service.create('clerk-1', {
        actionId,
        date: '2026-01-10',
      });

      expect(result.expansionOffers.map((offer) => offer.actionId)).toEqual([
        'action-normal-same',
        'action-stretch-other',
      ]);
      expect(result.expansionOffers[0]).toMatchObject({
        title: 'N1',
        effortLevel: 'normal',
        momentumPoints: MOMENTUM_POINTS.normal,
        alreadyDoneToday: true,
      });
      expect(result.expansionOffers[1]).toMatchObject({
        alreadyDoneToday: false,
        momentumPoints: MOMENTUM_POINTS.stretch,
      });
    });

    it('returns no expansion offers for stretch effort level', async () => {
      prisma.action.findFirst.mockResolvedValue({
        id: 'action-stretch',
        effortLevel: 'stretch' as const,
        bundle: {
          areaId,
          area: { systemId },
        },
      });
      prisma.checkin.create.mockResolvedValue({
        id: 'checkin-2',
        systemId,
        areaId,
        actionId: 'action-stretch',
        energyLevel: 'stretch',
        date: '2026-01-10',
        note: null,
      });

      const result = await service.create('clerk-1', {
        actionId: 'action-stretch',
        date: '2026-01-10',
      });

      expect(result.expansionOffers).toEqual([]);
      expect(prisma.action.findMany).not.toHaveBeenCalled();
    });

    it('throws ConflictException when unique constraint fails on create', async () => {
      const prismaError = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed',
        { code: 'P2002', clientVersion: 'test' },
      );
      prisma.checkin.create.mockRejectedValue(prismaError);

      await expect(
        service.create('clerk-1', { actionId, date: '2026-01-10' }),
      ).rejects.toThrow(
        new ConflictException(
          'Checkin already exists for this action on this date',
        ),
      );
    });

    it('invalidates momentum and today caches after create', async () => {
      await service.create('clerk-1', { actionId, date: '2026-01-10' });
      expect(cache.del).toHaveBeenCalledWith('streak:user-profile-1');
      expect(cache.del).toHaveBeenCalledWith('weekly-momentum:user-profile-1');
      expect(cache.del).toHaveBeenCalledWith('today:user-profile-1:2026-01-10');
      expect(cache.del).toHaveBeenCalledWith(
        'momentum-overview:user-profile-1',
      );
    });
  });

  describe('list', () => {
    beforeEach(() => {
      prisma.$transaction.mockImplementation((operations: unknown[]) =>
        Promise.all(operations as Promise<unknown>[]),
      );
      prisma.checkin.findMany.mockResolvedValue([]);
      prisma.checkin.count.mockResolvedValue(0);
    });

    it('filters by exact date when date is provided', async () => {
      await service.list('clerk-1', {
        page: 1,
        pageSize: 20,
        date: '2026-01-05',
      });

      const findManyMock = prisma.checkin.findMany as jest.MockedFunction<
        (args: Prisma.CheckinFindManyArgs) => Promise<unknown>
      >;
      expect(findManyMock).toHaveBeenCalled();
      const findManyArgs = findManyMock.mock.calls[0][0];
      expect(findManyArgs).toMatchObject({
        where: { date: '2026-01-05' },
      });
    });

    it('filters by from and to when provided', async () => {
      await service.list('clerk-1', {
        page: 1,
        pageSize: 20,
        from: '2026-01-01',
        to: '2026-01-31',
      });

      const findManyMock = prisma.checkin.findMany as jest.MockedFunction<
        (args: Prisma.CheckinFindManyArgs) => Promise<unknown>
      >;
      expect(findManyMock).toHaveBeenCalled();
      const findManyArgs = findManyMock.mock.calls[0][0];
      expect(findManyArgs).toMatchObject({
        where: {
          date: { gte: '2026-01-01', lte: '2026-01-31' },
        },
      });
    });
  });
});
