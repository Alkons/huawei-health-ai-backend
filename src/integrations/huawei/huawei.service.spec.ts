import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
  };
}

describe('HuaweiService', () => {
  const userId = '507f1f77bcf86cd799439011';
  const tokenCryptoService: Pick<
    HuaweiTokenCryptoService,
    'encryptRefreshToken'
  > = {
    encryptRefreshToken: jest.fn((t: string) => `enc:${t}`),
  };

  const configService: Pick<ConfigService, 'get'> = {
    get: jest.fn(() => createAppConfig()),
  };

  const oauthStateModel = createModelMock();
  const tokenModel = createModelMock();
  const connectionModel = createModelMock();
  const ledgerModel = createModelMock();

  const createService = () =>
    new HuaweiService(
      configService as ConfigService,
      tokenCryptoService as HuaweiTokenCryptoService,
      oauthStateModel as any,
      tokenModel as any,
      connectionModel as any,
      ledgerModel as any,
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
});
