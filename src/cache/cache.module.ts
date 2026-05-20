import { Module, Global } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LocalCacheService } from './local-cache.service';
import { DistributedCacheService } from './distributed-cache.service';
import { ICache } from './icache.interface';
import { AppConfig } from '../config/configuration';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: 'CACHE_SERVICE',
      useFactory: (configService: ConfigService): ICache<any> => {
        const appConfig = configService.get<AppConfig>('app')!;
        const { useDistributed } = appConfig.cache;

        if (useDistributed) {
          return new DistributedCacheService(configService);
        } else {
          return new LocalCacheService();
        }
      },
      inject: [ConfigService],
    },
  ],
  exports: ['CACHE_SERVICE'],
})
export class CacheModule {}
