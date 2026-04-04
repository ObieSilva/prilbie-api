import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import type { UpsertReflectionDto } from './dto/upsert-reflection.dto';

@Injectable()
export class ReflectionsService {
  constructor(private readonly prisma: PrismaService) {}

  async getByDate(clerkUserId: string, date: string) {
    const { id: userId } = await this.resolveUser(clerkUserId);

    const reflection = await this.prisma.dailyReflection.findUnique({
      where: { userId_date: { userId, date } },
    });

    if (!reflection) {
      throw new NotFoundException('No reflection found for this date');
    }

    return reflection;
  }

  async upsert(clerkUserId: string, date: string, dto: UpsertReflectionDto) {
    const { id: userId } = await this.resolveUser(clerkUserId);

    return this.prisma.dailyReflection.upsert({
      where: { userId_date: { userId, date } },
      create: { userId, date, text: dto.text },
      update: { text: dto.text },
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
}
