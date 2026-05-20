import { Test, TestingModule } from '@nestjs/testing';
import { HuaweiController } from './huawei.controller';
import { HuaweiService } from './huawei.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';

describe('HuaweiController', () => {
  let controller: HuaweiController;
  let service: HuaweiService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HuaweiController],
      providers: [
        {
          provide: HuaweiService,
          useValue: {
            getConnectConfig: jest.fn(),
            createAuthorization: jest.fn(),
            handleCallback: jest.fn(),
            getStatus: jest.fn(),
            getConsentSettings: jest.fn(),
            updateConsent: jest.fn(),
            getConsentHistory: jest.fn(),
            disconnect: jest.fn(),
          },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: jest.fn(() => true) })
      .compile();

    controller = module.get(HuaweiController);
    service = module.get(HuaweiService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should return connect config', () => {
    (service.getConnectConfig as jest.Mock).mockReturnValue({
      provider: 'huawei',
    });
    const result = controller.getConnectConfig('user123');
    expect(service.getConnectConfig).toHaveBeenCalledWith('user123');
    expect(result).toEqual({ provider: 'huawei' });
  });

  it('should initiate authorization', async () => {
    (service.createAuthorization as jest.Mock).mockResolvedValue({
      authorizationUrl: 'https://example',
      stateId: 'state',
    });
    const dto = {
      requestedCategories: ['activity'],
      clientRedirectUrl: 'http://localhost:3000/connected',
      consentShownAt: new Date().toISOString(),
      consentUiVersion: '1',
      privacyPolicyVersion: '1',
      nonMedicalDisclaimerVersion: '1',
    };
    const result = await controller.authorize('user123', dto);
    expect(service.createAuthorization).toHaveBeenCalledWith('user123', dto);
    expect(result.authorizationUrl).toBe('https://example');
  });

  it('should return consent settings', async () => {
    (service.getConsentSettings as jest.Mock).mockResolvedValue({
      provider: 'huawei',
      connection: { status: 'connected' },
    });
    const result = await controller.getConsent('user123');
    expect(service.getConsentSettings).toHaveBeenCalledWith('user123');
    expect(result.provider).toBe('huawei');
  });

  it('should update consent', async () => {
    (service.updateConsent as jest.Mock).mockResolvedValue({
      updated: true,
      requiresReauthorization: false,
    });
    const dto = {
      enabledCategories: ['activity'],
      consentUiVersion: '1',
      privacyPolicyVersion: '1',
      nonMedicalDisclaimerVersion: '1',
    };
    const result = await controller.updateConsent('user123', dto as any);
    expect(service.updateConsent).toHaveBeenCalledWith('user123', dto);
    expect(result.updated).toBe(true);
  });

  it('should return consent history', async () => {
    (service.getConsentHistory as jest.Mock).mockResolvedValue({
      events: [],
    });
    const result = await controller.getConsentHistory('user123', '10');
    expect(service.getConsentHistory).toHaveBeenCalledWith('user123', {
      limit: '10',
    });
    expect(result.events).toEqual([]);
  });

  it('should disconnect with dto', async () => {
    (service.disconnect as jest.Mock).mockResolvedValue({
      disconnected: true,
      deletionMode: 'retain',
    });
    const dto = { deletionMode: 'retain' };
    const result = await controller.disconnect('user123', dto as any);
    expect(service.disconnect).toHaveBeenCalledWith('user123', dto);
    expect(result.disconnected).toBe(true);
  });
});
