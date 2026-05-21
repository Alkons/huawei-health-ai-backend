import { Module } from '@nestjs/common';
import { HuaweiModule } from '../integrations/huawei/huawei.module';
import { AuthModule } from '../auth/auth.module';
import { HealthDataController } from './health-data.controller';
import { HealthDataService } from './health-data.service';

@Module({
  imports: [HuaweiModule, AuthModule],
  controllers: [HealthDataController],
  providers: [HealthDataService],
  exports: [HealthDataService],
})
export class HealthDataModule {}
