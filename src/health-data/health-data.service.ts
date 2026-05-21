import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { HuaweiService } from '../integrations/huawei/huawei.service';
import {
  HuaweiDailyActivity,
  HuaweiDailyActivityDocument,
} from '../integrations/huawei/schemas/huawei-daily-activity.schema';
import {
  HuaweiHeartSignal,
  HuaweiHeartSignalDocument,
} from '../integrations/huawei/schemas/huawei-heart-signal.schema';
import {
  HuaweiSleepSession,
  HuaweiSleepSessionDocument,
} from '../integrations/huawei/schemas/huawei-sleep-session.schema';
import {
  HuaweiSpO2Record,
  HuaweiSpO2RecordDocument,
} from '../integrations/huawei/schemas/huawei-spo2-record.schema';
import {
  HuaweiSyncProgress,
  HuaweiSyncProgressDocument,
} from '../integrations/huawei/schemas/huawei-sync-progress.schema';
import {
  HuaweiWorkoutSession,
  HuaweiWorkoutSessionDocument,
} from '../integrations/huawei/schemas/huawei-workout-session.schema';

export interface TimelineItem {
  id: string;
  type: 'workout' | 'sleep' | 'activity';
  timestamp: Date;
  data: Record<string, any>;
}

export interface DashboardSummary {
  activity?: {
    date: string;
    steps: number;
    calories: number;
    distance: number;
    intensityMinutes: number;
    hoursActive: number;
  };
  sleep?: {
    startTime: Date;
    endTime: Date;
    duration: number;
    deepSleepDuration?: number;
    lightSleepDuration?: number;
    remSleepDuration?: number;
    awakeDuration?: number;
  };
  heartRate?: {
    timestamp: Date;
    heartRate: number;
    restingHeartRate?: number;
    hrv?: number;
  };
  spo2?: {
    timestamp: Date;
    spo2: number;
    isLowSpO2?: boolean;
  };
}

@Injectable()
export class HealthDataService {
  private readonly logger = new Logger(HealthDataService.name);

  constructor(
    private readonly huaweiService: HuaweiService,
    @InjectModel(HuaweiSyncProgress.name)
    private readonly syncProgressModel: Model<HuaweiSyncProgressDocument>,
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
  ) {}

  /**
   * Retrieves synchronization progress tracking for a user.
   */
  async getSyncStatus(userId: string): Promise<HuaweiSyncProgress[]> {
    this.logger.log(`Fetching sync status for user ${userId}`);
    return this.syncProgressModel
      .find({ userId: new Types.ObjectId(userId) })
      .lean();
  }

  /**
   * Triggers background synchronization asynchronously and returns immediately.
   */
  triggerSync(userId: string): void {
    this.logger.log(`Manually triggering sync for user ${userId}`);
    // Run sync in the background
    this.huaweiService.syncAllEnabledCategories(userId).catch((err) => {
      this.logger.error(`Error during triggered sync for user ${userId}:`, err);
    });
  }

  /**
   * Returns a chronological timeline of workouts, sleep sessions, and daily summaries.
   */
  async getTimeline(
    userId: string,
    from?: Date,
    to?: Date,
  ): Promise<TimelineItem[]> {
    this.logger.log(`Fetching timeline for user ${userId}`);
    const userIdObj = new Types.ObjectId(userId);

    const endDate = to ?? new Date();
    const startDate =
      from ?? new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days default

    const startStr = startDate.toISOString().split('T')[0];
    const endStr = endDate.toISOString().split('T')[0];

    // Fetch from all collections in parallel
    const [workouts, sleepSessions, dailyActivities] = await Promise.all([
      this.workoutSessionModel
        .find({
          userId: userIdObj,
          startTime: { $gte: startDate, $lte: endDate },
        })
        .lean(),
      this.sleepSessionModel
        .find({
          userId: userIdObj,
          startTime: { $gte: startDate, $lte: endDate },
        })
        .lean(),
      this.dailyActivityModel
        .find({
          userId: userIdObj,
          date: { $gte: startStr, $lte: endStr },
        })
        .lean(),
    ]);

    const items: TimelineItem[] = [];

    // Map Workouts
    for (const w of workouts) {
      items.push({
        id: w._id.toString(),
        type: 'workout',
        timestamp: w.startTime,
        data: {
          workoutId: w.workoutId,
          activityType: w.activityType,
          startTime: w.startTime,
          endTime: w.endTime,
          duration: w.duration,
          calories: w.calories,
          distance: w.distance,
          avgHeartRate: w.avgHeartRate,
          maxHeartRate: w.maxHeartRate,
        },
      });
    }

    // Map Sleep
    for (const s of sleepSessions) {
      items.push({
        id: s._id.toString(),
        type: 'sleep',
        timestamp: s.startTime,
        data: {
          sleepId: s.sleepId,
          startTime: s.startTime,
          endTime: s.endTime,
          duration: s.duration,
          deepSleepDuration: s.deepSleepDuration,
          lightSleepDuration: s.lightSleepDuration,
          remSleepDuration: s.remSleepDuration,
          awakeDuration: s.awakeDuration,
        },
      });
    }

    // Map Daily Activity (using end of the day or noon as timestamp representation)
    for (const d of dailyActivities) {
      items.push({
        id: d._id.toString(),
        type: 'activity',
        timestamp: new Date(d.date + 'T12:00:00Z'),
        data: {
          date: d.date,
          steps: d.steps,
          calories: d.calories,
          distance: d.distance,
          intensityMinutes: d.intensityMinutes,
          hoursActive: d.hoursActive,
        },
      });
    }

    // Sort descending by timestamp (latest first)
    return items.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * Retrieves dashboard summary cards for Steps, Active Calories, Sleep, Heart Rate, and SpO2.
   */
  async getDashboard(userId: string): Promise<DashboardSummary> {
    this.logger.log(`Fetching dashboard summary for user ${userId}`);
    const userIdObj = new Types.ObjectId(userId);

    const [latestActivity, latestSleep, latestHeart, latestSpO2] =
      await Promise.all([
        this.dailyActivityModel
          .findOne({ userId: userIdObj })
          .sort({ date: -1 })
          .lean(),
        this.sleepSessionModel
          .findOne({ userId: userIdObj })
          .sort({ startTime: -1 })
          .lean(),
        this.heartSignalModel
          .findOne({ userId: userIdObj })
          .sort({ timestamp: -1 })
          .lean(),
        this.spo2RecordModel
          .findOne({ userId: userIdObj })
          .sort({ timestamp: -1 })
          .lean(),
      ]);

    const result: DashboardSummary = {};

    if (latestActivity) {
      result.activity = {
        date: latestActivity.date,
        steps: latestActivity.steps,
        calories: latestActivity.calories,
        distance: latestActivity.distance,
        intensityMinutes: latestActivity.intensityMinutes,
        hoursActive: latestActivity.hoursActive,
      };
    }

    if (latestSleep) {
      result.sleep = {
        startTime: latestSleep.startTime,
        endTime: latestSleep.endTime,
        duration: latestSleep.duration,
        deepSleepDuration: latestSleep.deepSleepDuration,
        lightSleepDuration: latestSleep.lightSleepDuration,
        remSleepDuration: latestSleep.remSleepDuration,
        awakeDuration: latestSleep.awakeDuration,
      };
    }

    if (latestHeart) {
      result.heartRate = {
        timestamp: latestHeart.timestamp,
        heartRate: latestHeart.heartRate,
        restingHeartRate: latestHeart.restingHeartRate,
        hrv: latestHeart.hrv,
      };
    }

    if (latestSpO2) {
      result.spo2 = {
        timestamp: latestSpO2.timestamp,
        spo2: latestSpO2.spo2,
        isLowSpO2: latestSpO2.isLowSpO2,
      };
    }

    return result;
  }
}
