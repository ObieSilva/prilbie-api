import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    const useNeon = process.env.USE_NEON === 'true';

    if (useNeon) {
      // BACKEND_SPEC §2.4 — require() avoids bundling ws/neon in local dev
      /* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
      const { Pool, neonConfig } = require('@neondatabase/serverless');
      const { PrismaNeon } = require('@prisma/adapter-neon');
      const ws = require('ws');
      neonConfig.webSocketConstructor = ws;

      const pool = new Pool({ connectionString: process.env.DATABASE_URL });
      const adapter = new PrismaNeon(pool);
      super({ adapter });
      /* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
    } else {
      super();
    }
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
