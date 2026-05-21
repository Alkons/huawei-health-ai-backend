import { Test, TestingModule } from '@nestjs/testing';
import { HealthDataController } from './health-data.controller';
import { HealthDataService } from './health-data.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

describe('HealthDataController', () => {
  let controller: HealthDataController;
  let service: HealthDataService;

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
          },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: jest.fn(() => true) })
      .compile();

    controller = module.get(HealthDataController);
    service = module.get(HealthDataService);
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
});
