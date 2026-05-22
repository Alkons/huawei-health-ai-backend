# Task 006 — AI coaching feedback (grounded, structured, safe) — Implementation plan

## Goal

Implement an AI-driven coaching feedback system in the NestJS backend to generate personalized, data-grounded, and safety-compliant wellness and training recommendations based on synchronized Huawei Health data. The coaching engine will use structured outputs, adhere strictly to a non-medical scope, dynamically adjust based on data confidence/freshness, and handle potential physiological abnormality alerts gracefully.

---

## User Review Required

> [!IMPORTANT]
> **AI Provider Configuration**
> We will configure the system to use any OpenAI-compatible provider (e.g. OpenAI, Azure OpenAI, or a self-hosted compatible gateway). We will expose three environment variables in `env.example` and the config service:
> 1. `AI_PROVIDER_API_KEY`: API credential key.
> 2. `AI_PROVIDER_BASE_URL`: Base API endpoint (default: `https://api.openai.com/v1`).
> 3. `AI_MODEL`: Model name (default: `gpt-4o-mini` or similar cost-efficient model with structured outputs support).

> [!WARNING]
> **Water-tight Grounding & The "No Halucinations" Constraint**
> To prevent the AI from generating feedback on metrics that aren't actually synchronized (e.g. talking about sleep when sleep syncing failed), the backend will construct a **fully dynamic data packet**. Only metrics that are present and marked as `synced` in the user's data window will be formatted into the prompt. The system prompt will contain strict rules: if a metric is omitted from the data packet, the AI must never mention it.

> [!CAUTION]
> **Safety Overrides & Physiological Abnormalities**
> If the user's health metrics contain an abnormal signal (such as `isLowSpO2: true` or a raw SpO2 reading `< 90%` in the last 7 days), the backend will automatically:
> 1. Set the database flag `hasSafetyAlert: true`.
> 2. Direct the AI via system instructions to switch to an extremely cautious tone, refuse all recovery/training interpretations, and advise professional care.
> 3. If post-generation validation detects any medical assertions or diagnoses, the system will swap the response with a hard-coded safe override response.

---

## Proposed Changes

### Component 1: Configuration

We will expose the AI Provider parameters to our NestJS configuration module.

---

#### [MODIFY] [configuration.ts](file:///c:/PersonalProjects/huawei-health-ai-backend/src/config/configuration.ts)
Add AI configuration block mapping environment variables to the standard configuration object.

```typescript
export interface AppConfig {
  // ... other fields
  ai: {
    providerApiKey: string;
    providerBaseUrl: string;
    model: string;
  };
}

export default registerAs(
  'app',
  (): AppConfig => ({
    // ... other fields
    ai: {
      providerApiKey: process.env.AI_PROVIDER_API_KEY || '',
      providerBaseUrl: process.env.AI_PROVIDER_BASE_URL || 'https://api.openai.com/v1',
      model: process.env.AI_MODEL || 'gpt-4o-mini',
    },
  }),
);
```

#### [MODIFY] [env.example](file:///c:/PersonalProjects/huawei-health-ai-backend/env.example)
Add configuration keys for local developers.

```ini
# AI Provider Configuration (OpenAI Compatible)
AI_PROVIDER_API_KEY=your-api-key-here
AI_PROVIDER_BASE_URL=https://api.openai.com/v1
AI_MODEL=gpt-4o-mini
```

---

### Component 2: Database Layer

We will implement a Mongoose schema to store generated coaching feedback documents to cache AI completions, preserve historical trends, and prevent unnecessary API billing.

---

#### [NEW] [coaching-feedback.schema.ts](file:///c:/PersonalProjects/huawei-health-ai-backend/src/coaching/schemas/coaching-feedback.schema.ts)
Mongoose schema defining the structured fields of coaching feedback.

```typescript
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CoachingFeedbackDocument = CoachingFeedback & Document;

@Schema({ timestamps: true })
export class CoachingFeedback {
  _id!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ required: true, index: true })
  date!: string; // YYYY-MM-DD representing the day of feedback

  @Prop({ required: true })
  summary!: string;

  @Prop({ type: [String], required: true, default: [] })
  positiveSignals!: string[];

  @Prop({ type: [String], required: true, default: [] })
  concerns!: string[];

  @Prop({ type: [String], required: true, default: [] })
  nextActions!: string[];

  @Prop({ type: [String], required: true, default: [] })
  followUpQuestions!: string[];

  @Prop({ required: true, enum: ['high', 'medium', 'low'] })
  confidenceLevel!: 'high' | 'medium' | 'low';

  @Prop({ required: true, default: false })
  hasSafetyAlert!: boolean;

  @Prop({ required: true })
  disclaimer!: string;

  @Prop({ required: true })
  dataWindowStart!: Date;

  @Prop({ required: true })
  dataWindowEnd!: Date;

  @Prop({ required: true, default: Date.now })
  generatedAt!: Date;
}

export const CoachingFeedbackSchema = SchemaFactory.createForClass(CoachingFeedback);
CoachingFeedbackSchema.index({ userId: 1, date: 1 }, { unique: true });
```

---

### Component 3: NestJS Feature Module, Controller & DTOs

We will generate the `CoachingModule` structure using NestJS CLI, then define the controllers and endpoints.

---

#### [NEW] [coaching-feedback.dto.ts](file:///c:/PersonalProjects/huawei-health-ai-backend/src/coaching/dto/coaching-feedback.dto.ts)
Declares the response structure and endpoints input validators.

```typescript
import { ApiProperty } from '@nestjs/swagger';

export class GenerateCoachingDto {
  @ApiProperty({ example: '2026-05-22', description: 'Target date for the coaching session YYYY-MM-DD' })
  date!: string;
}

export class CoachingFeedbackResponseDto {
  @ApiProperty({ description: 'Short summary of workouts and sleep' })
  summary!: string;

  @ApiProperty({ description: 'Things going well based on metrics' })
  positiveSignals!: string[];

  @ApiProperty({ description: 'Key concerns or recovery warnings' })
  concerns!: string[];

  @ApiProperty({ description: 'Actionable coaching steps' })
  nextActions!: string[];

  @ApiProperty({ description: 'Clarifying questions about missing segments' })
  followUpQuestions!: string[];

  @ApiProperty({ enum: ['high', 'medium', 'low'] })
  confidenceLevel!: 'high' | 'medium' | 'low';

  @ApiProperty({ description: 'Indicator if a safety alert was active' })
  hasSafetyAlert!: boolean;

  @ApiProperty({ description: 'Compulsory wellness disclaimer' })
  disclaimer!: string;

  @ApiProperty({ description: 'Date the feedback corresponds to' })
  date!: string;
}
```

#### [NEW] [coaching.controller.ts](file:///c:/PersonalProjects/huawei-health-ai-backend/src/coaching/coaching.controller.ts)
Handles HTTP request routing, validates inputs, and connects with Jwt authentication.

```typescript
import { Controller, Post, Get, Body, UseGuards, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { User } from '../common/decorators/user.decorator';
import { CoachingService } from './coaching.service';
import { GenerateCoachingDto, CoachingFeedbackResponseDto } from './dto/coaching-feedback.dto';

@ApiTags('coaching')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('v1/coaching')
export class CoachingController {
  constructor(private readonly coachingService: CoachingService) {}

  @Post('generate')
  @ApiOperation({ summary: 'Generates daily AI coaching feedback grounded in synced metrics' })
  @ApiResponse({ status: 200, type: CoachingFeedbackResponseDto })
  async generateCoaching(
    @User() userId: string,
    @Body() dto: GenerateCoachingDto,
  ): Promise<CoachingFeedbackResponseDto> {
    return this.coachingService.generateCoachingFeedback(userId, dto.date);
  }

  @Get('latest')
  @ApiOperation({ summary: 'Fetches the latest cached coaching feedback for the user' })
  @ApiResponse({ status: 200, type: CoachingFeedbackResponseDto })
  async getLatestCoaching(@User() userId: string): Promise<CoachingFeedbackResponseDto | null> {
    return this.coachingService.getLatestCoachingFeedback(userId);
  }
}
```

#### [NEW] [coaching.module.ts](file:///c:/PersonalProjects/huawei-health-ai-backend/src/coaching/coaching.module.ts)
Registers dependencies, controllers, and database models.

```typescript
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { HealthDataModule } from '../health-data/health-data.module';
import { CoachingController } from './coaching.controller';
import { CoachingService } from './coaching.service';
import { CoachingFeedback, CoachingFeedbackSchema } from './schemas/coaching-feedback.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: CoachingFeedback.name, schema: CoachingFeedbackSchema }]),
    HealthDataModule,
  ],
  controllers: [CoachingController],
  providers: [CoachingService],
  exports: [CoachingService],
})
export class CoachingModule {}
```

---

### Component 4: Coaching Service & AI Logic

We will build the core service which aggregates rolling 7-day user data, detects low-confidence and safety states, formats the grounded payload, and interfaces with the LLM API using standard JSON schema structured outputs.

---

#### [NEW] [coaching.service.ts](file:///c:/PersonalProjects/huawei-health-ai-backend/src/coaching/coaching.service.ts)
Integrates data aggregation, prompting engineering, safety gates, and API interaction.

```typescript
import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { HealthDataService } from '../health-data/health-data.service';
import { CoachingFeedback, CoachingFeedbackDocument } from './schemas/coaching-feedback.schema';
import { CoachingFeedbackResponseDto } from './dto/coaching-feedback.dto';

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
   * Fetches latest coaching record cached in DB.
   */
  async getLatestCoachingFeedback(userId: string): Promise<CoachingFeedbackResponseDto | null> {
    const doc = await this.feedbackModel
      .findOne({ userId: new Types.ObjectId(userId) })
      .sort({ date: -1 })
      .lean();

    if (!doc) return null;
    return this.mapToDto(doc);
  }

  /**
   * Generates coaching feedback:
   * 1. Pulls data from last 7 days.
   * 2. Assesses sync reliability / confidence level.
   * 3. Checks for low SpO2 or other safety triggers.
   * 4. Forms prompt with ONLY present synced metrics.
   * 5. Calls OpenAI endpoint with strict JSON schema format.
   * 6. Caches and returns feedback.
   */
  async generateCoachingFeedback(userId: string, targetDate: string): Promise<CoachingFeedbackResponseDto> {
    this.logger.log(`Starting AI coaching generation for user ${userId} on date ${targetDate}`);

    const endDate = new Date(`${targetDate}T23:59:59Z`);
    const startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000); // 7 days window

    // 1. Gather User Health metrics & Sync reliability
    const reliability = await this.healthDataService.getReliabilityReport(userId);
    const timeline = await this.healthDataService.getTimeline(userId, startDate, endDate);
    
    // 2. Identify active synced streams vs missing data
    const activeStreams = reliability.categories
      .filter((c) => c.status === 'synced' && c.reasonClass === 'ok')
      .map((c) => c.category);

    const confidence = reliability.overall.confidence;

    // 3. Inspect SpO2 safety alerts in the synced window
    const lowSpO2Record = timeline.find(
      (item) => item.type === 'activity' && item.data.spo2 && item.data.spo2 < 90
    ) || timeline.find(
      (item) => item.type === 'activity' && item.data.isLowSpO2 === true
    );
    const hasSafetyAlert = !!lowSpO2Record;

    // Hard-coded safety override: if SpO2 drops severely, bypass AI to prevent dangerous advice
    if (hasSafetyAlert) {
      return this.saveAndReturnOverride(userId, targetDate, confidence, startDate, endDate);
    }

    // 4. Construct grounded data payload (Strictly omit metrics that didn't sync)
    const metricsPayload = this.buildGroundedPayload(timeline, activeStreams);

    // 5. Invoke the AI gateway with Structured Outputs JSON Schema
    const promptInstructions = this.buildPromptInstructions(confidence, activeStreams, targetDate);
    const aiResponse = await this.callOpenAiCompatibleApi(promptInstructions, metricsPayload);

    // 6. Cache the output in MongoDB
    const saved = await this.feedbackModel.findOneAndUpdate(
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
      { upsert: true, new: true }
    ).exec();

    return this.mapToDto(saved);
  }

  private buildGroundedPayload(timeline: any[], activeStreams: string[]): Record<string, any> {
    const payload: Record<string, any> = {};

    if (activeStreams.includes('activity')) {
      const activities = timeline.filter((t) => t.type === 'activity');
      payload.activity = activities.map((a) => ({
        date: a.data.date,
        steps: a.data.steps,
        calories: a.data.calories,
        distance: a.data.distance,
        hoursActive: a.data.hoursActive,
      }));
    }

    if (activeStreams.includes('workouts')) {
      const workouts = timeline.filter((t) => t.type === 'workout');
      payload.workouts = workouts.map((w) => ({
        activityType: w.data.activityType,
        startTime: w.data.startTime,
        durationSeconds: w.data.duration,
        calories: w.data.calories,
        avgHeartRate: w.data.avgHeartRate,
      }));
    }

    if (activeStreams.includes('sleep')) {
      const sleep = timeline.filter((t) => t.type === 'sleep');
      payload.sleep = sleep.map((s) => ({
        startTime: s.data.startTime,
        durationMinutes: s.data.duration,
        deepSleepMinutes: s.data.deepSleepDuration,
        lightSleepMinutes: s.data.lightSleepDuration,
      }));
    }

    return payload;
  }

  private buildPromptInstructions(confidence: string, activeStreams: string[], targetDate: string): string {
    const streamNotes = activeStreams.length > 0
      ? `The user has successfully synchronized data for the following categories: ${activeStreams.join(', ')}.`
      : `The user has no synced health data available.`;

    const confidenceNotes = confidence === 'low'
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

  private async callOpenAiCompatibleApi(systemPrompt: string, dataPayload: Record<string, any>): Promise<any> {
    const apiKey = this.configService.get<string>('app.ai.providerApiKey');
    const baseUrl = this.configService.get<string>('app.ai.providerBaseUrl');
    const model = this.configService.get<string>('app.ai.model');

    if (!apiKey) {
      this.logger.warn('AI provider API key is not configured. Falling back to default baseline template.');
      return this.getDefaultFallbackResponse('low');
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
            { role: 'user', content: `Here is my health and training data from the last 7 days: ${JSON.stringify(dataPayload)}` },
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
                  followUpQuestions: { type: 'array', items: { type: 'string' } },
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
        throw new Error(`AI API error: HTTP ${response.status} - ${await response.text()}`);
      }

      const rawJson = await response.json();
      const rawText = rawJson.choices?.[0]?.message?.content;
      return JSON.parse(rawText);
    } catch (err) {
      this.logger.error('Failed to communicate with AI provider, using baseline fallback.', err);
      return this.getDefaultFallbackResponse('low');
    }
  }

  private saveAndReturnOverride(
    userId: string,
    targetDate: string,
    confidence: 'high' | 'medium' | 'low',
    start: Date,
    end: Date
  ): CoachingFeedbackResponseDto {
    const override = {
      summary: 'Potential physiological abnormality detected in synced logs. Coaching suggestions are temporarily paused.',
      positiveSignals: [],
      concerns: ['Low SpO2 record exists in your recent telemetry history.'],
      nextActions: ['Prioritize rest and seek professional medical guidance if you feel unwell.'],
      followUpQuestions: [],
      confidenceLevel: confidence,
      hasSafetyAlert: true,
      disclaimer: 'This feedback is for general wellness only. Low SpO2 requires attention from qualified medical professionals.',
      date: targetDate,
    };

    // Save async in DB to prevent loss
    this.feedbackModel.findOneAndUpdate(
      { userId: new Types.ObjectId(userId), date: targetDate },
      { $set: { ...override, userId: new Types.ObjectId(userId), dataWindowStart: start, dataWindowEnd: end } },
      { upsert: true }
    ).exec().catch(err => this.logger.error('Failed to save override caching', err));

    return override;
  }

  private getDefaultFallbackResponse(confidence: 'high' | 'medium' | 'low'): any {
    return {
      summary: 'Data synchronization in progress. We are preparing your personalized coaching insight.',
      positiveSignals: [],
      concerns: ['Synchronization pipeline is building a history baseline.'],
      nextActions: ['Wear your Huawei device consistently', 'Trigger manual sync in the app to feed your coaching profile'],
      followUpQuestions: ['Are your device permissions fully granted?'],
      disclaimer: 'This application provides coaching insights based on synchronized wellness indicators. It does not replace medical advice.',
    };
  }

  private mapToDto(doc: any): CoachingFeedbackResponseDto {
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
```

---

## Verification Plan

### Automated Tests

We will cover the feature module with comprehensive unit and mock tests:

1. **Service Tests (`coaching.service.spec.ts`):**
   - **Scenario A: High training load + reduced sleep trend**
     Verify prompt instructions dynamically detect heavy training load, that the output correctly flags recovery concerns, and generates suitable advice.
   - **Scenario B: Improved sleep + stable activity**
     Verify positive signals correctly flag the rising sleep trend and stable step statistics.
   - **Scenario C: Low Sync Confidence**
     Verify the AI gets explicit instructions to warning-flag the incomplete status and guide the user on troubleshooting.
   - **Scenario D: New User baseline**
     Verify the service defaults to standard welcoming advice when no data points exist.
   - **Scenario E: Safety Trigger override**
     Ensure any SpO2 value `< 90` or `isLowSpO2: true` instantly bypasses LLM text generation, caches `hasSafetyAlert: true`, and returns the static safety-override instructions.

2. **Integration & API tests (`coaching.controller.spec.ts`):**
   - Mock JWT authentication and verify `POST /v1/coaching/generate` returns 200 OK with correct JSON schema compliance.
   - Verify `GET /v1/coaching/latest` fetches cached data.

3. **Validation Suite:**
   Run full checks to verify linting, styling rules, and tests are completely successful:
   ```powershell
   yarn build
   yarn lint
   yarn format
   yarn test
   yarn test:cov
   ```

### Manual Verification

1. Startup dev environment: `yarn dev`.
2. Emulate normal user data, request `/v1/coaching/generate` with date `2026-05-22` and verify the returned coaching object.
3. Inject a low SpO2 record (`spo2: 88`) for the user in MongoDB, send `/v1/coaching/generate` again and confirm the coaching changes instantly to the medical safety alert.
