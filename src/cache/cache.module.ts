import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CACHE_SERVICE } from './cache.interface';
import { MemoryCacheService } from './memory-cache.service';
import { RedisCacheService } from './redis-cache.service';

@Global()
@Module({
  providers: [
    {
      provide: CACHE_SERVICE,
      useFactory: (config: ConfigService) => {
        const url = config.get<string>('UPSTASH_REDIS_URL');
        const token = config.get<string>('UPSTASH_REDIS_TOKEN');
        if (url && token) {
          return new RedisCacheService(url, token);
        }
        return new MemoryCacheService();
      },
      inject: [ConfigService],
    },
  ],
  exports: [CACHE_SERVICE],
})
export class CacheModule {}
