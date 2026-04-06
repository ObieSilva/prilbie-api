import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';
import type { OnboardingDto } from './dto/onboarding.dto';
import { UsersService } from './users.service';

function sampleOnboardingDto(): OnboardingDto {
  return {
    userName: 'Alex',
    timezone: 'America/New_York',
    system: { name: 'Fitness', icon: 'fitness', replacedHabit: 'Scrolling' },
    bundle: {
      bundleTitle: 'Morning block',
      baseline: { title: 'Walk 10m', anchor: 'morning' },
      normal: { title: 'Walk 20m', anchor: 'midday' },
      stretch: { title: 'Run 5k', anchor: 'evening' },
    },
  } as OnboardingDto;
}

describe('UsersService', () => {
  let service: UsersService;
  let prisma: {
    userProfile: {
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      userProfile: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [UsersService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(UsersService);
  });

  describe('onboard', () => {
    const clerkUserId = 'clerk-user-1';
    const dto = sampleOnboardingDto();

    it('runs profile update then system, area, bundle, and three actions in one transaction', async () => {
      const userRow = {
        id: 'profile-1',
        clerkUserId,
        userName: 'Old',
        timezone: 'UTC',
        onboarded: false,
      };

      const updatedUser = {
        ...userRow,
        userName: dto.userName,
        timezone: dto.timezone,
        onboarded: true,
      };

      const systemRow = {
        id: 'system-1',
        userId: userRow.id,
        name: dto.system.name,
        icon: dto.system.icon,
        replacedHabit: dto.system.replacedHabit,
      };
      const areaRow = {
        id: 'area-1',
        systemId: systemRow.id,
        name: 'General',
      };
      const bundleRow = {
        id: 'bundle-1',
        areaId: areaRow.id,
        bundleTitle: dto.bundle.bundleTitle,
      };

      type TransactionClient = {
        userProfile: {
          findUnique: jest.Mock;
          update: jest.Mock;
        };
        system: { create: jest.Mock };
        area: { create: jest.Mock };
        actionBundle: { create: jest.Mock };
        action: { create: jest.Mock };
      };

      let transactionClient: TransactionClient;

      prisma.$transaction.mockImplementation(
        async (callback: (tx: TransactionClient) => Promise<unknown>) => {
          transactionClient = {
            userProfile: {
              findUnique: jest.fn().mockResolvedValue(userRow),
              update: jest.fn().mockResolvedValue(updatedUser),
            },
            system: {
              create: jest.fn().mockResolvedValue(systemRow),
            },
            area: {
              create: jest.fn().mockResolvedValue(areaRow),
            },
            actionBundle: {
              create: jest.fn().mockResolvedValue(bundleRow),
            },
            action: {
              create: jest
                .fn()
                .mockResolvedValueOnce({
                  id: 'action-baseline',
                  bundleId: bundleRow.id,
                  title: dto.bundle.baseline.title,
                  effortLevel: 'baseline',
                  anchor: dto.bundle.baseline.anchor,
                })
                .mockResolvedValueOnce({
                  id: 'action-normal',
                  bundleId: bundleRow.id,
                  title: dto.bundle.normal.title,
                  effortLevel: 'normal',
                  anchor: dto.bundle.normal.anchor,
                })
                .mockResolvedValueOnce({
                  id: 'action-stretch',
                  bundleId: bundleRow.id,
                  title: dto.bundle.stretch.title,
                  effortLevel: 'stretch',
                  anchor: dto.bundle.stretch.anchor,
                }),
            },
          };
          return callback(transactionClient);
        },
      );

      const result = await service.onboard(clerkUserId, dto);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(transactionClient!.userProfile.findUnique).toHaveBeenCalledWith({
        where: { clerkUserId },
      });
      expect(transactionClient!.userProfile.update).toHaveBeenCalledWith({
        where: { clerkUserId },
        data: {
          userName: dto.userName,
          timezone: dto.timezone,
          onboarded: true,
        },
      });
      expect(transactionClient!.system.create).toHaveBeenCalledWith({
        data: {
          userId: userRow.id,
          name: dto.system.name,
          icon: dto.system.icon,
          replacedHabit: dto.system.replacedHabit,
        },
      });
      expect(transactionClient!.area.create).toHaveBeenCalledWith({
        data: { systemId: systemRow.id, name: 'General' },
      });
      expect(transactionClient!.actionBundle.create).toHaveBeenCalledWith({
        data: {
          areaId: areaRow.id,
          bundleTitle: dto.bundle.bundleTitle,
        },
      });
      expect(transactionClient!.action.create).toHaveBeenCalledTimes(3);
      expect(transactionClient!.action.create).toHaveBeenNthCalledWith(1, {
        data: {
          bundleId: bundleRow.id,
          title: dto.bundle.baseline.title,
          effortLevel: 'baseline',
          anchor: dto.bundle.baseline.anchor,
        },
      });
      expect(transactionClient!.action.create).toHaveBeenNthCalledWith(2, {
        data: {
          bundleId: bundleRow.id,
          title: dto.bundle.normal.title,
          effortLevel: 'normal',
          anchor: dto.bundle.normal.anchor,
        },
      });
      expect(transactionClient!.action.create).toHaveBeenNthCalledWith(3, {
        data: {
          bundleId: bundleRow.id,
          title: dto.bundle.stretch.title,
          effortLevel: 'stretch',
          anchor: dto.bundle.stretch.anchor,
        },
      });

      const actions = result.systems[0].areas[0].bundles[0].actions as Array<{
        effortLevel: string;
      }>;
      expect(actions.map((action) => action.effortLevel)).toEqual([
        'baseline',
        'normal',
        'stretch',
      ]);
      expect(result.onboarded).toBe(true);
    });

    it('throws ConflictException when user is already onboarded', async () => {
      prisma.$transaction.mockImplementation(
        async (callback: (tx: Record<string, unknown>) => Promise<unknown>) => {
          const tx = {
            userProfile: {
              findUnique: jest.fn().mockResolvedValue({
                id: 'profile-1',
                onboarded: true,
              }),
            },
          };
          return callback(tx);
        },
      );

      await expect(service.onboard(clerkUserId, dto)).rejects.toThrow(
        ConflictException,
      );
    });

    it('throws NotFoundException when profile does not exist', async () => {
      prisma.$transaction.mockImplementation(
        async (callback: (tx: Record<string, unknown>) => Promise<unknown>) => {
          const tx = {
            userProfile: {
              findUnique: jest.fn().mockResolvedValue(null),
            },
          };
          return callback(tx);
        },
      );

      await expect(service.onboard(clerkUserId, dto)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
