import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { HealthDataService } from './health-data.service';
import { HuaweiService } from '../integrations/huawei/huawei.service';
import { HuaweiSyncProgress } from '../integrations/huawei/schemas/huawei-sync-progress.schema';
import { HuaweiDailyActivity } from '../integrations/huawei/schemas/huawei-daily-activity.schema';
import { HuaweiWorkoutSession } from '../integrations/huawei/schemas/huawei-workout-session.schema';
import { HuaweiSleepSession } from '../integrations/huawei/schemas/huawei-sleep-session.schema';
import { HuaweiHeartSignal } from '../integrations/huawei/schemas/huawei-heart-signal.schema';
import { HuaweiSpO2Record } from '../integrations/huawei/schemas/huawei-spo2-record.schema';
import { HuaweiConnection } from '../integrations/huawei/schemas/huawei-connection.schema';

describe('HealthDataService', () => {
  let service: HealthDataService;
  let huaweiService: HuaweiService;

  let syncProgressModel: {
    find: jest.Mock;
    findOne: jest.Mock;
    lean: jest.Mock;
  };
  let dailyActivityModel: {
    find: jest.Mock;
    findOne: jest.Mock;
    sort: jest.Mock;
    lean: jest.Mock;
  };
  let workoutSessionModel: {
    find: jest.Mock;
    lean: jest.Mock;
  };
  let sleepSessionModel: {
    find: jest.Mock;
    findOne: jest.Mock;
    sort: jest.Mock;
    lean: jest.Mock;
  };
  let heartSignalModel: {
    findOne: jest.Mock;
    sort: jest.Mock;
    lean: jest.Mock;
  };
  let spo2RecordModel: {
    findOne: jest.Mock;
    sort: jest.Mock;
    lean: jest.Mock;
  };
  let connectionModel: {
    findOne: jest.Mock;
    lean: jest.Mock;
  };

  beforeEach(async () => {
    syncProgressModel = {
      find: jest.fn().mockReturnThis(),
      findOne: jest.fn().mockReturnThis(),
      lean: jest.fn(),
    };

    dailyActivityModel = {
      find: jest.fn().mockReturnThis(),
      findOne: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      lean: jest.fn(),
    };

    workoutSessionModel = {
      find: jest.fn().mockReturnThis(),
      lean: jest.fn(),
    };

    sleepSessionModel = {
      find: jest.fn().mockReturnThis(),
      findOne: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      lean: jest.fn(),
    };

    heartSignalModel = {
      findOne: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      lean: jest.fn(),
    };

    spo2RecordModel = {
      findOne: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      lean: jest.fn(),
    };

    connectionModel = {
      findOne: jest.fn().mockReturnThis(),
      lean: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthDataService,
        {
          provide: HuaweiService,
          useValue: {
            syncAllEnabledCategories: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: getModelToken(HuaweiSyncProgress.name),
          useValue: syncProgressModel,
        },
        {
          provide: getModelToken(HuaweiDailyActivity.name),
          useValue: dailyActivityModel,
        },
        {
          provide: getModelToken(HuaweiWorkoutSession.name),
          useValue: workoutSessionModel,
        },
        {
          provide: getModelToken(HuaweiSleepSession.name),
          useValue: sleepSessionModel,
        },
        {
          provide: getModelToken(HuaweiHeartSignal.name),
          useValue: heartSignalModel,
        },
        {
          provide: getModelToken(HuaweiSpO2Record.name),
          useValue: spo2RecordModel,
        },
        {
          provide: getModelToken(HuaweiConnection.name),
          useValue: connectionModel,
        },
      ],
    }).compile();

    service = module.get(HealthDataService);
    huaweiService = module.get(HuaweiService);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getSyncStatus', () => {
    it('should find sync progress for user', async () => {
      const userId = new Types.ObjectId().toString();
      const mockResult = [{ category: 'activity', status: 'synced' }];
      syncProgressModel.lean.mockResolvedValue(mockResult);

      const result = await service.getSyncStatus(userId);

      expect(syncProgressModel.find).toHaveBeenCalledWith({
        userId: new Types.ObjectId(userId),
      });
      expect(result).toEqual(mockResult);
    });
  });

  describe('triggerSync', () => {
    it('should invoke syncAllEnabledCategories and resolve immediately', () => {
      const userId = new Types.ObjectId().toString();

      service.triggerSync(userId);

      expect(huaweiService.syncAllEnabledCategories).toHaveBeenCalledWith(
        userId,
      );
    });

    it('should log error if syncAllEnabledCategories rejects', async () => {
      const userId = new Types.ObjectId().toString();
      const errorSpy = jest.spyOn(
        (service as unknown as { logger: { error: jest.Mock } }).logger,
        'error',
      );
      (
        huaweiService.syncAllEnabledCategories as jest.Mock
      ).mockRejectedValueOnce(new Error('Sync failure'));

      service.triggerSync(userId);

      // Wait a tiny tick for background promise to reject
      await new Promise((resolve) => process.nextTick(resolve));
      expect(errorSpy).toHaveBeenCalled();
    });
  });

  describe('getTimeline', () => {
    it('should fetch workouts, sleep, daily summaries, combine and sort descending by timestamp', async () => {
      const userId = new Types.ObjectId().toString();
      const date1 = new Date('2026-05-18T10:00:00Z');
      const date2 = new Date('2026-05-19T08:00:00Z');
      const date3Str = '2026-05-20';

      const mockWorkouts = [
        {
          _id: new Types.ObjectId(),
          workoutId: 'w1',
          activityType: 'running',
          startTime: date1,
          endTime: new Date(date1.getTime() + 1800000),
          duration: 1800,
          calories: 300,
        },
      ];

      const mockSleep = [
        {
          _id: new Types.ObjectId(),
          sleepId: 's1',
          startTime: date2,
          endTime: new Date(date2.getTime() + 28800000),
          duration: 480,
        },
      ];

      const mockActivities = [
        {
          _id: new Types.ObjectId(),
          date: date3Str,
          steps: 10000,
          calories: 500,
        },
      ];

      workoutSessionModel.lean.mockResolvedValue(mockWorkouts);
      sleepSessionModel.lean.mockResolvedValue(mockSleep);
      dailyActivityModel.lean.mockResolvedValue(mockActivities);

      const timeline = await service.getTimeline(userId);

      expect(timeline.length).toBe(3);
      // Sorted descending: activity first (noon on May 20), then sleep (May 19), then workout (May 18)
      expect(timeline[0].type).toBe('activity');
      expect(timeline[0].timestamp).toEqual(new Date('2026-05-20T12:00:00Z'));
      expect(timeline[1].type).toBe('sleep');
      expect(timeline[1].timestamp).toEqual(date2);
      expect(timeline[2].type).toBe('workout');
      expect(timeline[2].timestamp).toEqual(date1);
    });
  });

  describe('getDashboard', () => {
    it('should return latest activity, sleep, heart rate, and spo2 values', async () => {
      const userId = new Types.ObjectId().toString();
      const mockActivity = {
        date: '2026-05-20',
        steps: 8000,
        lastSyncedAt: new Date(),
      };
      const mockSleep = {
        startTime: new Date(),
        endTime: new Date(),
        duration: 420,
      };
      const mockHeart = { timestamp: new Date(), heartRate: 72 };
      const mockSpO2 = { timestamp: new Date(), spo2: 98 };

      connectionModel.lean.mockResolvedValue({
        status: 'connected',
        enabledCategories: ['activity', 'sleep', 'heartSignals', 'spo2'],
      });

      dailyActivityModel.lean.mockResolvedValue(mockActivity);
      sleepSessionModel.lean.mockResolvedValue(mockSleep);
      heartSignalModel.lean.mockResolvedValue(mockHeart);
      spo2RecordModel.lean.mockResolvedValue(mockSpO2);

      syncProgressModel.findOne.mockReturnThis();
      syncProgressModel.lean.mockResolvedValue(null);

      const dashboard = await service.getDashboard(userId);

      expect(dashboard.activity?.steps).toEqual(8000);
      expect(dashboard.sleep?.duration).toEqual(420);
      expect(dashboard.heartRate?.heartRate).toEqual(72);
      expect(dashboard.spo2?.spo2).toEqual(98);
    });
  });

  describe('getReliabilityReport', () => {
    it('should return low confidence report if not connected', async () => {
      const userId = new Types.ObjectId().toString();
      connectionModel.lean.mockResolvedValue(null);

      const report = await service.getReliabilityReport(userId);

      expect(report.overall.freshness).toBe('unknown');
      expect(report.overall.completeness).toBe('none');
      expect(report.overall.confidence).toBe('low');
      expect(report.overall.isStaleBannerRequired).toBe(true);
      expect(report.categories.length).toBe(0);
    });

    it('should calculate high confidence report on optimal sync', async () => {
      const userId = new Types.ObjectId().toString();
      const now = new Date();
      connectionModel.lean.mockResolvedValue({
        status: 'connected',
        enabledCategories: ['activity', 'workouts'],
        lastSyncAt: now,
      });

      syncProgressModel.find.mockReturnThis();
      syncProgressModel.lean.mockResolvedValue([
        {
          category: 'activity',
          status: 'synced',
          reasonClass: 'ok',
          lastSuccessAt: now,
        },
        {
          category: 'workouts',
          status: 'synced',
          reasonClass: 'ok',
          lastSuccessAt: now,
        },
      ]);

      const report = await service.getReliabilityReport(userId);

      expect(report.overall.freshness).toBe('fresh');
      expect(report.overall.completeness).toBe('complete');
      expect(report.overall.confidence).toBe('high');
      expect(report.overall.isStaleBannerRequired).toBe(false);
      expect(report.categories.length).toBe(2);
      expect(report.categories[0].freshness).toBe('fresh');
    });

    it('should return low confidence if data is stale', async () => {
      const userId = new Types.ObjectId().toString();
      const staleTime = new Date(Date.now() - 30 * 60 * 60 * 1000); // 30h ago
      connectionModel.lean.mockResolvedValue({
        status: 'connected',
        enabledCategories: ['activity'],
        lastSyncAt: staleTime,
      });

      syncProgressModel.find.mockReturnThis();
      syncProgressModel.lean.mockResolvedValue([
        {
          category: 'activity',
          status: 'synced',
          reasonClass: 'ok',
          lastSuccessAt: staleTime,
        },
      ]);

      const report = await service.getReliabilityReport(userId);

      expect(report.overall.freshness).toBe('stale');
      expect(report.overall.confidence).toBe('low');
      expect(report.overall.isStaleBannerRequired).toBe(true);
    });

    it('should calculate action steps for failed categories', async () => {
      const userId = new Types.ObjectId().toString();
      connectionModel.lean.mockResolvedValue({
        status: 'connected',
        enabledCategories: ['activity'],
        lastSyncAt: new Date(),
      });

      syncProgressModel.find.mockReturnThis();
      syncProgressModel.lean.mockResolvedValue([
        {
          category: 'activity',
          status: 'failed',
          reasonClass: 'permissionNotGranted',
          explanation: 'Insufficient scope',
        },
      ]);

      const report = await service.getReliabilityReport(userId);

      expect(report.overall.completeness).toBe('none');
      expect(report.overall.confidence).toBe('low');
      expect(report.overall.guidance.actionSteps.length).toBeGreaterThan(0);
      expect(report.overall.guidance.actionSteps).toContain(
        'Go to Consent settings in the app',
      );
    });
  });
});
