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
    find: jest.Mock;
    findOne: jest.Mock;
    sort: jest.Mock;
    lean: jest.Mock;
  };
  let spo2RecordModel: {
    find: jest.Mock;
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
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn(),
    };

    workoutSessionModel = {
      find: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn(),
    };

    sleepSessionModel = {
      find: jest.fn().mockReturnThis(),
      findOne: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      lean: jest.fn(),
    };

    heartSignalModel = {
      find: jest.fn().mockReturnThis(),
      findOne: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      lean: jest.fn(),
    };

    spo2RecordModel = {
      find: jest.fn().mockReturnThis(),
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
    it('should return latest activity, sleep, heart rate, spo2 values, weekly activity averages and recent workouts list', async () => {
      const userId = new Types.ObjectId().toString();
      const mockActivity = {
        date: '2026-05-20',
        steps: 8000,
        calories: 300,
        distance: 5000,
        intensityMinutes: 45,
        hoursActive: 10,
        lastSyncedAt: new Date(),
      };
      const mockSleep = {
        startTime: new Date(),
        endTime: new Date(),
        duration: 420,
      };
      const mockHeart = { timestamp: new Date(), heartRate: 72 };
      const mockSpO2 = { timestamp: new Date(), spo2: 98 };

      const mockWorkouts = [
        {
          _id: new Types.ObjectId(),
          workoutId: 'w1',
          activityType: 'running',
          startTime: new Date(),
          endTime: new Date(),
          duration: 1800,
          calories: 300,
        },
      ];

      connectionModel.lean.mockResolvedValue({
        status: 'connected',
        enabledCategories: ['activity', 'sleep', 'heartSignals', 'spo2'],
      });

      // To handle parallel mock resolution of find and findOne on dailyActivityModel
      const dailyActivityFindOneMock = {
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockActivity),
      };
      const dailyActivityFindMock = {
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([mockActivity]),
      };

      dailyActivityModel.findOne.mockReturnValue(dailyActivityFindOneMock);
      dailyActivityModel.find.mockReturnValue(dailyActivityFindMock);

      sleepSessionModel.lean.mockResolvedValue(mockSleep);
      heartSignalModel.lean.mockResolvedValue(mockHeart);
      spo2RecordModel.lean.mockResolvedValue(mockSpO2);

      // Workout mock
      const workoutsFindMock = {
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockWorkouts),
      };
      workoutSessionModel.find.mockReturnValue(workoutsFindMock);

      syncProgressModel.findOne.mockReturnThis();
      syncProgressModel.lean.mockResolvedValue(null);

      const dashboard = await service.getDashboard(userId);

      expect(dashboard.activity?.steps).toEqual(8000);
      expect(dashboard.activity?.weekly?.totalSteps).toEqual(8000);
      expect(dashboard.activity?.weekly?.avgSteps).toEqual(8000);
      expect(dashboard.sleep?.duration).toEqual(420);
      expect(dashboard.heartRate?.heartRate).toEqual(72);
      expect(dashboard.spo2?.spo2).toEqual(98);
      expect(dashboard.recentWorkouts?.length).toEqual(1);
      expect(dashboard.recentWorkouts?.[0].activityType).toEqual('running');
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

  describe('getTrends', () => {
    it('should aggregate steps, calories, sleep, heart rate, and spo2 for the last 7 days', async () => {
      const userId = new Types.ObjectId().toString();

      connectionModel.lean.mockResolvedValue({
        status: 'connected',
        enabledCategories: ['activity', 'sleep', 'heartSignals', 'spo2'],
      });

      const mockActivities = [
        {
          date: '2026-05-20',
          steps: 10000,
          calories: 400,
          lastSyncedAt: new Date(),
        },
        {
          date: '2026-05-21',
          steps: 8000,
          calories: 350,
          lastSyncedAt: new Date(),
        },
      ];

      const mockSleep = [
        {
          startTime: new Date('2026-05-20T22:00:00Z'),
          endTime: new Date('2026-05-21T06:00:00Z'),
          duration: 480,
        },
      ];

      const mockHeart = [
        {
          timestamp: new Date('2026-05-20T08:00:00Z'),
          heartRate: 70,
          restingHeartRate: 60,
        },
        {
          timestamp: new Date('2026-05-20T20:00:00Z'),
          heartRate: 80,
          restingHeartRate: 64,
        },
      ];

      const mockSpO2 = [
        { timestamp: new Date('2026-05-21T10:00:00Z'), spo2: 98.5 },
      ];

      dailyActivityModel.lean.mockResolvedValue(mockActivities);
      sleepSessionModel.lean.mockResolvedValue(mockSleep);
      heartSignalModel.lean.mockResolvedValue(mockHeart);
      spo2RecordModel.lean.mockResolvedValue(mockSpO2);

      syncProgressModel.findOne.mockReturnThis();
      syncProgressModel.lean.mockResolvedValue(null);

      const trends = await service.getTrends(userId, 7);

      expect(trends.days).toBe(7);
      expect(trends.trends.steps?.points.length).toBe(7);
      expect(trends.trends.steps?.summary.total).toBe(18000);
      expect(trends.trends.steps?.summary.average).toBe(9000);
      expect(trends.trends.steps?.summary.min).toBe(8000);
      expect(trends.trends.steps?.summary.max).toBe(10000);

      const sleepPoints = trends.trends.sleep?.points || [];
      const sleep20th = sleepPoints.find((p) => p.date === '2026-05-20');
      expect(sleep20th?.value).toBe(480);

      const hrPoints = trends.trends.restingHeartRate?.points || [];
      const hr20th = hrPoints.find((p) => p.date === '2026-05-20');
      expect(hr20th?.value).toBe(62);

      const spo2Points = trends.trends.spo2?.points || [];
      const spo221st = spo2Points.find((p) => p.date === '2026-05-21');
      expect(spo221st?.value).toBe(98.5);
    });

    it('should return empty values with reliability indicators when permissions are missing', async () => {
      const userId = new Types.ObjectId().toString();

      connectionModel.lean.mockResolvedValue({
        status: 'connected',
        enabledCategories: ['activity'],
      });

      dailyActivityModel.lean.mockResolvedValue([]);
      sleepSessionModel.lean.mockResolvedValue([]);
      heartSignalModel.lean.mockResolvedValue([]);
      spo2RecordModel.lean.mockResolvedValue([]);

      syncProgressModel.findOne.mockReturnThis();
      syncProgressModel.lean.mockResolvedValue({
        status: 'failed',
        reasonClass: 'permissionNotGranted',
      });

      const trends = await service.getTrends(userId, 7);

      expect(trends.trends.steps?.points.every((p) => p.value === null)).toBe(
        true,
      );
      expect(trends.trends.steps?.summary.average).toBeNull();
      expect(trends.trends.steps?.reliability?.isStale).toBe(true);
    });
  });
});
