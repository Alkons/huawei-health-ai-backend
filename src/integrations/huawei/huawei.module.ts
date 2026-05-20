import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { HuaweiController } from './huawei.controller';
import { HuaweiService } from './huawei.service';
import { HuaweiConnection, HuaweiConnectionSchema } from './schemas/huawei-connection.schema.js';
import { HuaweiConsentLedgerEvent, HuaweiConsentLedgerEventSchema } from './schemas/huawei-consent-ledger-event.schema.js';
import { HuaweiOAuthState, HuaweiOAuthStateSchema } from './schemas/huawei-oauth-state.schema.js';
import { HuaweiProviderToken, HuaweiProviderTokenSchema } from './schemas/huawei-provider-token.schema.js';
import { HuaweiTokenCryptoService } from './huawei-token-crypto.service.js';

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([
      { name: HuaweiConnection.name, schema: HuaweiConnectionSchema },
      { name: HuaweiConsentLedgerEvent.name, schema: HuaweiConsentLedgerEventSchema },
      { name: HuaweiOAuthState.name, schema: HuaweiOAuthStateSchema },
      { name: HuaweiProviderToken.name, schema: HuaweiProviderTokenSchema },
    ]),
  ],
  controllers: [HuaweiController],
  providers: [HuaweiService, HuaweiTokenCryptoService, JwtAuthGuard],
})
export class HuaweiModule {}
