import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import type { CreateAreaDto } from './dto/create-area.dto';
import type { UpdateAreaDto } from './dto/update-area.dto';

@Injectable()
export class AreasService {
  constructor(private readonly prisma: PrismaService) {}

  async listBySystem(clerkUserId: string, systemId: string) {
    const system = await this.findOwnedSystem(clerkUserId, systemId);

    return this.prisma.area.findMany({
      where: { systemId: system.id, deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async create(clerkUserId: string, systemId: string, dto: CreateAreaDto) {
    const system = await this.findOwnedSystem(clerkUserId, systemId);

    return this.prisma.area.create({
      data: { systemId: system.id, name: dto.name },
    });
  }

  async update(clerkUserId: string, areaId: string, dto: UpdateAreaDto) {
    const area = await this.findOwnedArea(clerkUserId, areaId);

    return this.prisma.area.update({
      where: { id: area.id },
      data: dto,
    });
  }

  async softDelete(clerkUserId: string, areaId: string) {
    const area = await this.findOwnedArea(clerkUserId, areaId);

    const activeCount = await this.prisma.area.count({
      where: { systemId: area.systemId, deletedAt: null },
    });

    if (activeCount <= 1) {
      throw new BadRequestException(
        'Cannot delete the last active area in a system',
      );
    }

    return this.prisma.area.update({
      where: { id: area.id },
      data: { deletedAt: new Date() },
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
}
