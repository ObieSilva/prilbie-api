import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { validateEnv } from './config/env.schema';
import { rootEnvFilePath } from './config/root-env-path';
import { pinoGenReqId } from './common/constants/http-headers';
import { ClerkAuthGuard } from './common/guards/clerk-auth.guard';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { CorrelationIdMiddleware } from './common/middleware/correlation-id.middleware';
import { AuthModule } from './auth/auth.module';
import { CacheModule } from './cache/cache.module';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { ActionBundlesModule } from './action-bundles/action-bundles.module';
import { AreasModule } from './areas/areas.module';
import { SystemsModule } from './systems/systems.module';
import { CheckinsModule } from './checkins/checkins.module';
import { EnergyModule } from './energy/energy.module';
import { UsersModule } from './users/users.module';

/** Argument to nestjs-pino `serializers.req` (pino-http request wrapper). */
type PinoSerializedReq = {
  method?: string;
  url?: string;
  raw?: { auth?: { userId?: string } };
};

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: rootEnvFilePath,
      validate: validateEnv,
    }),
    LoggerModule.forRoot({
      forRoutes: ['{*path}'],
      pinoHttp: {
        level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
        transport:
          process.env.NODE_ENV !== 'production'
            ? { target: 'pino-pretty' }
            : undefined,
        genReqId: pinoGenReqId,
        serializers: {
          req: (req: PinoSerializedReq) => ({
            method: req.method,
            url: req.url,
            userId: req.raw?.auth?.userId,
          }),
        },
      },
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    PrismaModule,
    CacheModule,
    AuthModule,
    HealthModule,
    ActionBundlesModule,
    AreasModule,
    CheckinsModule,
    EnergyModule,
    SystemsModule,
    UsersModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: ClerkAuthGuard },
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationIdMiddleware).forRoutes('{*path}');
  }
}
