import { Injectable, NotFoundException } from '@nestjs/common';
import { EffortLevel } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import type { CreateBundleDto } from './dto/create-bundle.dto';
import type { UpdateBundleDto } from './dto/update-bundle.dto';

const EFFORT_LEVELS: EffortLevel[] = ['baseline', 'normal', 'stretch'];

const ACTIONS_INCLUDE = {
  actions: {
    where: { deletedAt: null },
    select: {
      id: true,
      title: true,
      effortLevel: true,
      anchor: true,
    },
  },
} as const;

@Injectable()
export class ActionBundlesService {
  constructor(private readonly prisma: PrismaService) {}

  async listByArea(clerkUserId: string, areaId: string) {
    const area = await this.findOwnedArea(clerkUserId, areaId);

    return this.prisma.actionBundle.findMany({
      where: { areaId: area.id, deletedAt: null },
      include: ACTIONS_INCLUDE,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async create(clerkUserId: string, areaId: string, dto: CreateBundleDto) {
    const area = await this.findOwnedArea(clerkUserId, areaId);

    return this.prisma.$transaction(async (tx) => {
      const bundle = await tx.actionBundle.create({
        data: { areaId: area.id, bundleTitle: dto.bundleTitle },
      });

      const actions = await Promise.all(
        EFFORT_LEVELS.map((level) =>
          tx.action.create({
            data: {
              bundleId: bundle.id,
              title: dto[level].title,
              effortLevel: level,
              anchor: dto[level].anchor,
            },
          }),
        ),
      );

      return { ...bundle, actions };
    });
  }

  async update(clerkUserId: string, bundleId: string, dto: UpdateBundleDto) {
    const bundle = await this.findOwnedBundle(clerkUserId, bundleId);

    return this.prisma.$transaction(async (tx) => {
      await tx.actionBundle.update({
        where: { id: bundle.id },
        data: { bundleTitle: dto.bundleTitle },
      });

      await Promise.all(
        EFFORT_LEVELS.map((level) =>
          tx.action.update({
            where: {
              bundleId_effortLevel: {
                bundleId: bundle.id,
                effortLevel: level,
              },
            },
            data: {
              title: dto[level].title,
              anchor: dto[level].anchor,
            },
          }),
        ),
      );

      return tx.actionBundle.findUniqueOrThrow({
        where: { id: bundle.id },
        include: ACTIONS_INCLUDE,
      });
    });
  }

  async softDelete(clerkUserId: string, bundleId: string) {
    const bundle = await this.findOwnedBundle(clerkUserId, bundleId);
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      await tx.action.updateMany({
        where: { bundleId: bundle.id },
        data: { deletedAt: now },
      });

      return tx.actionBundle.update({
        where: { id: bundle.id },
        data: { deletedAt: now },
      });
    });
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

  private async findOwnedArea(clerkUserId: string, areaId: string) {
    const { id: userId } = await this.resolveUser(clerkUserId);

    const area = await this.prisma.area.findFirst({
      where: {
        id: areaId,
        deletedAt: null,
        system: { userId, deletedAt: null },
      },
    });
    if (!area) {
      throw new NotFoundException('Area not found');
    }
    return area;
  }

  private async findOwnedBundle(clerkUserId: string, bundleId: string) {
    const { id: userId } = await this.resolveUser(clerkUserId);

    const bundle = await this.prisma.actionBundle.findFirst({
      where: {
        id: bundleId,
        deletedAt: null,
        area: {
          deletedAt: null,
          system: { userId, deletedAt: null },
        },
      },
    });
    if (!bundle) {
      throw new NotFoundException('Action bundle not found');
    }
    return bundle;
  }
}
