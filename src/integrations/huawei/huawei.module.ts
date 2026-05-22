import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../../auth/auth.module';
import { HuaweiController } from './huawei.controller';
import { HuaweiService } from './huawei.service';
import {
  HuaweiConnection,
  HuaweiConnectionSchema,
} from './schemas/huawei-connection.schema';
import {
  HuaweiConsentLedgerEvent,
  HuaweiConsentLedgerEventSchema,
} from './schemas/huawei-consent-ledger-event.schema';
import {
  HuaweiOAuthState,
  HuaweiOAuthStateSchema,
} from './schemas/huawei-oauth-state.schema';
import {
  HuaweiProviderToken,
  HuaweiProviderTokenSchema,
} from './schemas/huawei-provider-token.schema';
import { HuaweiTokenCryptoService } from './huawei-token-crypto.service';
import { HuaweiClientService } from './huawei-client.service';
import { HuaweiSyncScheduler } from './huawei-sync.scheduler';
import {
  HuaweiDailyActivity,
  HuaweiDailyActivitySchema,
} from './schemas/huawei-daily-activity.schema';
import {
  HuaweiWorkoutSession,
  HuaweiWorkoutSessionSchema,
} from './schemas/huawei-workout-session.schema';
import {
  HuaweiSleepSession,
  HuaweiSleepSessionSchema,
} from './schemas/huawei-sleep-session.schema';
import {
  HuaweiHeartSignal,
  HuaweiHeartSignalSchema,
} from './schemas/huawei-heart-signal.schema';
import {
  HuaweiSpO2Record,
  HuaweiSpO2RecordSchema,
} from './schemas/huawei-spo2-record.schema';
import {
  HuaweiSyncProgress,
  HuaweiSyncProgressSchema,
} from './schemas/huawei-sync-progress.schema';
import { HuaweiEligibilityService } from './huawei-eligibility.service';
import {
  HuaweiAdvancedRecord,
  HuaweiAdvancedRecordSchema,
} from './schemas/huawei-advanced-record.schema';

@Module({
  imports: [
    ConfigModule,
    AuthModule,
    MongooseModule.forFeature([
      { name: HuaweiConnection.name, schema: HuaweiConnectionSchema },
      {
        name: HuaweiConsentLedgerEvent.name,
        schema: HuaweiConsentLedgerEventSchema,
      },
      { name: HuaweiOAuthState.name, schema: HuaweiOAuthStateSchema },
      { name: HuaweiProviderToken.name, schema: HuaweiProviderTokenSchema },
      { name: HuaweiDailyActivity.name, schema: HuaweiDailyActivitySchema },
      { name: HuaweiWorkoutSession.name, schema: HuaweiWorkoutSessionSchema },
      { name: HuaweiSleepSession.name, schema: HuaweiSleepSessionSchema },
      { name: HuaweiHeartSignal.name, schema: HuaweiHeartSignalSchema },
      { name: HuaweiSpO2Record.name, schema: HuaweiSpO2RecordSchema },
      { name: HuaweiSyncProgress.name, schema: HuaweiSyncProgressSchema },
      { name: HuaweiAdvancedRecord.name, schema: HuaweiAdvancedRecordSchema },
    ]),
  ],
  controllers: [HuaweiController],
  providers: [
    HuaweiService,
    HuaweiTokenCryptoService,
    HuaweiClientService,
    HuaweiSyncScheduler,
    HuaweiEligibilityService,
  ],
  exports: [HuaweiService, HuaweiEligibilityService, MongooseModule],
})
export class HuaweiModule {}
