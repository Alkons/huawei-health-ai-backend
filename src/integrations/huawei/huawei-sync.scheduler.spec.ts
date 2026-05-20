import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { HuaweiSyncScheduler } from './huawei-sync.scheduler';
import { HuaweiService } from './huawei.service';
import { HuaweiConnection } from './schemas/huawei-connection.schema';
import { Types } from 'mongoose';

describe('HuaweiSyncScheduler', () => {
  let scheduler: HuaweiSyncScheduler;
  let huaweiService: HuaweiService;
  let connectionModel: {
    find: jest.Mock;
    select: jest.Mock;
    lean: jest.Mock;
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HuaweiSyncScheduler,
        {
          provide: HuaweiService,
          useValue: {
            syncAllEnabledCategories: jest.fn(),
          },
        },
        {
          provide: getModelToken(HuaweiConnection.name),
          useValue: {
            find: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            lean: jest.fn(),
          },
        },
      ],
    }).compile();

    scheduler = module.get(HuaweiSyncScheduler);
    huaweiService = module.get(HuaweiService);
    connectionModel = module.get(getModelToken(HuaweiConnection.name));
  });

  afterEach(() => {
    scheduler.onApplicationShutdown();
  });

  it('should be defined', () => {
    expect(scheduler).toBeDefined();
  });

  describe('runBackgroundSync', () => {
    it('should query connected users and call syncAllEnabledCategories for each', async () => {
      const userId1 = new Types.ObjectId();
      const userId2 = new Types.ObjectId();
      const mockConnections = [{ userId: userId1 }, { userId: userId2 }];

      connectionModel.lean.mockResolvedValue(mockConnections);

      await scheduler.runBackgroundSync();

      expect(connectionModel.find).toHaveBeenCalledWith({
        status: 'connected',
      });
      expect(connectionModel.select).toHaveBeenCalledWith('userId');
      expect(huaweiService.syncAllEnabledCategories).toHaveBeenCalledTimes(2);
      expect(huaweiService.syncAllEnabledCategories).toHaveBeenNthCalledWith(
        1,
        userId1.toString(),
      );
      expect(huaweiService.syncAllEnabledCategories).toHaveBeenNthCalledWith(
        2,
        userId2.toString(),
      );
    });

    it('should catch error if connectionModel query throws', async () => {
      connectionModel.lean.mockRejectedValue(new Error('DB error'));
      await expect(scheduler.runBackgroundSync()).resolves.not.toThrow();
    });

    it('should catch error if syncAllEnabledCategories throws for one user and proceed to next', async () => {
      const userId1 = new Types.ObjectId();
      const userId2 = new Types.ObjectId();
      const mockConnections = [{ userId: userId1 }, { userId: userId2 }];

      connectionModel.lean.mockResolvedValue(mockConnections);
      (huaweiService.syncAllEnabledCategories as jest.Mock)
        .mockRejectedValueOnce(new Error('Sync failed'))
        .mockResolvedValueOnce(undefined);

      await scheduler.runBackgroundSync();

      expect(huaweiService.syncAllEnabledCategories).toHaveBeenCalledTimes(2);
    });
  });

  describe('onApplicationBootstrap and onApplicationShutdown', () => {
    it('should set up setInterval', () => {
      jest.useFakeTimers();
      jest.spyOn(scheduler, 'runBackgroundSync').mockResolvedValue(undefined);

      scheduler.onApplicationBootstrap();

      // Fast-forward 6 seconds for the startup timeout (which is set at 5000ms)
      jest.advanceTimersByTime(6000);
      expect(scheduler.runBackgroundSync).toHaveBeenCalled();

      // Fast-forward 30 minutes
      jest.advanceTimersByTime(30 * 60 * 1000);
      expect(scheduler.runBackgroundSync).toHaveBeenCalledTimes(2);

      scheduler.onApplicationShutdown();
      jest.useRealTimers();
    });
  });
});
