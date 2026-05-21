import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import type { Model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { AppConfig } from '../../config/configuration';
import type { HuaweiAuthorizeDto } from './dto/huawei-authorize.dto';
import type { HuaweiDisconnectDto } from './dto/huawei-disconnect.dto';
import type { HuaweiUpdateConsentDto } from './dto/huawei-update-consent.dto';
import type { HuaweiConsentCategory } from './schemas/huawei-consent-category';
import type { HuaweiConnectionDocument } from './schemas/huawei-connection.schema';
import { HuaweiConnection } from './schemas/huawei-connection.schema';
import type { HuaweiConsentLedgerEventDocument } from './schemas/huawei-consent-ledger-event.schema';
import { HuaweiConsentLedgerEvent } from './schemas/huawei-consent-ledger-event.schema';
import type { HuaweiOAuthStateDocument } from './schemas/huawei-oauth-state.schema';
import { HuaweiOAuthState } from './schemas/huawei-oauth-state.schema';
import type { HuaweiProviderTokenDocument } from './schemas/huawei-provider-token.schema';
import { HuaweiProviderToken } from './schemas/huawei-provider-token.schema';
import { HuaweiTokenCryptoService } from './huawei-token-crypto.service';
import { HuaweiClientService } from './huawei-client.service';
import {
  HuaweiDailyActivity,
  HuaweiDailyActivityDocument,
} from './schemas/huawei-daily-activity.schema';
import {
  HuaweiWorkoutSession,
  HuaweiWorkoutSessionDocument,
} from './schemas/huawei-workout-session.schema';
import {
  HuaweiSleepSession,
  HuaweiSleepSessionDocument,
} from './schemas/huawei-sleep-session.schema';
import {
  HuaweiHeartSignal,
  HuaweiHeartSignalDocument,
} from './schemas/huawei-heart-signal.schema';
import {
  HuaweiSpO2Record,
  HuaweiSpO2RecordDocument,
} from './schemas/huawei-spo2-record.schema';
import {
  HuaweiSyncProgress,
  HuaweiSyncProgressDocument,
  HuaweiSyncReasonClass,
} from './schemas/huawei-sync-progress.schema';

@Injectable()
export class HuaweiService {
  private readonly logger = new Logger(HuaweiService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly tokenCryptoService: HuaweiTokenCryptoService,
    private readonly clientService: HuaweiClientService,
    @InjectModel(HuaweiOAuthState.name)
    private readonly oauthStateModel: Model<HuaweiOAuthStateDocument>,
    @InjectModel(HuaweiProviderToken.name)
    private readonly tokenModel: Model<HuaweiProviderTokenDocument>,
    @InjectModel(HuaweiConnection.name)
    private readonly connectionModel: Model<HuaweiConnectionDocument>,
    @InjectModel(HuaweiConsentLedgerEvent.name)
    private readonly ledgerModel: Model<HuaweiConsentLedgerEventDocument>,
    @InjectModel(HuaweiDailyActivity.name)
    private readonly dailyActivityModel: Model<HuaweiDailyActivityDocument>,
    @InjectModel(HuaweiWorkoutSession.name)
    private readonly workoutSessionModel: Model<HuaweiWorkoutSessionDocument>,
    @InjectModel(HuaweiSleepSession.name)
    private readonly sleepSessionModel: Model<HuaweiSleepSessionDocument>,
    @InjectModel(HuaweiHeartSignal.name)
    private readonly heartSignalModel: Model<HuaweiHeartSignalDocument>,
    @InjectModel(HuaweiSpO2Record.name)
    private readonly spo2RecordModel: Model<HuaweiSpO2RecordDocument>,
    @InjectModel(HuaweiSyncProgress.name)
    private readonly syncProgressModel: Model<HuaweiSyncProgressDocument>,
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
            enabledCategories: oauthState.requestedCategories,
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

  async getConsentSettings(userId: string) {
    this.assertUserId(userId);
    const connection = await this.connectionModel
      .findOne({ userId: new Types.ObjectId(userId) })
      .lean();
    const appConfig = this.getAppConfig();
    const categoriesConfig = this.getConsentCategories();
    if (!connection) {
      return {
        provider: 'huawei',
        connection: { status: 'notConnected' },
        permissions: {
          categories: categoriesConfig.map((c) => ({
            ...c,
            isGrantedByHuawei: false,
            isEnabledInApp: false,
          })),
          grantedCategories: [],
          enabledCategories: [],
        },
        effects: {
          categoryEffects: this.getCategoryEffects(),
          limitedDataMessage:
            'Huawei is not connected. Connect to enable syncing and insights.',
        },
        retention: this.getRetentionPolicy(appConfig),
      };
    }
    const grantedCategories = connection.grantedCategories ?? [];
    const enabledCategories =
      connection.enabledCategories && connection.enabledCategories.length > 0
        ? connection.enabledCategories
        : grantedCategories;
    return {
      provider: 'huawei',
      connection: {
        status: connection.status,
        connectedAt: connection.connectedAt?.toISOString(),
        lastSyncAt: connection.lastSyncAt?.toISOString(),
        dataFreshness: {
          status: connection.dataFreshnessStatus ?? 'unknown',
          message:
            connection.dataFreshnessMessage ??
            'Freshness is unknown until first sync.',
        },
      },
      permissions: {
        categories: categoriesConfig.map((c) => ({
          ...c,
          isGrantedByHuawei: grantedCategories.includes(c.category),
          isEnabledInApp: enabledCategories.includes(c.category),
        })),
        grantedCategories,
        enabledCategories,
      },
      effects: {
        categoryEffects: this.getCategoryEffects(),
        limitedDataMessage: this.getLimitedDataMessage({
          status: connection.status,
          grantedCategories,
          enabledCategories,
        }),
      },
      retention: this.getRetentionPolicy(appConfig),
    };
  }

  async updateConsent(userId: string, dto: HuaweiUpdateConsentDto) {
    this.assertUserId(userId);
    const connection = await this.connectionModel
      .findOne({ userId: new Types.ObjectId(userId) })
      .lean();
    if (connection?.status !== 'connected') {
      throw new ConflictException('Huawei is not connected');
    }
    const grantedCategories = connection.grantedCategories ?? [];
    const previousEnabledCategories =
      connection.enabledCategories?.length &&
      connection.enabledCategories.length > 0
        ? connection.enabledCategories
        : grantedCategories;
    const requestedEnabled = dto.enabledCategories ?? [];
    const missingFromGrant = requestedEnabled.filter(
      (c) => !grantedCategories.includes(c),
    );
    const correlationId = uuidv4();
    if (missingFromGrant.length > 0) {
      await this.ledgerModel.create({
        userId: new Types.ObjectId(userId),
        provider: 'huawei',
        eventType: 'permissions_expanded_requested',
        occurredAt: new Date(),
        requestedCategories: missingFromGrant,
        requestedScopes: this.mapCategoriesToScopes(missingFromGrant),
        previousEnabledCategories,
        newEnabledCategories: requestedEnabled,
        consentUiVersion: dto.consentUiVersion,
        privacyPolicyVersion: dto.privacyPolicyVersion,
        nonMedicalDisclaimerVersion: dto.nonMedicalDisclaimerVersion,
        correlationId,
      });
      const authorize = await this.createAuthorization(userId, {
        requestedCategories: Array.from(
          new Set([...grantedCategories, ...missingFromGrant]),
        ),
        clientRedirectUrl: this.getAppConfig().huawei.manageConsentUrl,
        consentShownAt: new Date().toISOString(),
        consentUiVersion: dto.consentUiVersion,
        privacyPolicyVersion: dto.privacyPolicyVersion,
        nonMedicalDisclaimerVersion: dto.nonMedicalDisclaimerVersion,
      });
      return {
        updated: false,
        requiresReauthorization: true,
        authorizationUrl: authorize.authorizationUrl,
        pendingEnabledCategories: requestedEnabled,
      };
    }
    await this.connectionModel.updateOne(
      { userId: new Types.ObjectId(userId) },
      { $set: { enabledCategories: requestedEnabled } },
    );
    const commonLedgerFields = {
      userId: new Types.ObjectId(userId),
      provider: 'huawei' as const,
      occurredAt: new Date(),
      requestedCategories: requestedEnabled,
      requestedScopes: this.mapCategoriesToScopes(requestedEnabled),
      previousEnabledCategories,
      newEnabledCategories: requestedEnabled,
      consentUiVersion: dto.consentUiVersion,
      privacyPolicyVersion: dto.privacyPolicyVersion,
      nonMedicalDisclaimerVersion: dto.nonMedicalDisclaimerVersion,
      correlationId,
    };
    await this.ledgerModel.create({
      ...commonLedgerFields,
      eventType: 'consent_updated',
    });
    if (requestedEnabled.length < previousEnabledCategories.length) {
      await this.ledgerModel.create({
        ...commonLedgerFields,
        eventType: 'permissions_reduced',
      });
    }
    return {
      updated: true,
      requiresReauthorization: false,
      enabledCategories: requestedEnabled,
    };
  }

  async getConsentHistory(
    userId: string,
    input: { limit: string | undefined },
  ) {
    this.assertUserId(userId);
    const limitRaw = input.limit ? Number.parseInt(input.limit, 10) : 50;
    const limit = Number.isFinite(limitRaw)
      ? Math.min(Math.max(limitRaw, 1), 200)
      : 50;
    const events = await this.ledgerModel
      .find({ userId: new Types.ObjectId(userId) })
      .sort({ occurredAt: -1 })
      .limit(limit)
      .lean();
    return {
      events: events.map((e) => ({
        occurredAt: e.occurredAt.toISOString(),
        eventType: e.eventType,
        previousEnabledCategories: e.previousEnabledCategories,
        newEnabledCategories: e.newEnabledCategories,
        deletionMode: e.deletionMode,
        correlationId: e.correlationId,
        reasonClass: e.reasonClass,
      })),
    };
  }

  async disconnect(userId: string, dto: HuaweiDisconnectDto) {
    this.assertUserId(userId);
    const deletionMode = dto.deletionMode ?? 'retain';
    const consentUiVersion = dto.consentUiVersion ?? 'unknown';
    const privacyPolicyVersion = dto.privacyPolicyVersion ?? 'unknown';
    const nonMedicalDisclaimerVersion =
      dto.nonMedicalDisclaimerVersion ?? 'unknown';
    const correlationId = uuidv4();
    await this.connectionModel.updateOne(
      { userId: new Types.ObjectId(userId) },
      {
        $set: {
          status: 'disconnected',
          enabledCategories: [],
          providerRevokedAt: new Date(),
          providerRevocationReason: 'unknown',
        },
      },
    );
    await this.tokenModel.deleteOne({
      userId: new Types.ObjectId(userId),
      provider: 'huawei',
    });
    await this.ledgerModel.create({
      userId: new Types.ObjectId(userId),
      provider: 'huawei',
      eventType: 'disconnect_requested',
      occurredAt: new Date(),
      requestedCategories: [],
      requestedScopes: [],
      deletionMode,
      consentUiVersion,
      privacyPolicyVersion,
      nonMedicalDisclaimerVersion,
      correlationId,
    });
    if (deletionMode === 'deleteImportedData') {
      await this.ledgerModel.create({
        userId: new Types.ObjectId(userId),
        provider: 'huawei',
        eventType: 'data_deletion_requested',
        occurredAt: new Date(),
        requestedCategories: [],
        requestedScopes: [],
        deletionMode,
        consentUiVersion,
        privacyPolicyVersion,
        nonMedicalDisclaimerVersion,
        correlationId,
      });
    }
    this.logger.log(
      `Huawei disconnected for user ${userId} (correlationId=${correlationId}, deletionMode=${deletionMode})`,
    );
    return { disconnected: true, deletionMode };
  }

  async getOrRefreshToken(userId: string): Promise<string> {
    const tokenDoc = await this.tokenModel.findOne({
      userId: new Types.ObjectId(userId),
      provider: 'huawei',
    });
    if (!tokenDoc) {
      throw new BadRequestException('User not connected or token missing');
    }

    const isExpired =
      tokenDoc.accessTokenExpiresAt.getTime() - Date.now() < 60 * 1000;
    if (!isExpired) {
      return tokenDoc.accessToken;
    }

    this.logger.log(`Refreshing Huawei OAuth token for user ${userId}`);
    const appConfig = this.getAppConfig();
    if (!appConfig.huawei.clientId || !appConfig.huawei.clientSecret) {
      throw new BadRequestException('Huawei OAuth client is not configured');
    }

    const decryptedRefreshToken = this.tokenCryptoService.decryptRefreshToken(
      tokenDoc.refreshTokenEncrypted,
    );

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: decryptedRefreshToken,
      client_id: appConfig.huawei.clientId,
      client_secret: appConfig.huawei.clientSecret,
    });

    const response = await fetch(appConfig.huawei.oauthTokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!response.ok) {
      throw new BadRequestException('Huawei token refresh failed');
    }

    const json = (await response.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    };

    const newEncryptedRefreshToken = json.refresh_token
      ? this.tokenCryptoService.encryptRefreshToken(json.refresh_token)
      : tokenDoc.refreshTokenEncrypted;
    const newExpiresAt = new Date(Date.now() + json.expires_in * 1000);

    await this.tokenModel.updateOne(
      { _id: tokenDoc._id },
      {
        $set: {
          accessToken: json.access_token,
          accessTokenExpiresAt: newExpiresAt,
          refreshTokenEncrypted: newEncryptedRefreshToken,
        },
      },
    );

    return json.access_token;
  }

  async syncCategory(
    userId: string,
    category: HuaweiConsentCategory,
  ): Promise<void> {
    const userIdObj = new Types.ObjectId(userId);
    const connection = await this.connectionModel.findOne({
      userId: userIdObj,
    });
    if (!connection || connection.status !== 'connected') {
      await this.syncProgressModel.findOneAndUpdate(
        { userId: userIdObj, category },
        {
          $set: {
            provider: 'huawei' as const,
            status: 'failed',
            reasonClass: 'permissionNotGranted',
            explanation: 'User is not connected to Huawei Health.',
          },
        },
        { upsert: true },
      );
      return;
    }

    const isGranted = connection.grantedCategories.includes(category);
    const isEnabled = connection.enabledCategories.includes(category);
    if (!isGranted || !isEnabled) {
      await this.syncProgressModel.findOneAndUpdate(
        { userId: userIdObj, category },
        {
          $set: {
            provider: 'huawei' as const,
            status: 'failed',
            reasonClass: 'permissionNotGranted',
            explanation: `Category ${category} is not enabled or granted.`,
          },
        },
        { upsert: true },
      );
      return;
    }

    await this.syncProgressModel.findOneAndUpdate(
      { userId: userIdObj, category },
      {
        $set: {
          provider: 'huawei' as const,
          status: 'syncing',
          lastAttemptedAt: new Date(),
        },
      },
      { upsert: true },
    );

    try {
      const token = await this.getOrRefreshToken(userId);
      const to = new Date();
      let isEmpty = false;

      switch (category) {
        case 'activity':
          isEmpty = await this.syncActivityCategory(userIdObj, token, to);
          break;
        case 'workouts':
          isEmpty = await this.syncWorkoutsCategory(userIdObj, token, to);
          break;
        case 'sleep':
          isEmpty = await this.syncSleepCategory(userIdObj, token, to);
          break;
        case 'heartSignals':
          isEmpty = await this.syncHeartSignalsCategory(userIdObj, token, to);
          break;
        case 'spo2':
          isEmpty = await this.syncSpO2Category(userIdObj, token, to);
          break;
        default:
          isEmpty = true;
          break;
      }

      await this.updateSyncSuccess(userIdObj, category, isEmpty);
    } catch (err: unknown) {
      this.logger.error(
        `Sync failed for user ${userId} and category ${category}`,
        err,
      );
      const errMsg = err instanceof Error ? err.message : String(err);
      const reasonClass = this.classifyError(err);
      await this.syncProgressModel.findOneAndUpdate(
        { userId: userIdObj, category },
        {
          $set: {
            provider: 'huawei' as const,
            status: 'failed',
            reasonClass,
            explanation: errMsg,
          },
        },
        { upsert: true },
      );
    }
  }

  private async syncActivityCategory(
    userIdObj: Types.ObjectId,
    token: string,
    to: Date,
  ): Promise<boolean> {
    const from = new Date(to);
    from.setDate(to.getDate() - 3);
    const raw = await this.clientService.getActivityDaily(token, from, to);
    const operations = raw.map((item) => ({
      updateOne: {
        filter: { userId: userIdObj, date: item.date },
        update: {
          $set: {
            provider: 'huawei' as const,
            steps: item.steps,
            calories: item.calories,
            distance: item.distance,
            intensityMinutes: item.intensityMinutes,
            hoursActive: item.hoursActive,
            lastSyncedAt: new Date(),
          },
          $push: { rawPayloads: { $each: [item], $slice: -10 } },
        },
        upsert: true,
      },
    }));
    if (operations.length > 0) {
      await this.dailyActivityModel.bulkWrite(operations);
    }
    return raw.length === 0;
  }

  private async syncWorkoutsCategory(
    userIdObj: Types.ObjectId,
    token: string,
    to: Date,
  ): Promise<boolean> {
    const from = new Date(to);
    from.setDate(to.getDate() - 7);
    const raw = await this.clientService.getWorkouts(token, from, to);
    const operations = raw.map((item) => ({
      updateOne: {
        filter: { userId: userIdObj, workoutId: item.workoutId },
        update: {
          $set: {
            provider: 'huawei' as const,
            activityType: item.activityType,
            startTime: item.startTime,
            endTime: item.endTime,
            duration: item.duration,
            calories: item.calories,
            distance: item.distance,
            avgHeartRate: item.avgHeartRate,
            maxHeartRate: item.maxHeartRate,
            rawPayload: item,
          },
        },
        upsert: true,
      },
    }));
    if (operations.length > 0) {
      await this.workoutSessionModel.bulkWrite(operations);
    }
    return raw.length === 0;
  }

  private async syncSleepCategory(
    userIdObj: Types.ObjectId,
    token: string,
    to: Date,
  ): Promise<boolean> {
    const from = new Date(to);
    from.setDate(to.getDate() - 7);
    const raw = await this.clientService.getSleep(token, from, to);
    const operations = raw.map((item) => ({
      updateOne: {
        filter: { userId: userIdObj, sleepId: item.sleepId },
        update: {
          $set: {
            provider: 'huawei' as const,
            startTime: item.startTime,
            endTime: item.endTime,
            duration: item.duration,
            deepSleepDuration: item.deepSleepDuration,
            lightSleepDuration: item.lightSleepDuration,
            remSleepDuration: item.remSleepDuration,
            awakeDuration: item.awakeDuration,
            rawPayload: item,
          },
        },
        upsert: true,
      },
    }));
    if (operations.length > 0) {
      await this.sleepSessionModel.bulkWrite(operations);
    }
    return raw.length === 0;
  }

  private async syncHeartSignalsCategory(
    userIdObj: Types.ObjectId,
    token: string,
    to: Date,
  ): Promise<boolean> {
    const from = new Date(to);
    from.setDate(to.getDate() - 1);
    const raw = await this.clientService.getHeartSignals(token, from, to);
    const operations = raw.map((item) => ({
      updateOne: {
        filter: { userId: userIdObj, timestamp: item.timestamp },
        update: {
          $set: {
            provider: 'huawei' as const,
            heartRate: item.heartRate,
            restingHeartRate: item.restingHeartRate,
            hrv: item.hrv,
          },
        },
        upsert: true,
      },
    }));
    if (operations.length > 0) {
      await this.heartSignalModel.bulkWrite(operations);
    }
    return raw.length === 0;
  }

  private async syncSpO2Category(
    userIdObj: Types.ObjectId,
    token: string,
    to: Date,
  ): Promise<boolean> {
    const from = new Date(to);
    from.setDate(to.getDate() - 1);
    const raw = await this.clientService.getSpO2(token, from, to);
    const operations = raw.map((item) => ({
      updateOne: {
        filter: { userId: userIdObj, timestamp: item.timestamp },
        update: {
          $set: {
            provider: 'huawei' as const,
            spo2: item.spo2,
            isLowSpO2: item.isLowSpO2,
          },
        },
        upsert: true,
      },
    }));
    if (operations.length > 0) {
      await this.spo2RecordModel.bulkWrite(operations);
    }
    return raw.length === 0;
  }

  async syncAllEnabledCategories(userId: string): Promise<void> {
    this.assertUserId(userId);
    const userIdObj = new Types.ObjectId(userId);
    const connection = await this.connectionModel.findOne({
      userId: userIdObj,
    });
    if (!connection || connection.status !== 'connected') {
      return;
    }

    const categories = connection.enabledCategories;
    const results = await Promise.allSettled(
      categories.map((cat) => this.syncCategory(userId, cat)),
    );

    let hasFailure = false;
    for (const res of results) {
      if (res.status === 'rejected') {
        hasFailure = true;
      }
    }

    await this.connectionModel.updateOne(
      { userId: userIdObj },
      {
        $set: {
          lastSyncAt: new Date(),
          dataFreshnessStatus: hasFailure ? 'stale' : 'fresh',
          dataFreshnessMessage: hasFailure
            ? 'Some categories failed to sync. Check sync status for details.'
            : 'All data synchronized successfully.',
        },
      },
    );
  }

  private async updateSyncSuccess(
    userId: Types.ObjectId,
    category: HuaweiConsentCategory,
    isEmpty: boolean,
  ): Promise<void> {
    await this.syncProgressModel.findOneAndUpdate(
      { userId, category },
      {
        $set: {
          provider: 'huawei' as const,
          status: 'synced',
          reasonClass: isEmpty ? 'noDataForRange' : 'ok',
          explanation: isEmpty
            ? 'No new records found in this time range.'
            : 'Synchronization succeeded.',
          lastSuccessAt: new Date(),
        },
      },
      { upsert: true },
    );
  }

  private classifyError(err: unknown): HuaweiSyncReasonClass {
    const errMsg = err instanceof Error ? err.message : String(err);
    const msg = errMsg.toLowerCase();
    if (
      msg.includes('403') ||
      msg.includes('permission') ||
      msg.includes('scope') ||
      msg.includes('unauthorized')
    ) {
      return 'permissionNotGranted';
    }
    if (
      msg.includes('hardware') ||
      msg.includes('device') ||
      msg.includes('unsupported')
    ) {
      return 'deviceUnsupported';
    }
    if (
      msg.includes('region') ||
      msg.includes('limit') ||
      msg.includes('hms')
    ) {
      return 'regionLimitation';
    }
    if (
      msg.includes('disabled') ||
      msg.includes('inactive') ||
      msg.includes('sync off')
    ) {
      return 'syncSettingsOff';
    }
    return 'notYetSynced';
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

  private getCategoryEffects(): Record<HuaweiConsentCategory, string[]> {
    return {
      activity: [
        'Daily trends may be incomplete. Consistency coaching will be limited.',
      ],
      workouts: ['Workout feedback and training insights will be limited.'],
      sleep: ['Recovery guidance and sleep trends will be limited.'],
      heartSignals: ['Intensity tuning and recovery signals will be limited.'],
      spo2: ['Recovery context from SpO2 will be unavailable.'],
      selectedRecords: [
        'Some structured records and insights will be unavailable.',
      ],
    };
  }

  private getLimitedDataMessage(input: {
    status: string;
    grantedCategories: HuaweiConsentCategory[];
    enabledCategories: HuaweiConsentCategory[];
  }): string | undefined {
    if (input.status !== 'connected') {
      return 'Huawei is disconnected or unavailable. Syncing and insights are limited.';
    }
    if (input.enabledCategories.length === 0) {
      return 'All categories are disabled. No new data will be synced.';
    }
    if (input.enabledCategories.length < input.grantedCategories.length) {
      return 'Some categories are disabled. Insights will be limited.';
    }
    return undefined;
  }

  private getRetentionPolicy(appConfig: AppConfig) {
    return {
      policySummary: appConfig.huawei.retentionPolicySummary,
      choices: {
        retain: {
          label: 'Keep imported data',
          description:
            'We stop syncing new data, but retain previously imported data according to our retention policy.',
        },
        deleteImportedData: {
          label: 'Delete imported data',
          description:
            'We will delete previously imported Huawei data from our systems. This may remove historical insights.',
          isDestructive: true,
        },
      },
    };
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
