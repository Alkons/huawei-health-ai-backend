import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import type { Model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { AppConfig } from '../../config/configuration';
import type { HuaweiAuthorizeDto } from './dto/huawei-authorize.dto.js';
import type { HuaweiConsentCategory } from './schemas/huawei-consent-category.js';
import type { HuaweiConnectionDocument } from './schemas/huawei-connection.schema.js';
import { HuaweiConnection } from './schemas/huawei-connection.schema.js';
import type { HuaweiConsentLedgerEventDocument } from './schemas/huawei-consent-ledger-event.schema.js';
import { HuaweiConsentLedgerEvent } from './schemas/huawei-consent-ledger-event.schema.js';
import type { HuaweiOAuthStateDocument } from './schemas/huawei-oauth-state.schema.js';
import { HuaweiOAuthState } from './schemas/huawei-oauth-state.schema.js';
import type { HuaweiProviderTokenDocument } from './schemas/huawei-provider-token.schema.js';
import { HuaweiProviderToken } from './schemas/huawei-provider-token.schema.js';
import { HuaweiTokenCryptoService } from './huawei-token-crypto.service.js';

@Injectable()
export class HuaweiService {
  private readonly logger = new Logger(HuaweiService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly tokenCryptoService: HuaweiTokenCryptoService,
    @InjectModel(HuaweiOAuthState.name)
    private readonly oauthStateModel: Model<HuaweiOAuthStateDocument>,
    @InjectModel(HuaweiProviderToken.name)
    private readonly tokenModel: Model<HuaweiProviderTokenDocument>,
    @InjectModel(HuaweiConnection.name)
    private readonly connectionModel: Model<HuaweiConnectionDocument>,
    @InjectModel(HuaweiConsentLedgerEvent.name)
    private readonly ledgerModel: Model<HuaweiConsentLedgerEventDocument>,
  ) {}

  getConnectConfig(userId: string) {
    this.assertUserId(userId);
    const appConfig = this.getAppConfig();
    return {
      provider: 'huawei',
      categories: this.getConsentCategories(),
      links: {
        privacyPolicyUrl: appConfig.huawei.privacyPolicyUrl,
        nonMedicalDisclaimerUrl: appConfig.huawei.nonMedicalDisclaimerUrl,
        manageConsentUrl: appConfig.huawei.manageConsentUrl,
      },
    };
  }

  async createAuthorization(userId: string, dto: HuaweiAuthorizeDto) {
    this.assertUserId(userId);
    this.assertClientRedirectUrlAllowed(dto.clientRedirectUrl);
    const correlationId = uuidv4();
    const state = uuidv4();
    const requestedScopes = this.mapCategoriesToScopes(dto.requestedCategories);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await this.oauthStateModel.create({
      userId: new Types.ObjectId(userId),
      state,
      requestedCategories: dto.requestedCategories,
      requestedScopes,
      clientRedirectUrl: dto.clientRedirectUrl,
      consentShownAt: new Date(dto.consentShownAt),
      consentUiVersion: dto.consentUiVersion,
      privacyPolicyVersion: dto.privacyPolicyVersion,
      nonMedicalDisclaimerVersion: dto.nonMedicalDisclaimerVersion,
      correlationId,
      expiresAt,
    });

    await this.ledgerModel.create({
      userId: new Types.ObjectId(userId),
      provider: 'huawei',
      eventType: 'consent_shown',
      occurredAt: new Date(),
      requestedCategories: dto.requestedCategories,
      requestedScopes,
      consentUiVersion: dto.consentUiVersion,
      privacyPolicyVersion: dto.privacyPolicyVersion,
      nonMedicalDisclaimerVersion: dto.nonMedicalDisclaimerVersion,
      correlationId,
    });

    const appConfig = this.getAppConfig();
    const authorizationUrl = this.buildAuthorizationUrl({
      state,
      scopes: requestedScopes,
      redirectUri: appConfig.huawei.redirectUri,
    });

    this.logger.log(
      `Huawei authorize initiated for user ${userId} (correlationId=${correlationId})`,
    );

    return { authorizationUrl, stateId: correlationId };
  }

  async handleCallback(input: {
    code: string | undefined;
    state: string | undefined;
    error: string | undefined;
  }): Promise<string> {
    const { code, state, error } = input;
    const appConfig = this.getAppConfig();
    const fallbackRedirectUrl =
      appConfig.huawei.manageConsentUrl ||
      appConfig.huawei.allowedClientRedirectOrigins[0] ||
      'http://localhost:3000';
    try {
      if (!state) {
        return this.buildClientRedirectWithResult({
          clientRedirectUrl: fallbackRedirectUrl,
          correlationId: uuidv4(),
          reasonClass: 'invalidState',
          status: 'errored',
        });
      }
      const oauthState = await this.oauthStateModel.findOne({ state }).lean();
      if (!oauthState) {
        return this.buildClientRedirectWithResult({
          clientRedirectUrl: fallbackRedirectUrl,
          correlationId: uuidv4(),
          reasonClass: 'invalidState',
          status: 'errored',
        });
      }
      if (oauthState.expiresAt.getTime() < Date.now()) {
        await this.oauthStateModel.deleteOne({ _id: oauthState._id });
        return this.buildClientRedirectWithResult({
          clientRedirectUrl: oauthState.clientRedirectUrl,
          correlationId: oauthState.correlationId,
          reasonClass: 'oauthCodeExpired',
          status: 'errored',
        });
      }
      if (error) {
        await this.writeConsentDeniedLedger(oauthState);
        await this.oauthStateModel.deleteOne({ _id: oauthState._id });
        return this.buildClientRedirectWithResult({
          clientRedirectUrl: oauthState.clientRedirectUrl,
          correlationId: oauthState.correlationId,
          reasonClass: 'consentDenied',
          status: 'errored',
        });
      }
      if (!code) {
        await this.oauthStateModel.deleteOne({ _id: oauthState._id });
        return this.buildClientRedirectWithResult({
          clientRedirectUrl: oauthState.clientRedirectUrl,
          correlationId: oauthState.correlationId,
          reasonClass: 'missingCode',
          status: 'errored',
        });
      }
      const tokenResult = await this.exchangeAuthorizationCode(code);
      const encryptedRefreshToken = this.tokenCryptoService.encryptRefreshToken(
        tokenResult.refreshToken,
      );
      const tokenDoc = await this.tokenModel.findOneAndUpdate(
        { userId: oauthState.userId, provider: 'huawei' },
        {
          $set: {
            userId: oauthState.userId,
            provider: 'huawei',
            accessToken: tokenResult.accessToken,
            accessTokenExpiresAt: tokenResult.accessTokenExpiresAt,
            refreshTokenEncrypted: encryptedRefreshToken,
            scope: tokenResult.scope,
          },
        },
        { upsert: true, new: true },
      );
      await this.connectionModel.findOneAndUpdate(
        { userId: oauthState.userId },
        {
          $set: {
            userId: oauthState.userId,
            providerUserId: tokenResult.providerUserId,
            status: 'connected',
            connectedAt: new Date(),
            grantedScopes: tokenResult.scope
              .split(' ')
              .filter((s) => s.length > 0),
            grantedCategories: oauthState.requestedCategories,
            tokenRefId: tokenDoc._id,
          },
        },
        { upsert: true, new: true },
      );
      await this.ledgerModel.create({
        userId: oauthState.userId,
        provider: 'huawei',
        eventType: 'consent_accepted',
        occurredAt: new Date(),
        requestedCategories: oauthState.requestedCategories,
        requestedScopes: oauthState.requestedScopes,
        grantedCategories: oauthState.requestedCategories,
        grantedScopes: tokenResult.scope.split(' ').filter((s) => s.length > 0),
        consentUiVersion: oauthState.consentUiVersion,
        privacyPolicyVersion: oauthState.privacyPolicyVersion,
        nonMedicalDisclaimerVersion: oauthState.nonMedicalDisclaimerVersion,
        correlationId: oauthState.correlationId,
      });
      await this.oauthStateModel.deleteOne({ _id: oauthState._id });
      this.logger.log(
        `Huawei connection established (correlationId=${oauthState.correlationId})`,
      );
      return this.buildClientRedirectWithResult({
        clientRedirectUrl: oauthState.clientRedirectUrl,
        correlationId: oauthState.correlationId,
        reasonClass: 'ok',
        status: 'connected',
      });
    } catch (err) {
      this.logger.error(
        `Huawei callback failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return this.buildClientRedirectWithResult({
        clientRedirectUrl: fallbackRedirectUrl,
        correlationId: uuidv4(),
        reasonClass: 'unknown',
        status: 'errored',
      });
    }
  }

  async getStatus(userId: string) {
    this.assertUserId(userId);
    const connection = await this.connectionModel
      .findOne({ userId: new Types.ObjectId(userId) })
      .lean();
    if (!connection) {
      return { status: 'notConnected' };
    }
    return {
      status: connection.status,
      connectedAt: connection.connectedAt?.toISOString(),
      grantedCategories: connection.grantedCategories,
      firstDataExpectedAt: connection.connectedAt
        ? new Date(
            connection.connectedAt.getTime() + 60 * 60 * 1000,
          ).toISOString()
        : undefined,
    };
  }

  async disconnect(userId: string) {
    this.assertUserId(userId);
    await this.connectionModel.updateOne(
      { userId: new Types.ObjectId(userId) },
      {
        $set: {
          status: 'disconnected',
        },
      },
    );
    await this.ledgerModel.create({
      userId: new Types.ObjectId(userId),
      provider: 'huawei',
      eventType: 'disconnect',
      occurredAt: new Date(),
      requestedCategories: [],
      requestedScopes: [],
      consentUiVersion: 'unknown',
      privacyPolicyVersion: 'unknown',
      nonMedicalDisclaimerVersion: 'unknown',
      correlationId: uuidv4(),
    });
    return { disconnected: true };
  }

  private assertUserId(userId: string): void {
    if (!userId) {
      throw new BadRequestException('Missing user id');
    }
  }

  private getConsentCategories(): Array<{
    category: HuaweiConsentCategory;
    displayName: string;
    whyText: string;
    isRecommended: boolean;
    isOptional: boolean;
    availabilityNotes: string[];
  }> {
    return [
      {
        category: 'activity',
        displayName: 'Activity',
        whyText: 'Power your daily trends and consistency coaching.',
        isRecommended: true,
        isOptional: true,
        availabilityNotes: ['May be delayed due to Huawei Health sync.'],
      },
      {
        category: 'workouts',
        displayName: 'Workouts',
        whyText: 'Enable training feedback on workouts and load.',
        isRecommended: true,
        isOptional: true,
        availabilityNotes: ['Some workout types may be unavailable.'],
      },
      {
        category: 'sleep',
        displayName: 'Sleep',
        whyText: 'Enable recovery and sleep trend coaching.',
        isRecommended: true,
        isOptional: true,
        availabilityNotes: [
          'May require watch linkage; availability varies by device.',
        ],
      },
      {
        category: 'heartSignals',
        displayName: 'Heart signals',
        whyText: 'Tune intensity and recovery insights (non-medical).',
        isRecommended: false,
        isOptional: true,
        availabilityNotes: ['Availability varies by device and settings.'],
      },
      {
        category: 'spo2',
        displayName: 'SpO2',
        whyText: 'Provide recovery context (non-medical).',
        isRecommended: false,
        isOptional: true,
        availabilityNotes: [
          'Availability varies by device and automatic measurement settings.',
        ],
      },
      {
        category: 'selectedRecords',
        displayName: 'Selected records',
        whyText: 'Surface selected structured records where available.',
        isRecommended: false,
        isOptional: true,
        availabilityNotes: [
          'May be unavailable in your region or developer tier.',
        ],
      },
    ];
  }

  private mapCategoriesToScopes(categories: HuaweiConsentCategory[]): string[] {
    const scopeSet = new Set<string>();
    for (const category of categories) {
      const scopes = this.mapCategoryToScopes(category);
      for (const scope of scopes) {
        scopeSet.add(scope);
      }
    }
    return Array.from(scopeSet);
  }

  private mapCategoryToScopes(category: HuaweiConsentCategory): string[] {
    switch (category) {
      case 'activity':
        return ['HEALTHKIT_STEP_READ'];
      case 'workouts':
        return ['HEALTHKIT_ACTIVITY_RECORD_READ'];
      case 'sleep':
        return ['HEALTHKIT_SLEEP_READ'];
      case 'heartSignals':
        return ['HEALTHKIT_HEARTRATE_READ'];
      case 'spo2':
        return ['HEALTHKIT_PULMONARY_READ'];
      case 'selectedRecords':
        return [];
      default:
        return [];
    }
  }

  private buildAuthorizationUrl(input: {
    state: string;
    scopes: string[];
    redirectUri: string;
  }): string {
    const appConfig = this.getAppConfig();
    const params = new URLSearchParams({
      response_type: 'code',
      access_type: 'offline',
      client_id: appConfig.huawei.clientId,
      redirect_uri: input.redirectUri,
      scope: input.scopes.join(' '),
      state: input.state,
    });
    return `${appConfig.huawei.oauthAuthorizeUrl}?${params.toString()}`;
  }

  private buildClientRedirectWithResult(input: {
    clientRedirectUrl: string;
    correlationId: string;
    reasonClass: string;
    status: 'connected' | 'errored';
  }): string {
    const url = new URL(input.clientRedirectUrl);
    url.searchParams.set('provider', 'huawei');
    url.searchParams.set('correlationId', input.correlationId);
    url.searchParams.set('reasonClass', input.reasonClass);
    url.searchParams.set('status', input.status);
    return url.toString();
  }

  private getAppConfig(): AppConfig {
    const appConfig = this.configService.get<AppConfig>('app');
    if (!appConfig) {
      throw new BadRequestException('Missing app configuration');
    }
    return appConfig;
  }

  private assertClientRedirectUrlAllowed(clientRedirectUrl: string): void {
    const appConfig = this.getAppConfig();
    const url = new URL(clientRedirectUrl);
    const allowed = appConfig.huawei.allowedClientRedirectOrigins;
    if (allowed.length === 0) {
      throw new BadRequestException('No allowed redirect origins configured');
    }
    if (!allowed.includes(url.origin)) {
      throw new BadRequestException('Client redirect origin is not allowed');
    }
  }

  private async writeConsentDeniedLedger(
    oauthState: HuaweiOAuthState,
  ): Promise<void> {
    await this.ledgerModel.create({
      userId: oauthState.userId,
      provider: 'huawei',
      eventType: 'consent_denied',
      occurredAt: new Date(),
      requestedCategories: oauthState.requestedCategories,
      requestedScopes: oauthState.requestedScopes,
      consentUiVersion: oauthState.consentUiVersion,
      privacyPolicyVersion: oauthState.privacyPolicyVersion,
      nonMedicalDisclaimerVersion: oauthState.nonMedicalDisclaimerVersion,
      correlationId: oauthState.correlationId,
    });
  }

  private async exchangeAuthorizationCode(code: string): Promise<{
    accessToken: string;
    refreshToken: string;
    scope: string;
    accessTokenExpiresAt: Date;
    providerUserId: string;
  }> {
    const appConfig = this.getAppConfig();
    if (!appConfig.huawei.clientId || !appConfig.huawei.clientSecret) {
      throw new BadRequestException('Huawei OAuth client is not configured');
    }
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: appConfig.huawei.clientId,
      client_secret: appConfig.huawei.clientSecret,
      redirect_uri: appConfig.huawei.redirectUri,
    });
    const response = await fetch(appConfig.huawei.oauthTokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    if (!response.ok) {
      throw new BadRequestException('Huawei token exchange failed');
    }
    const json = (await response.json()) as {
      access_token: string;
      refresh_token: string;
      scope: string;
      expires_in: number;
      id_token?: string;
    };
    const accessTokenExpiresAt = new Date(Date.now() + json.expires_in * 1000);
    const providerUserId = json.id_token
      ? this.extractSubject(json.id_token)
      : '';
    return {
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      scope: json.scope,
      accessTokenExpiresAt,
      providerUserId,
    };
  }

  private extractSubject(idToken: string): string {
    const [, payloadPart] = idToken.split('.');
    if (!payloadPart) {
      return '';
    }
    const payloadJson = Buffer.from(payloadPart, 'base64url').toString('utf8');
    const payload = JSON.parse(payloadJson) as { sub?: string };
    return payload.sub || '';
  }
}
