import { Test, TestingModule } from '@nestjs/testing';
import { HealthDataController } from './health-data.controller';
import { HealthDataService } from './health-data.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { HuaweiService } from '../integrations/huawei/huawei.service';

describe('HealthDataController', () => {
  let controller: HealthDataController;
  let service: HealthDataService;
  let huaweiService: HuaweiService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthDataController],
      providers: [
        {
          provide: HealthDataService,
          useValue: {
            getSyncStatus: jest.fn(),
            triggerSync: jest.fn(),
            getTimeline: jest.fn(),
            getDashboard: jest.fn(),
            getReliabilityReport: jest.fn(),
            getTrends: jest.fn(),
          },
        },
        {
          provide: HuaweiService,
          useValue: {
            getAdvancedEligibility: jest.fn(),
            getAdvancedRecords: jest.fn(),
          },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: jest.fn(() => true) })
      .compile();

    controller = module.get(HealthDataController);
    service = module.get(HealthDataService);
    huaweiService = module.get(HuaweiService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getSyncStatus', () => {
    it('should call service.getSyncStatus with userId', async () => {
      const userId = 'user-123';
      const mockResult = [{ category: 'activity', status: 'synced' }];
      (service.getSyncStatus as jest.Mock).mockResolvedValue(mockResult);

      const result = await controller.getSyncStatus(userId);

      expect(service.getSyncStatus).toHaveBeenCalledWith(userId);
      expect(result).toEqual(mockResult);
    });
  });

  describe('triggerSync', () => {
    it('should call service.triggerSync and return accepted response', () => {
      const userId = 'user-123';

      const result = controller.triggerSync(userId);

      expect(service.triggerSync).toHaveBeenCalledWith(userId);
      expect(result).toEqual({
        status: 'accepted',
        message: 'Background synchronization initialized.',
      });
    });
  });

  describe('getTimeline', () => {
    it('should parse optional parameters and call service.getTimeline', async () => {
      const userId = 'user-123';
      const from = '2026-05-18T00:00:00Z';
      const to = '2026-05-20T00:00:00Z';
      const mockResult = [{ id: '1', type: 'workout', timestamp: new Date() }];
      (service.getTimeline as jest.Mock).mockResolvedValue(mockResult);

      const result = await controller.getTimeline(userId, from, to);

      expect(service.getTimeline).toHaveBeenCalledWith(
        userId,
        new Date(from),
        new Date(to),
      );
      expect(result).toEqual(mockResult);
    });
  });

  describe('getDashboard', () => {
    it('should call service.getDashboard with userId', async () => {
      const userId = 'user-123';
      const mockResult = { activity: { steps: 5000 } };
      (service.getDashboard as jest.Mock).mockResolvedValue(mockResult);

      const result = await controller.getDashboard(userId);

      expect(service.getDashboard).toHaveBeenCalledWith(userId);
      expect(result).toEqual(mockResult);
    });
  });

  describe('getReliability', () => {
    it('should call service.getReliabilityReport with userId', async () => {
      const userId = 'user-123';
      const mockResult = {
        overall: {
          freshness: 'fresh',
          completeness: 'complete',
          confidence: 'high',
        },
      };
      (service.getReliabilityReport as jest.Mock).mockResolvedValue(mockResult);

      const result = await controller.getReliability(userId);

      expect(service.getReliabilityReport).toHaveBeenCalledWith(userId);
      expect(result).toEqual(mockResult);
    });
  });

  describe('getTrends', () => {
    it('should call service.getTrends with userId and parsed days parameter', async () => {
      const userId = 'user-123';
      const mockResult = { days: 14, trends: {} };
      (service.getTrends as jest.Mock).mockResolvedValue(mockResult);

      const result = await controller.getTrends(userId, '14');

      expect(service.getTrends).toHaveBeenCalledWith(userId, 14);
      expect(result).toEqual(mockResult);
    });

    it('should default days to 7 if not specified', async () => {
      const userId = 'user-123';
      const mockResult = { days: 7, trends: {} };
      (service.getTrends as jest.Mock).mockResolvedValue(mockResult);

      const result = await controller.getTrends(userId);

      expect(service.getTrends).toHaveBeenCalledWith(userId, 7);
      expect(result).toEqual(mockResult);
    });

    it('should throw BadRequestException if invalid days window is provided', async () => {
      const userId = 'user-123';
      await expect(controller.getTrends(userId, '10')).rejects.toThrow(
        'Trend window must be 7, 14, or 30 days.',
      );
    });
  });

  describe('getAdvancedEligibility', () => {
    it('should call huaweiService.getAdvancedEligibility with userId', async () => {
      const userId = 'user-123';
      const mockResult = [{ recordType: 'sleepBreathing', status: 'eligible' }];
      (huaweiService.getAdvancedEligibility as jest.Mock).mockResolvedValue(
        mockResult,
      );

      const result = await controller.getAdvancedEligibility(userId);

      expect(huaweiService.getAdvancedEligibility).toHaveBeenCalledWith(userId);
      expect(result).toEqual(mockResult);
    });
  });

  describe('getAdvancedRecords', () => {
    it('should call huaweiService.getAdvancedRecords with userId and type', async () => {
      const userId = 'user-123';
      const type = 'sleepBreathing';
      const mockResult = [{ recordType: 'sleepBreathing' }];
      (huaweiService.getAdvancedRecords as jest.Mock).mockResolvedValue(
        mockResult,
      );

      const result = await controller.getAdvancedRecords(userId, type);

      expect(huaweiService.getAdvancedRecords).toHaveBeenCalledWith(
        userId,
        type,
      );
      expect(result).toEqual(mockResult);
    });
  });
});
