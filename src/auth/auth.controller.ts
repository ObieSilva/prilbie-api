import {
  Controller,
  ForbiddenException,
  Logger,
  Post,
  Req,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags } from '@nestjs/swagger';
import * as express from 'express';
import { Webhook } from 'svix';
import { Public } from '../common/guards/clerk-auth.guard';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('auth')
@Controller('webhooks/clerk')
@Public()
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  @Post()
  async handleClerkWebhook(@Req() req: RawBodyRequest<express.Request>) {
    const payload = req.rawBody;
    if (!payload) {
      throw new ForbiddenException('Missing raw body');
    }

    const secret = this.config.get<string>('CLERK_WEBHOOK_SECRET');
    if (!secret) {
      this.logger.error('CLERK_WEBHOOK_SECRET is not configured');
      throw new ForbiddenException('Webhook verification failed');
    }

    const headers = {
      'svix-id': req.headers['svix-id'] as string,
      'svix-timestamp': req.headers['svix-timestamp'] as string,
      'svix-signature': req.headers['svix-signature'] as string,
    };

    type ClerkEvent = {
      type: string;
      data: { id: string; first_name?: string | null };
    };

    let event: ClerkEvent;
    try {
      event = new Webhook(secret).verify(payload, headers) as ClerkEvent;
    } catch {
      this.logger.debug('Svix signature verification failed');
      throw new ForbiddenException('Webhook verification failed');
    }

    const clerkUserId = event.data.id;

    switch (event.type) {
      case 'user.created':
        await this.prisma.userProfile.create({
          data: {
            clerkUserId,
            userName: event.data.first_name || 'Friend',
          },
        });
        this.logger.log(`Provisioned UserProfile for ${clerkUserId}`);
        break;

      case 'user.updated':
        await this.prisma.userProfile.updateMany({
          where: { clerkUserId },
          data: { userName: event.data.first_name ?? undefined },
        });
        break;

      case 'user.deleted':
        await this.prisma.userProfile.deleteMany({
          where: { clerkUserId },
        });
        this.logger.log(`Deleted UserProfile for ${clerkUserId}`);
        break;

      default:
        this.logger.debug(`Ignoring unhandled Clerk event: ${event.type}`);
    }

    return { received: true };
  }
}
