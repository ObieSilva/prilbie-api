import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import * as dateUtils from '../common/utils/date.utils';
import { PrismaService } from '../prisma/prisma.service';
import { SystemsService } from './systems.service';

function systemListRow(checkinDate: string | undefined) {
  return {
    id: 'sys-1',
    name: 'Training',
    icon: 'fitness',
    userId: 'profile-1',
    replacedHabit: null,
    sortOrder: 0,
    deletedAt: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    areas: [{ id: 'area-1', _count: { bundles: 2 } }],
    checkins: checkinDate ? [{ date: checkinDate }] : [],
  };
}

describe('SystemsService', () => {
  let service: SystemsService;
  let prisma: {
    userProfile: { findUnique: jest.Mock };
    system: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      userProfile: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'profile-1',
          timezone: 'UTC',
        }),
      },
      system: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [SystemsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(SystemsService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('list — system health', () => {
    const today = '2026-01-20';

    beforeEach(() => {
      jest.spyOn(dateUtils, 'getTodayInTimezone').mockReturnValue(today);
    });

    it('returns maintained when last check-in is today', async () => {
      prisma.system.findMany.mockResolvedValue([systemListRow(today)]);
      const result = await service.list('clerk-1');
      expect(result[0].healthStatus).toBe('maintained');
      expect(result[0].healthLabel).toBe('Maintained');
    });

    it('returns healthy when last check-in is 1–2 days ago', async () => {
      prisma.system.findMany.mockResolvedValue([systemListRow('2026-01-19')]);
      const result = await service.list('clerk-1');
      expect(result[0].healthStatus).toBe('healthy');
      expect(result[0].healthLabel).toBe('Healthy');
    });

    it('returns attention when last check-in is 3–5 days ago', async () => {
      prisma.system.findMany.mockResolvedValue([systemListRow('2026-01-17')]);
      const result = await service.list('clerk-1');
      expect(result[0].healthStatus).toBe('attention');
      expect(result[0].healthLabel).toBe('Needs attention');
    });

    it('returns neglected when last check-in is 6+ days ago', async () => {
      prisma.system.findMany.mockResolvedValue([systemListRow('2026-01-13')]);
      const result = await service.list('clerk-1');
      expect(result[0].healthStatus).toBe('neglected');
      expect(result[0].healthLabel).toBe('Neglected');
    });

    it('returns healthy when there is no check-in yet', async () => {
      prisma.system.findMany.mockResolvedValue([systemListRow(undefined)]);
      const result = await service.list('clerk-1');
      expect(result[0].healthStatus).toBe('healthy');
      expect(result[0].healthLabel).toBe('Healthy');
    });
  });

  describe('getById — system health', () => {
    const today = '2026-01-20';

    beforeEach(() => {
      jest.spyOn(dateUtils, 'getTodayInTimezone').mockReturnValue(today);
    });

    it('merges health from latest check-in date', async () => {
      prisma.system.findFirst.mockResolvedValue({
        id: 'sys-1',
        name: 'Training',
        icon: 'fitness',
        userId: 'profile-1',
        replacedHabit: null,
        sortOrder: 0,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        areas: [],
        checkins: [{ date: '2026-01-17' }],
      });

      const result = await service.getById('clerk-1', 'sys-1');
      expect(result.healthStatus).toBe('attention');
      expect(result.areas).toEqual([]);
    });

    it('throws when system is not found', async () => {
      prisma.system.findFirst.mockResolvedValue(null);
      await expect(service.getById('clerk-1', 'missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('reorder', () => {
    it('throws when some ordered ids are missing or not owned', async () => {
      prisma.$transaction.mockImplementation(
        async (callback: (tx: unknown) => Promise<unknown>) => {
          const tx = {
            system: {
              findMany: jest
                .fn()
                .mockResolvedValue([{ id: 'sys-a' }, { id: 'sys-b' }]),
              update: jest.fn().mockResolvedValue({}),
            },
          };
          return callback(tx);
        },
      );

      await expect(
        service.reorder('clerk-1', {
          orderedIds: ['sys-a', 'sys-b', 'sys-c'],
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
