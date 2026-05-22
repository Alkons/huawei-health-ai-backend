import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { CacheModule } from './cache/cache.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { CommonModule } from './common/common.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { HealthModule } from './health/health.module';
import { HuaweiModule } from './integrations/huawei/huawei.module';
import { HealthDataModule } from './health-data/health-data.module';
import { CoachingModule } from './coaching/coaching.module';
import configuration from './config/configuration';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    DatabaseModule,
    CacheModule,
    AnalyticsModule,
    CommonModule,
    AuthModule,
    UsersModule,
    HealthModule,
    HuaweiModule,
    HealthDataModule,
    CoachingModule,
  ],
})
export class AppModule {}
