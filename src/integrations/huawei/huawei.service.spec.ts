import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';
import { HuaweiService } from './huawei.service';
import { HuaweiTokenCryptoService } from './huawei-token-crypto.service';

function createAppConfig(overrides?: Partial<any>) {
  return {
    huawei: {
      oauthAuthorizeUrl: 'https://oauth.example/authorize',
      oauthTokenUrl: 'https://oauth.example/token',
      clientId: 'client-id',
      clientSecret: 'client-secret',
      redirectUri: 'http://localhost:3005/v1/integrations/huawei/callback',
      allowedClientRedirectOrigins: ['http://localhost:3000'],
      tokenEncryptionKey: Buffer.alloc(32, 1).toString('base64'),
      privacyPolicyUrl: 'http://localhost:3000/privacy',
      nonMedicalDisclaimerUrl: 'http://localhost:3000/disclaimer',
      manageConsentUrl: 'http://localhost:3000/settings/consent',
    },
    ...overrides,
  };
}

function createModelMock() {
  return {
    create: jest.fn(),
    findOne: jest.fn(),
    deleteOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
    updateOne: jest.fn(),
    bulkWrite: jest.fn(),
  };
}

describe('HuaweiService', () => {
  const userId = '507f1f77bcf86cd799439011';
  const tokenCryptoService: Pick<
    HuaweiTokenCryptoService,
    'encryptRefreshToken' | 'decryptRefreshToken'
  > = {
    encryptRefreshToken: jest.fn((t: string) => `enc:${t}`),
    decryptRefreshToken: jest.fn((t: string) => t.replace('enc:', '')),
  };

  const configService: Pick<ConfigService, 'get'> = {
    get: jest.fn(() => createAppConfig()),
  };

  const oauthStateModel = createModelMock();
  const tokenModel = createModelMock();
  const connectionModel = createModelMock();
  const ledgerModel = createModelMock();
  const clientService = {
    getActivityDaily: jest.fn(),
    getWorkouts: jest.fn(),
    getSleep: jest.fn(),
    getHeartSignals: jest.fn(),
    getSpO2: jest.fn(),
  };
  const dailyActivityModel = createModelMock();
  const workoutSessionModel = createModelMock();
  const sleepSessionModel = createModelMock();
  const heartSignalModel = createModelMock();
  const spo2RecordModel = createModelMock();
  const syncProgressModel = createModelMock();

  const createService = () =>
    new HuaweiService(
      configService as ConfigService,
      tokenCryptoService as HuaweiTokenCryptoService,
      clientService as any,
      oauthStateModel as any,
      tokenModel as any,
      connectionModel as any,
      ledgerModel as any,
      dailyActivityModel as any,
      workoutSessionModel as any,
      sleepSessionModel as any,
      heartSignalModel as any,
      spo2RecordModel as any,
      syncProgressModel as any,
    );

  beforeEach(() => {
    jest.resetAllMocks();
    (configService.get as jest.Mock).mockReturnValue(createAppConfig());
    const fetchMock: jest.MockedFunction<typeof fetch> = jest.fn();
    globalThis.fetch = fetchMock;
  });

  describe('getConnectConfig', () => {
    it('should throw when user id is missing', () => {
      const service = createService();
      expect(() => service.getConnectConfig('')).toThrow(
        new BadRequestException('Missing user id'),
      );
    });

    it('should return links and categories', () => {
      const service = createService();
      const result = service.getConnectConfig(userId);
      expect(result.provider).toBe('huawei');
      expect(result.links.privacyPolicyUrl).toContain('/privacy');
      expect(result.categories.length).toBeGreaterThan(0);
    });
  });

  describe('createAuthorization', () => {
    it('should reject client redirect origin not in allowlist', async () => {
      const service = createService();
      await expect(
        service.createAuthorization(userId, {
          requestedCategories: ['activity'],
          clientRedirectUrl: 'http://evil.example/cb',
          consentShownAt: new Date().toISOString(),
          consentUiVersion: '1',
          privacyPolicyVersion: '1',
          nonMedicalDisclaimerVersion: '1',
        }),
      ).rejects.toThrow('Client redirect origin is not allowed');
    });

    it('should create oauth state and return authorization url', async () => {
      const service = createService();
      const result = await service.createAuthorization(userId, {
        requestedCategories: ['activity', 'workouts'],
        clientRedirectUrl: 'http://localhost:3000/connected',
        consentShownAt: new Date().toISOString(),
        consentUiVersion: '1',
        privacyPolicyVersion: '1',
        nonMedicalDisclaimerVersion: '1',
      });
      expect(oauthStateModel.create).toHaveBeenCalledTimes(1);
      expect(ledgerModel.create).toHaveBeenCalledTimes(1);
      expect(result.authorizationUrl).toContain(
        'https://oauth.example/authorize',
      );
      expect(result.authorizationUrl).toContain('scope=');
      expect(result.stateId).toBeTruthy();
    });
  });

  describe('handleCallback', () => {
    it('should return errored redirect when state is missing', async () => {
      const service = createService();
      const url = await service.handleCallback({
        code: 'code',
        state: undefined,
        error: undefined,
      });
      expect(url).toContain('status=errored');
      expect(url).toContain('reasonClass=invalidState');
    });

    it('should return errored redirect when state not found', async () => {
      const service = createService();
      oauthStateModel.findOne.mockReturnValue({ lean: () => null });
      const url = await service.handleCallback({
        code: 'code',
        state: 'state',
        error: undefined,
      });
      expect(url).toContain('status=errored');
      expect(url).toContain('reasonClass=invalidState');
    });

    it('should write denied ledger when user denies', async () => {
      const service = createService();
      const oauthState = {
        _id: 'id',
        userId: 'userObjId',
        expiresAt: new Date(Date.now() + 10000),
        clientRedirectUrl: 'http://localhost:3000/connected',
        correlationId: 'corr',
        requestedCategories: ['activity'],
        requestedScopes: ['HEALTHKIT_STEP_READ'],
        consentUiVersion: '1',
        privacyPolicyVersion: '1',
        nonMedicalDisclaimerVersion: '1',
      };
      oauthStateModel.findOne.mockReturnValue({ lean: () => oauthState });
      const url = await service.handleCallback({
        code: undefined,
        state: 'state',
        error: 'access_denied',
      });
      expect(ledgerModel.create).toHaveBeenCalled();
      expect(oauthStateModel.deleteOne).toHaveBeenCalledWith({ _id: 'id' });
      expect(url).toContain('reasonClass=consentDenied');
    });

    it('should connect user on success and write accepted ledger', async () => {
      const service = createService();
      const oauthState = {
        _id: 'id',
        userId: 'userObjId',
        expiresAt: new Date(Date.now() + 10000),
        clientRedirectUrl: 'http://localhost:3000/connected',
        correlationId: 'corr',
        requestedCategories: ['activity'],
        requestedScopes: ['HEALTHKIT_STEP_READ'],
        consentUiVersion: '1',
        privacyPolicyVersion: '1',
        nonMedicalDisclaimerVersion: '1',
      };
      oauthStateModel.findOne.mockReturnValue({ lean: () => oauthState });
      tokenModel.findOneAndUpdate.mockResolvedValue({ _id: 'tokenId' });
      (globalThis.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue(
        {
          ok: true,
          json: () =>
            Promise.resolve({
              access_token: 'at',
              refresh_token: 'rt',
              scope: 'HEALTHKIT_STEP_READ',
              expires_in: 3600,
              id_token:
                'header.' +
                Buffer.from(JSON.stringify({ sub: 'huawei-sub' })).toString(
                  'base64url',
                ) +
                '.sig',
            }),
        },
      );
      const url = await service.handleCallback({
        code: 'code',
        state: 'state',
        error: undefined,
      });
      expect(tokenCryptoService.encryptRefreshToken).toHaveBeenCalledWith('rt');
      expect(connectionModel.findOneAndUpdate).toHaveBeenCalled();
      expect(ledgerModel.create).toHaveBeenCalled();
      expect(oauthStateModel.deleteOne).toHaveBeenCalledWith({ _id: 'id' });
      expect(url).toContain('status=connected');
      expect(url).toContain('reasonClass=ok');
    });
  });

  describe('getConsentSettings', () => {
    it('should return notConnected view when connection missing', async () => {
      const service = createService();
      connectionModel.findOne.mockReturnValue({ lean: () => null });
      const result = await service.getConsentSettings(userId);
      expect(result.connection.status).toBe('notConnected');
      expect(result.permissions.grantedCategories).toEqual([]);
    });
  });

  describe('updateConsent', () => {
    it('should reject when not connected', async () => {
      const service = createService();
      connectionModel.findOne.mockReturnValue({ lean: () => null });
      await expect(
        service.updateConsent(userId, {
          enabledCategories: ['activity'],
          consentUiVersion: '1',
          privacyPolicyVersion: '1',
          nonMedicalDisclaimerVersion: '1',
        }),
      ).rejects.toThrow('Huawei is not connected');
    });

    it('should update enabled categories when subset of granted', async () => {
      const service = createService();
      connectionModel.findOne.mockReturnValue({
        lean: () => ({
          status: 'connected',
          grantedCategories: ['activity', 'workouts'],
          enabledCategories: ['activity', 'workouts'],
        }),
      });
      await service.updateConsent(userId, {
        enabledCategories: ['activity'],
        consentUiVersion: '1',
        privacyPolicyVersion: '1',
        nonMedicalDisclaimerVersion: '1',
      });
      expect(connectionModel.updateOne).toHaveBeenCalled();
      expect(ledgerModel.create).toHaveBeenCalled();
    });
  });

  describe('disconnect', () => {
    it('should disconnect and delete token, writing ledger', async () => {
      const service = createService();
      tokenModel.deleteOne.mockResolvedValue({ deletedCount: 1 });
      await service.disconnect(userId, { deletionMode: 'retain' });
      expect(connectionModel.updateOne).toHaveBeenCalled();
      expect(tokenModel.deleteOne).toHaveBeenCalled();
      expect(ledgerModel.create).toHaveBeenCalled();
    });
  });

  describe('getOrRefreshToken', () => {
    it('should throw if token missing', async () => {
      const service = createService();
      tokenModel.findOne.mockResolvedValue(null);
      await expect(service.getOrRefreshToken(userId)).rejects.toThrow(
        new BadRequestException('User not connected or token missing'),
      );
    });

    it('should return active token if not expired', async () => {
      const service = createService();
      const mockToken = {
        accessToken: 'active-token',
        accessTokenExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
        refreshTokenEncrypted: 'enc:refresh',
      };
      tokenModel.findOne.mockResolvedValue(mockToken);
      const token = await service.getOrRefreshToken(userId);
      expect(token).toBe('active-token');
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it('should throw if client not configured', async () => {
      const service = createService();
      const mockToken = {
        accessToken: 'expired-token',
        accessTokenExpiresAt: new Date(Date.now() - 1000),
        refreshTokenEncrypted: 'enc:refresh',
      };
      tokenModel.findOne.mockResolvedValue(mockToken);
      (configService.get as jest.Mock).mockReturnValue({
        huawei: { clientId: '', clientSecret: '' },
      });
      await expect(service.getOrRefreshToken(userId)).rejects.toThrow(
        new BadRequestException('Huawei OAuth client is not configured'),
      );
    });

    it('should refresh token if expired', async () => {
      const service = createService();
      const mockToken = {
        _id: 'tokenId',
        accessToken: 'expired-token',
        accessTokenExpiresAt: new Date(Date.now() - 1000),
        refreshTokenEncrypted: 'enc:refresh',
      };
      tokenModel.findOne.mockResolvedValue(mockToken);
      (globalThis.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue(
        {
          ok: true,
          json: () =>
            Promise.resolve({
              access_token: 'new-at',
              refresh_token: 'new-rt',
              expires_in: 3600,
            }),
        } as any,
      );
      const token = await service.getOrRefreshToken(userId);
      expect(token).toBe('new-at');
      expect(tokenModel.updateOne).toHaveBeenCalled();
    });

    it('should throw if token refresh fails', async () => {
      const service = createService();
      const mockToken = {
        accessToken: 'expired-token',
        accessTokenExpiresAt: new Date(Date.now() - 1000),
        refreshTokenEncrypted: 'enc:refresh',
      };
      tokenModel.findOne.mockResolvedValue(mockToken);
      (globalThis.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue(
        {
          ok: false,
        } as any,
      );
      await expect(service.getOrRefreshToken(userId)).rejects.toThrow(
        new BadRequestException('Huawei token refresh failed'),
      );
    });
  });

  describe('syncCategory', () => {
    const userIdObj = new Types.ObjectId(userId);

    it('should fail with permissionNotGranted if connection missing', async () => {
      const service = createService();
      connectionModel.findOne.mockResolvedValue(null);
      await service.syncCategory(userId, 'activity');
      expect(syncProgressModel.findOneAndUpdate).toHaveBeenCalledWith(
        { userId: userIdObj, category: 'activity' },
        expect.objectContaining({
          $set: expect.objectContaining({
            status: 'failed',
            reasonClass: 'permissionNotGranted',
          }) as unknown,
        }) as unknown,
        { upsert: true },
      );
    });

    it('should fail with permissionNotGranted if connection is not connected', async () => {
      const service = createService();
      connectionModel.findOne.mockResolvedValue({ status: 'disconnected' });
      await service.syncCategory(userId, 'activity');
      expect(syncProgressModel.findOneAndUpdate).toHaveBeenCalledWith(
        { userId: userIdObj, category: 'activity' },
        expect.objectContaining({
          $set: expect.objectContaining({
            status: 'failed',
            reasonClass: 'permissionNotGranted',
          }) as unknown,
        }) as unknown,
        { upsert: true },
      );
    });

    it('should fail with permissionNotGranted if category is not granted or enabled', async () => {
      const service = createService();
      connectionModel.findOne.mockResolvedValue({
        status: 'connected',
        grantedCategories: [],
        enabledCategories: ['activity'],
      });
      await service.syncCategory(userId, 'activity');
      expect(syncProgressModel.findOneAndUpdate).toHaveBeenCalledWith(
        { userId: userIdObj, category: 'activity' },
        expect.objectContaining({
          $set: expect.objectContaining({
            status: 'failed',
            reasonClass: 'permissionNotGranted',
          }) as unknown,
        }) as unknown,
        { upsert: true },
      );
    });

    it('should sync activity category', async () => {
      const service = createService();
      connectionModel.findOne.mockResolvedValue({
        status: 'connected',
        grantedCategories: ['activity'],
        enabledCategories: ['activity'],
      });
      tokenModel.findOne.mockResolvedValue({
        accessToken: 'active-token',
        accessTokenExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
      });
      clientService.getActivityDaily.mockResolvedValue([
        { date: '2026-05-20', steps: 1000, calories: 50, distance: 800 },
      ]);

      await service.syncCategory(userId, 'activity');

      expect(syncProgressModel.findOneAndUpdate).toHaveBeenNthCalledWith(
        1,
        { userId: userIdObj, category: 'activity' },
        expect.objectContaining({
          $set: expect.objectContaining({ status: 'syncing' }) as unknown,
        }) as unknown,
        { upsert: true },
      );
      expect(clientService.getActivityDaily).toHaveBeenCalled();
      expect(dailyActivityModel.bulkWrite).toHaveBeenCalled();
      expect(syncProgressModel.findOneAndUpdate).toHaveBeenNthCalledWith(
        2,
        { userId: userIdObj, category: 'activity' },
        expect.objectContaining({
          $set: expect.objectContaining({
            status: 'synced',
            reasonClass: 'ok',
          }) as unknown,
        }) as unknown,
        { upsert: true },
      );
    });

    it('should sync workouts category', async () => {
      const service = createService();
      connectionModel.findOne.mockResolvedValue({
        status: 'connected',
        grantedCategories: ['workouts'],
        enabledCategories: ['workouts'],
      });
      tokenModel.findOne.mockResolvedValue({
        accessToken: 'active-token',
        accessTokenExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
      });
      clientService.getWorkouts.mockResolvedValue([
        { workoutId: 'w1', activityType: 'running', calories: 200 },
      ]);

      await service.syncCategory(userId, 'workouts');

      expect(clientService.getWorkouts).toHaveBeenCalled();
      expect(workoutSessionModel.bulkWrite).toHaveBeenCalled();
      expect(syncProgressModel.findOneAndUpdate).toHaveBeenNthCalledWith(
        2,
        { userId: userIdObj, category: 'workouts' },
        expect.objectContaining({
          $set: expect.objectContaining({
            status: 'synced',
            reasonClass: 'ok',
          }) as unknown,
        }) as unknown,
        { upsert: true },
      );
    });

    it('should sync sleep category', async () => {
      const service = createService();
      connectionModel.findOne.mockResolvedValue({
        status: 'connected',
        grantedCategories: ['sleep'],
        enabledCategories: ['sleep'],
      });
      tokenModel.findOne.mockResolvedValue({
        accessToken: 'active-token',
        accessTokenExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
      });
      clientService.getSleep.mockResolvedValue([
        { sleepId: 's1', duration: 3600 },
      ]);

      await service.syncCategory(userId, 'sleep');

      expect(clientService.getSleep).toHaveBeenCalled();
      expect(sleepSessionModel.bulkWrite).toHaveBeenCalled();
    });

    it('should sync heartSignals category', async () => {
      const service = createService();
      connectionModel.findOne.mockResolvedValue({
        status: 'connected',
        grantedCategories: ['heartSignals'],
        enabledCategories: ['heartSignals'],
      });
      tokenModel.findOne.mockResolvedValue({
        accessToken: 'active-token',
        accessTokenExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
      });
      clientService.getHeartSignals.mockResolvedValue([
        { timestamp: new Date(), heartRate: 72 },
      ]);

      await service.syncCategory(userId, 'heartSignals');

      expect(clientService.getHeartSignals).toHaveBeenCalled();
      expect(heartSignalModel.bulkWrite).toHaveBeenCalled();
    });

    it('should sync spo2 category', async () => {
      const service = createService();
      connectionModel.findOne.mockResolvedValue({
        status: 'connected',
        grantedCategories: ['spo2'],
        enabledCategories: ['spo2'],
      });
      tokenModel.findOne.mockResolvedValue({
        accessToken: 'active-token',
        accessTokenExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
      });
      clientService.getSpO2.mockResolvedValue([
        { timestamp: new Date(), spo2: 0.98 },
      ]);

      await service.syncCategory(userId, 'spo2');

      expect(clientService.getSpO2).toHaveBeenCalled();
      expect(spo2RecordModel.bulkWrite).toHaveBeenCalled();
    });

    it('should handle category and handle errors', async () => {
      const service = createService();
      connectionModel.findOne.mockResolvedValue({
        status: 'connected',
        grantedCategories: ['activity'],
        enabledCategories: ['activity'],
      });
      tokenModel.findOne.mockResolvedValue({
        accessToken: 'active-token',
        accessTokenExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
      });
      clientService.getActivityDaily.mockRejectedValue(new Error('API Error'));

      await service.syncCategory(userId, 'activity');

      expect(syncProgressModel.findOneAndUpdate).toHaveBeenNthCalledWith(
        2,
        { userId: userIdObj, category: 'activity' },
        expect.objectContaining({
          $set: expect.objectContaining({
            status: 'failed',
            reasonClass: 'notYetSynced',
            explanation: 'API Error',
          }) as unknown,
        }) as unknown,
        { upsert: true },
      );
    });
  });

  describe('syncAllEnabledCategories', () => {
    it('should do nothing if connection is missing', async () => {
      const service = createService();
      connectionModel.findOne.mockResolvedValue(null);
      await service.syncAllEnabledCategories(userId);
      expect(connectionModel.updateOne).not.toHaveBeenCalled();
    });

    it('should sync all enabled categories and update connection status', async () => {
      const service = createService();
      connectionModel.findOne.mockResolvedValue({
        status: 'connected',
        enabledCategories: ['activity', 'workouts'],
        grantedCategories: ['activity', 'workouts'],
      });
      tokenModel.findOne.mockResolvedValue({
        accessToken: 'active-token',
        accessTokenExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
      });
      clientService.getActivityDaily.mockResolvedValue([]);
      clientService.getWorkouts.mockResolvedValue([]);

      await service.syncAllEnabledCategories(userId);

      expect(connectionModel.updateOne).toHaveBeenCalledWith(
        { userId: new Types.ObjectId(userId) },
        expect.objectContaining({
          $set: expect.objectContaining({
            dataFreshnessStatus: 'fresh',
          }) as unknown,
        }) as unknown,
      );
    });

    it('should set connection status to stale if one fails', async () => {
      const service = createService();
      connectionModel.findOne.mockResolvedValue({
        status: 'connected',
        enabledCategories: ['activity'],
        grantedCategories: ['activity'],
      });
      jest
        .spyOn(service, 'syncCategory')
        .mockRejectedValue(new Error('Sync fail'));

      await service.syncAllEnabledCategories(userId);

      expect(connectionModel.updateOne).toHaveBeenCalledWith(
        { userId: new Types.ObjectId(userId) },
        expect.objectContaining({
          $set: expect.objectContaining({
            dataFreshnessStatus: 'stale',
          }) as unknown,
        }) as unknown,
      );
    });
  });
});
