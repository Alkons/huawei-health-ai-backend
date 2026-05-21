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
  HuaweiSyncReasonClass,
} from '../integrations/huawei/schemas/huawei-sync-progress.schema';
import {
  HuaweiWorkoutSession,
  HuaweiWorkoutSessionDocument,
} from '../integrations/huawei/schemas/huawei-workout-session.schema';
import {
  HuaweiConnection,
  HuaweiConnectionDocument,
} from '../integrations/huawei/schemas/huawei-connection.schema';
import { HuaweiConsentCategory } from '../integrations/huawei/schemas/huawei-consent-category';
import {
  HuaweiFreshnessState,
  HuaweiCompletenessState,
  HuaweiConfidenceLevel,
  ReliabilityReport,
  CategoryReliability,
} from '../integrations/huawei/dto/huawei-reliability.types';

export interface TimelineItem {
  id: string;
  type: 'workout' | 'sleep' | 'activity';
  timestamp: Date;
  data: Record<string, any>;
}

export interface MetricReliability {
  lastUpdated?: Date;
  completenessStatus: HuaweiCompletenessState;
  guidanceHint?: string;
  isStale: boolean;
}

export interface DashboardSummary {
  activity?: {
    date: string;
    steps: number;
    calories: number;
    distance: number;
    intensityMinutes: number;
    hoursActive: number;
    reliability?: MetricReliability;
  };
  sleep?: {
    startTime: Date;
    endTime: Date;
    duration: number;
    deepSleepDuration?: number;
    lightSleepDuration?: number;
    remSleepDuration?: number;
    awakeDuration?: number;
    reliability?: MetricReliability;
  };
  heartRate?: {
    timestamp: Date;
    heartRate: number;
    restingHeartRate?: number;
    hrv?: number;
    reliability?: MetricReliability;
  };
  spo2?: {
    timestamp: Date;
    spo2: number;
    isLowSpO2?: boolean;
    reliability?: MetricReliability;
  };
}

@Injectable()
export class HealthDataService {
  private readonly logger = new Logger(HealthDataService.name);

  private readonly REASON_METADATA: Record<
    HuaweiSyncReasonClass,
    { code: string; hint: string; steps: string[] }
  > = {
    permissionNotGranted: {
      code: 'HUAWEI_PERMISSION_DENIED',
      hint: 'Consent missing. Open settings to grant permissions.',
      steps: [
        'Go to Consent settings in the app',
        'Enable access to health categories',
        'Re-authenticate with Huawei Health if prompted',
      ],
    },
    deviceUnsupported: {
      code: 'HUAWEI_DEVICE_UNSUPPORTED',
      hint: 'Metric not supported by your wearable.',
      steps: [
        'Verify wearable device compatibility',
        'Ensure HMS Core is updated on your phone',
      ],
    },
    regionLimitation: {
      code: 'HUAWEI_REGIONAL_RESTRICTION',
      hint: 'Service restricted in your account region.',
      steps: ['Check Huawei account region configuration'],
    },
    syncSettingsOff: {
      code: 'HUAWEI_SYNC_DISABLED',
      hint: 'Sync is toggled off in settings.',
      steps: ['Enable sync for this category in Consent settings'],
    },
    noDataForRange: {
      code: 'HUAWEI_NO_DATA',
      hint: 'No data recorded today on Huawei Cloud.',
      steps: [
        'Open the Huawei Health app on your phone',
        'Pull down to force sync your wearable to the cloud',
        'Wait a few minutes and refresh this screen',
      ],
    },
    ok: {
      code: 'HUAWEI_SYNC_OK',
      hint: 'Metric synced successfully.',
      steps: [],
    },
    notYetSynced: {
      code: 'HUAWEI_PENDING_FIRST_SYNC',
      hint: 'Initial sync is pending.',
      steps: ['Wait a few minutes or tap Sync Now'],
    },
  };

  private readonly CATEGORY_DISPLAY_NAMES: Record<
    HuaweiConsentCategory,
    string
  > = {
    activity: 'Activity',
    workouts: 'Workouts',
    sleep: 'Sleep',
    heartSignals: 'Heart signals',
    spo2: 'SpO2',
    selectedRecords: 'Selected records',
  };

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
    @InjectModel(HuaweiConnection.name)
    private readonly connectionModel: Model<HuaweiConnectionDocument>,
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
   * Calculates overall and per-category data freshness, completeness, confidence and guidance.
   */
  async getReliabilityReport(userId: string): Promise<ReliabilityReport> {
    this.logger.log(`Generating reliability report for user ${userId}`);
    const userIdObj = new Types.ObjectId(userId);
    const now = new Date();

    const connection = await this.connectionModel
      .findOne({ userId: userIdObj })
      .lean();

    if (!connection || connection.status !== 'connected') {
      return {
        overall: {
          freshness: 'unknown',
          completeness: 'none',
          confidence: 'low',
          guidance: {
            message:
              'Huawei Health is not connected. Connect to enable syncing and AI coaching.',
            actionSteps: [
              'Go to Device Settings',
              'Tap Connect on Huawei Health option',
            ],
          },
          isStaleBannerRequired: true,
        },
        categories: [],
      };
    }

    const enabledCategories = connection.enabledCategories ?? [];
    const syncProgresses = await this.syncProgressModel
      .find({ userId: userIdObj })
      .lean();

    const categoryReports: CategoryReliability[] = [];
    let syncedCount = 0;

    const allCategories: HuaweiConsentCategory[] = [
      'activity',
      'workouts',
      'sleep',
      'heartSignals',
      'spo2',
      'selectedRecords',
    ];

    for (const cat of allCategories) {
      const isEnabled = enabledCategories.includes(cat);
      if (!isEnabled) {
        continue;
      }

      const progress = syncProgresses.find((p) => p.category === cat);
      const status = progress?.status ?? 'pending';
      const reasonClass = progress?.reasonClass ?? 'notYetSynced';
      const explanation = progress?.explanation;
      const lastSuccessAt = progress?.lastSuccessAt;
      const lastAttemptedAt = progress?.lastAttemptedAt;

      const freshness = this.calculateFreshness(lastSuccessAt, now);
      const metadata =
        this.REASON_METADATA[reasonClass] ?? this.REASON_METADATA.notYetSynced;

      if (
        status === 'synced' &&
        (reasonClass === 'ok' || reasonClass === 'noDataForRange')
      ) {
        syncedCount++;
      }

      const isStaleBannerRequired =
        freshness === 'stale' || freshness === 'unknown' || status === 'failed';

      categoryReports.push({
        category: cat,
        displayName: this.CATEGORY_DISPLAY_NAMES[cat] ?? cat,
        status,
        lastSuccessAt,
        lastAttemptedAt,
        reasonClass,
        explanation,
        freshness,
        guidanceHint: metadata.hint,
        isStaleBannerRequired,
      });
    }

    // Determine overall completeness
    let completeness: HuaweiCompletenessState = 'none';
    if (enabledCategories.length > 0) {
      if (syncedCount === enabledCategories.length) {
        completeness = 'complete';
      } else if (syncedCount > 0) {
        completeness = 'partial';
      } else {
        completeness = 'none';
      }
    }

    // Determine overall freshness
    const overallFreshness = this.calculateFreshness(
      connection.lastSyncAt,
      now,
    );

    // Determine overall confidence
    let confidence: HuaweiConfidenceLevel;
    if (completeness === 'complete' && overallFreshness === 'fresh') {
      confidence = 'high';
    } else if (
      (completeness === 'complete' && overallFreshness === 'delayed') ||
      (completeness === 'partial' &&
        categoryReports.some(
          (c) =>
            (c.category === 'activity' || c.category === 'workouts') &&
            (c.freshness === 'fresh' || c.freshness === 'delayed'),
        ))
    ) {
      confidence = 'medium';
    } else {
      confidence = 'low';
    }

    // Determine overall guidance message
    let guidanceMessage =
      'All your data is successfully synchronized. AI coaching is optimal.';
    let actionSteps: string[] = [];

    if (completeness === 'none') {
      guidanceMessage =
        'No health data has been synchronized. AI coaching is currently disabled.';
      actionSteps = this.getSpecificActionSteps(categoryReports);
      if (actionSteps.length === 0) {
        actionSteps = [
          'Open Huawei Health app on your phone',
          'Ensure automatic synchronization is enabled',
          'Re-authenticate or check consent permissions in the app settings',
        ];
      }
    } else if (completeness === 'partial' || overallFreshness === 'stale') {
      guidanceMessage =
        'Some sync pipelines are delayed or incomplete. AI coaching insights may be limited.';
      actionSteps = this.getSpecificActionSteps(categoryReports);
      if (actionSteps.length === 0) {
        actionSteps = [
          'Open Huawei Health app to force sync with your wearable',
          'Ensure your phone has an active internet connection',
        ];
      }
    }

    const overallStaleBanner =
      overallFreshness === 'stale' ||
      overallFreshness === 'unknown' ||
      completeness !== 'complete';

    return {
      overall: {
        lastSyncAt: connection.lastSyncAt,
        freshness: overallFreshness,
        completeness,
        confidence,
        guidance: {
          message: guidanceMessage,
          actionSteps,
        },
        isStaleBannerRequired: overallStaleBanner,
      },
      categories: categoryReports,
    };
  }

  /**
   * Helper to aggregate specific action steps from category reliability reports.
   */
  private getSpecificActionSteps(
    categoryReports: CategoryReliability[],
  ): string[] {
    const stepsSet = new Set<string>();
    categoryReports
      .filter((c) => c.status === 'failed' || c.freshness === 'stale')
      .forEach((c) => {
        const meta =
          this.REASON_METADATA[c.reasonClass] ??
          this.REASON_METADATA.notYetSynced;
        meta.steps.forEach((s) => stepsSet.add(s));
      });
    return Array.from(stepsSet);
  }

  /**
   * Helper to calculate freshness state based on last success timestamp.
   */
  private calculateFreshness(
    lastSuccessAt?: Date,
    now = new Date(),
  ): HuaweiFreshnessState {
    if (!lastSuccessAt) {
      return 'unknown';
    }
    const diffMs = now.getTime() - lastSuccessAt.getTime();
    if (diffMs <= 4 * 60 * 60 * 1000) {
      return 'fresh';
    }
    if (diffMs <= 24 * 60 * 60 * 1000) {
      return 'delayed';
    }
    return 'stale';
  }

  /**
   * Helper to resolve metric reliability card info.
   */
  private async getMetricReliability(
    userIdObj: Types.ObjectId,
    category: HuaweiConsentCategory,
    connection: HuaweiConnection | null,
    lastRecordDate?: Date,
  ): Promise<MetricReliability | undefined> {
    const isEnabled = connection?.enabledCategories?.includes(category);
    if (!isEnabled) {
      return undefined;
    }

    const progress = await this.syncProgressModel
      .findOne({ userId: userIdObj, category })
      .lean();

    const status = progress?.status ?? 'pending';
    const reasonClass = progress?.reasonClass ?? 'notYetSynced';
    const lastSuccessAt = progress?.lastSuccessAt ?? lastRecordDate;

    const freshness = this.calculateFreshness(lastSuccessAt, new Date());
    const metadata =
      this.REASON_METADATA[reasonClass] ?? this.REASON_METADATA.notYetSynced;

    let completeness: HuaweiCompletenessState = 'none';
    if (status === 'synced') {
      completeness = 'complete';
    } else if (status === 'syncing') {
      completeness = 'partial';
    }

    return {
      lastUpdated: lastSuccessAt,
      completenessStatus: completeness,
      guidanceHint:
        freshness === 'stale' || status !== 'synced'
          ? metadata.hint
          : undefined,
      isStale:
        freshness === 'stale' || status === 'failed' || freshness === 'unknown',
    };
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
          lastSyncedAt: w.createdAt,
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
          lastSyncedAt: s.createdAt,
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
          lastSyncedAt: d.lastSyncedAt,
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

    const connection = await this.connectionModel
      .findOne({ userId: userIdObj })
      .lean();

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

    const isCategoryEnabled = (cat: HuaweiConsentCategory) =>
      connection?.enabledCategories?.includes(cat) ?? false;

    // 1. Activity Card
    const activityReliability = await this.getMetricReliability(
      userIdObj,
      'activity',
      connection,
      latestActivity?.lastSyncedAt,
    );
    if (latestActivity) {
      result.activity = {
        date: latestActivity.date,
        steps: latestActivity.steps,
        calories: latestActivity.calories,
        distance: latestActivity.distance,
        intensityMinutes: latestActivity.intensityMinutes,
        hoursActive: latestActivity.hoursActive,
        reliability: activityReliability,
      };
    } else if (isCategoryEnabled('activity')) {
      result.activity = {
        date: new Date().toISOString().split('T')[0],
        steps: 0,
        calories: 0,
        distance: 0,
        intensityMinutes: 0,
        hoursActive: 0,
        reliability: activityReliability,
      };
    }

    // 2. Sleep Card
    const sleepReliability = await this.getMetricReliability(
      userIdObj,
      'sleep',
      connection,
      latestSleep?.endTime,
    );
    if (latestSleep) {
      result.sleep = {
        startTime: latestSleep.startTime,
        endTime: latestSleep.endTime,
        duration: latestSleep.duration,
        deepSleepDuration: latestSleep.deepSleepDuration,
        lightSleepDuration: latestSleep.lightSleepDuration,
        remSleepDuration: latestSleep.remSleepDuration,
        awakeDuration: latestSleep.awakeDuration,
        reliability: sleepReliability,
      };
    } else if (isCategoryEnabled('sleep')) {
      result.sleep = {
        startTime: new Date(),
        endTime: new Date(),
        duration: 0,
        reliability: sleepReliability,
      };
    }

    // 3. Heart Rate Card
    const heartReliability = await this.getMetricReliability(
      userIdObj,
      'heartSignals',
      connection,
      latestHeart?.timestamp,
    );
    if (latestHeart) {
      result.heartRate = {
        timestamp: latestHeart.timestamp,
        heartRate: latestHeart.heartRate,
        restingHeartRate: latestHeart.restingHeartRate,
        hrv: latestHeart.hrv,
        reliability: heartReliability,
      };
    } else if (isCategoryEnabled('heartSignals')) {
      result.heartRate = {
        timestamp: new Date(),
        heartRate: 0,
        reliability: heartReliability,
      };
    }

    // 4. SpO2 Card
    const spo2Reliability = await this.getMetricReliability(
      userIdObj,
      'spo2',
      connection,
      latestSpO2?.timestamp,
    );
    if (latestSpO2) {
      result.spo2 = {
        timestamp: latestSpO2.timestamp,
        spo2: latestSpO2.spo2,
        isLowSpO2: latestSpO2.isLowSpO2,
        reliability: spo2Reliability,
      };
    } else if (isCategoryEnabled('spo2')) {
      result.spo2 = {
        timestamp: new Date(),
        spo2: 0,
        reliability: spo2Reliability,
      };
    }

    return result;
  }
}
