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

  it('should return connect config', async () => {
    (service.getConnectConfig as jest.Mock).mockResolvedValue({ provider: 'huawei' });
    const result = await controller.getConnectConfig('user123');
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
});

