import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import {
  HealthDataService,
  TimelineItem,
} from '../health-data/health-data.service';
import {
  CoachingFeedback,
  CoachingFeedbackDocument,
} from './schemas/coaching-feedback.schema';
import { CoachingFeedbackResponseDto } from './dto/coaching-feedback.dto';

interface ActivityData {
  date: string;
  steps: number;
  calories: number;
  distance: number;
  hoursActive: number;
  spo2?: number;
  isLowSpO2?: boolean;
}

interface WorkoutData {
  activityType: string;
  startTime: Date;
  duration: number;
  calories: number;
  avgHeartRate: number;
}

interface SleepData {
  startTime: Date;
  duration: number;
  deepSleepDuration: number;
  lightSleepDuration: number;
}

interface AiCoachingResponse {
  summary: string;
  positiveSignals: string[];
  concerns: string[];
  nextActions: string[];
  followUpQuestions: string[];
  disclaimer: string;
}

@Injectable()
export class CoachingService {
  private readonly logger = new Logger(CoachingService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly healthDataService: HealthDataService,
    @InjectModel(CoachingFeedback.name)
    private readonly feedbackModel: Model<CoachingFeedbackDocument>,
  ) {}

  /**
   * Retrieves the latest cached coaching feedback for a user.
   */
  async getLatestCoachingFeedback(
    userId: string,
  ): Promise<CoachingFeedbackResponseDto | null> {
    const doc = await this.feedbackModel
      .findOne({ userId: new Types.ObjectId(userId) })
      .sort({ date: -1 })
      .lean();

    if (!doc) {
      return null;
    }
    return this.mapToDto(doc);
  }

  /**
   * Generates coaching feedback:
   * 1. Pulls data from the last 7 days.
   * 2. Assesses sync reliability / confidence level.
   * 3. Checks for low SpO2 or other safety triggers.
   * 4. Forms prompt with ONLY present synced metrics.
   * 5. Calls OpenAI endpoint with strict JSON schema format.
   * 6. Caches and returns feedback.
   */
  async generateCoachingFeedback(
    userId: string,
    targetDate: string,
  ): Promise<CoachingFeedbackResponseDto> {
    this.logger.log(
      `Starting AI coaching generation for user ${userId} on date ${targetDate}`,
    );

    const endDate = new Date(`${targetDate}T23:59:59Z`);
    const startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000); // 7 days window

    // 1. Gather User Health metrics & Sync reliability
    const reliability =
      await this.healthDataService.getReliabilityReport(userId);
    const timeline = await this.healthDataService.getTimeline(
      userId,
      startDate,
      endDate,
    );

    // 2. Identify active synced streams vs missing data
    const activeStreams = reliability.categories
      .filter((c) => c.status === 'synced' && c.reasonClass === 'ok')
      .map((c) => c.category);

    const confidence = reliability.overall.confidence;

    // 3. Inspect SpO2 safety alerts in the synced window
    const lowSpO2Record =
      timeline.find((item) => {
        if (item.type !== 'activity') return false;
        const act = item.data as unknown as ActivityData;
        return act.spo2 !== undefined && act.spo2 < 90;
      }) ||
      timeline.find((item) => {
        if (item.type !== 'activity') return false;
        const act = item.data as unknown as ActivityData;
        return act.isLowSpO2 === true;
      });
    const hasSafetyAlert = !!lowSpO2Record;

    // Hard-coded safety override: if SpO2 drops severely, bypass AI to prevent dangerous advice
    if (hasSafetyAlert) {
      return this.saveAndReturnOverride(
        userId,
        targetDate,
        confidence,
        startDate,
        endDate,
      );
    }

    // 4. Construct grounded data payload (Strictly omit metrics that didn't sync)
    const metricsPayload = this.buildGroundedPayload(timeline, activeStreams);

    // 5. Invoke the AI gateway with Structured Outputs JSON Schema
    const promptInstructions = this.buildPromptInstructions(
      confidence,
      activeStreams,
      targetDate,
    );
    const aiResponse = await this.callOpenAiCompatibleApi(
      promptInstructions,
      metricsPayload,
    );

    // 6. Cache the output in MongoDB
    const saved = await this.feedbackModel
      .findOneAndUpdate(
        { userId: new Types.ObjectId(userId), date: targetDate },
        {
          $set: {
            summary: aiResponse.summary,
            positiveSignals: aiResponse.positiveSignals,
            concerns: aiResponse.concerns,
            nextActions: aiResponse.nextActions,
            followUpQuestions: aiResponse.followUpQuestions,
            confidenceLevel: confidence,
            hasSafetyAlert: false,
            disclaimer: aiResponse.disclaimer,
            dataWindowStart: startDate,
            dataWindowEnd: endDate,
            generatedAt: new Date(),
          },
        },
        { upsert: true, new: true },
      )
      .exec();

    if (!saved) {
      throw new Error('Failed to save coaching feedback');
    }

    return this.mapToDto(saved);
  }

  private buildGroundedPayload(
    timeline: TimelineItem[],
    activeStreams: string[],
  ): Record<string, unknown> {
    const payload: Record<string, unknown> = {};

    if (activeStreams.includes('activity')) {
      const activities = timeline.filter((t) => t.type === 'activity');
      payload.activity = activities.map((a) => {
        const act = a.data as unknown as ActivityData;
        return {
          date: act.date,
          steps: act.steps,
          calories: act.calories,
          distance: act.distance,
          hoursActive: act.hoursActive,
        };
      });
    }

    if (activeStreams.includes('workouts')) {
      const workouts = timeline.filter((t) => t.type === 'workout');
      payload.workouts = workouts.map((w) => {
        const wrk = w.data as unknown as WorkoutData;
        return {
          activityType: wrk.activityType,
          startTime: wrk.startTime,
          durationSeconds: wrk.duration,
          calories: wrk.calories,
          avgHeartRate: wrk.avgHeartRate,
        };
      });
    }

    if (activeStreams.includes('sleep')) {
      const sleep = timeline.filter((t) => t.type === 'sleep');
      payload.sleep = sleep.map((s) => {
        const slp = s.data as unknown as SleepData;
        return {
          startTime: slp.startTime,
          durationMinutes: slp.duration,
          deepSleepMinutes: slp.deepSleepDuration,
          lightSleepMinutes: slp.lightSleepDuration,
        };
      });
    }

    return payload;
  }

  private buildPromptInstructions(
    confidence: string,
    activeStreams: string[],
    targetDate: string,
  ): string {
    const streamNotes =
      activeStreams.length > 0
        ? `The user has successfully synchronized data for the following categories: ${activeStreams.join(', ')}.`
        : `The user has no synced health data available.`;

    const confidenceNotes =
      confidence === 'low'
        ? `WARNING: The data sync confidence is LOW. You MUST acknowledge that data is incomplete, avoid definitive statements, suggest the user sync their Huawei Health app or verify device connections, and focus follow-up questions on data recovery.`
        : `Data confidence is ${confidence}. Provide helpful wellness insights.`;

    return `
You are a highly qualified personal wellness and athletic coaching assistant.
Your goal is to provide helpful, encouraging daily feedback based on the user's synced Huawei Health data.

CRITICAL RULES:
1. GROUNDING RULE: You must ONLY reference metrics and activities that are present in the provided user data payload. Never hallucinate or mention categories that have not synced or are missing (e.g. if sleep is not in active categories, do not say "make sure you sleep well").
2. SCOPE RULE: You are NOT a doctor. You must never diagnose, treat, or suggest medical conditions. Keep suggestions focused strictly on wellness, consistency, training load adjustment, and simple recovery habits.
3. DISCLAIMER RULE: You must include a standard non-medical disclaimer in the "disclaimer" field.
4. CONFIDENCE HANDLING: ${confidenceNotes}
5. ACTIVE STREAMS: ${streamNotes}
6. TARGET DATE: The coaching date is ${targetDate}.
    `;
  }

  private async callOpenAiCompatibleApi(
    systemPrompt: string,
    dataPayload: Record<string, unknown>,
  ): Promise<AiCoachingResponse> {
    const apiKey = this.configService.get<string>('app.ai.providerApiKey');
    const baseUrl = this.configService.get<string>('app.ai.providerBaseUrl');
    const model = this.configService.get<string>('app.ai.model');

    if (!apiKey) {
      this.logger.warn(
        'AI provider API key is not configured. Falling back to default baseline template.',
      );
      return this.getDefaultFallbackResponse();
    }

    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            {
              role: 'user',
              content: `Here is my health and training data from the last 7 days: ${JSON.stringify(dataPayload)}`,
            },
          ],
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'coaching_feedback',
              strict: true,
              schema: {
                type: 'object',
                properties: {
                  summary: { type: 'string' },
                  positiveSignals: { type: 'array', items: { type: 'string' } },
                  concerns: { type: 'array', items: { type: 'string' } },
                  nextActions: { type: 'array', items: { type: 'string' } },
                  followUpQuestions: {
                    type: 'array',
                    items: { type: 'string' },
                  },
                  disclaimer: { type: 'string' },
                },
                required: [
                  'summary',
                  'positiveSignals',
                  'concerns',
                  'nextActions',
                  'followUpQuestions',
                  'disclaimer',
                ],
                additionalProperties: false,
              },
            },
          },
          temperature: 0.3,
        }),
      });

      if (!response.ok) {
        throw new Error(
          `AI API error: HTTP ${response.status} - ${await response.text()}`,
        );
      }

      const rawJson = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const rawText = rawJson.choices?.[0]?.message?.content;
      if (!rawText) {
        throw new Error('AI response content is missing');
      }
      return JSON.parse(rawText) as AiCoachingResponse;
    } catch (err) {
      this.logger.error(
        'Failed to communicate with AI provider, using baseline fallback.',
        err,
      );
      return this.getDefaultFallbackResponse();
    }
  }

  private saveAndReturnOverride(
    userId: string,
    targetDate: string,
    confidence: 'high' | 'medium' | 'low',
    start: Date,
    end: Date,
  ): CoachingFeedbackResponseDto {
    const override = {
      summary:
        'Potential physiological abnormality detected in synced logs. Coaching suggestions are temporarily paused.',
      positiveSignals: [],
      concerns: ['Low SpO2 record exists in your recent telemetry history.'],
      nextActions: [
        'Prioritize rest and seek professional medical guidance if you feel unwell.',
      ],
      followUpQuestions: [],
      confidenceLevel: confidence,
      hasSafetyAlert: true,
      disclaimer:
        'This feedback is for general wellness only. Low SpO2 requires attention from qualified medical professionals.',
      date: targetDate,
    };

    // Save async in DB to prevent loss
    this.feedbackModel
      .findOneAndUpdate(
        { userId: new Types.ObjectId(userId), date: targetDate },
        {
          $set: {
            ...override,
            userId: new Types.ObjectId(userId),
            dataWindowStart: start,
            dataWindowEnd: end,
          },
        },
        { upsert: true },
      )
      .exec()
      .catch((err) =>
        this.logger.error('Failed to save override caching', err),
      );

    return override;
  }

  private getDefaultFallbackResponse(): AiCoachingResponse {
    return {
      summary:
        'Data synchronization in progress. We are preparing your personalized coaching insight.',
      positiveSignals: [],
      concerns: ['Synchronization pipeline is building a history baseline.'],
      nextActions: [
        'Wear your Huawei device consistently',
        'Trigger manual sync in the app to feed your coaching profile',
      ],
      followUpQuestions: ['Are your device permissions fully granted?'],
      disclaimer:
        'This application provides coaching insights based on synchronized wellness indicators. It does not replace medical advice.',
    };
  }

  private mapToDto(doc: CoachingFeedback): CoachingFeedbackResponseDto {
    return {
      summary: doc.summary,
      positiveSignals: doc.positiveSignals,
      concerns: doc.concerns,
      nextActions: doc.nextActions,
      followUpQuestions: doc.followUpQuestions,
      confidenceLevel: doc.confidenceLevel,
      hasSafetyAlert: doc.hasSafetyAlert,
      disclaimer: doc.disclaimer,
      date: doc.date,
    };
  }
}
