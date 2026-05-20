import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../../auth/auth.module';
import { HuaweiController } from './huawei.controller';
import { HuaweiService } from './huawei.service';
import {
  HuaweiConnection,
  HuaweiConnectionSchema,
} from './schemas/huawei-connection.schema.js';
import {
  HuaweiConsentLedgerEvent,
  HuaweiConsentLedgerEventSchema,
} from './schemas/huawei-consent-ledger-event.schema.js';
import {
  HuaweiOAuthState,
  HuaweiOAuthStateSchema,
} from './schemas/huawei-oauth-state.schema.js';
import {
  HuaweiProviderToken,
  HuaweiProviderTokenSchema,
} from './schemas/huawei-provider-token.schema.js';
import { HuaweiTokenCryptoService } from './huawei-token-crypto.service.js';

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
    ]),
  ],
  controllers: [HuaweiController],
  providers: [HuaweiService, HuaweiTokenCryptoService],
})
export class HuaweiModule {}
