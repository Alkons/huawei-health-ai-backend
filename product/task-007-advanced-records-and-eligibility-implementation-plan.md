# Task 007 — Advanced health records & eligibility — Implementation plan

## Goal

Extend the platform beyond core MVP metrics by adding support for advanced health record categories (e.g., sleep breathing records, tachycardia/bradycardia alerts, ambulatory blood pressure monitoring (ABPM) reports, high body temperature logs, VO2 Max, and running form dynamics). To ensure maximum compliance and production readiness, we will integrate **real Huawei Health Kit REST APIs** and completely remove all simulated mocks. 

Furthermore, we will optimize and orient the system specifically for the **RU (Russia) region**, where Huawei Health services are fully active and regulatory permissions for blood pressure (ABPM) and advanced TruSleep sleep-breathing analysis are clear and accessible. We will build a dynamic, data-driven eligibility engine that automatically discovers hardware capabilities by querying the user's real registered data collectors and region profile.

---

## User Review Required

> [!IMPORTANT]
> **Production-Grade Real REST Endpoints**
> Rather than simulating telemetry through client mocks, we will implement direct REST connectors to the real Huawei Health Kit v2 endpoints.
> * **Sleep Breathing Quality:** `GET /healthkit/v2/healthRecords?type=com.huawei.health.record.sleep_breathing`
> * **Tachycardia & Bradycardia Alerts:** `GET /healthkit/v2/healthRecords?type=com.huawei.health.record.tachycardia` and `com.huawei.health.record.bradycardia`
> * **Ambulatory Blood Pressure Monitoring (ABPM):** `GET /healthkit/v2/healthRecords?type=com.huawei.health.record.abpm`
> * **High Body Temperature (Skin Temperature):** `GET /healthkit/v2/samplingDatasets/com.huawei.continuous.skin_temperature`
> * **VO2 Max & Aerobic Capacity:** `GET /healthkit/v2/samplingDatasets/com.huawei.instant.vo2max`
> * **Running Form Dynamics:** `GET /healthkit/v2/samplingDatasets/com.huawei.instant.running_form`

> [!WARNING]
> **Dynamic Device & Capability Discovery (Zero Mocks)**
> To get rid of all simulated device capability profiles, we will discover linked wearables and active sensors dynamically by querying:
> `GET /healthkit/v2/dataCollectors`
> This endpoint lists all registered data sources for the user. We will parse this real list: if a data collector exists for a specific datatype (e.g. `com.huawei.continuous.skin_temperature`), it proves that a compatible device (like a temperature-capable smartwatch) is linked and active. This eliminates hardcoded capability lists!

> [!CAUTION]
> **RU Region Optimization**
> We will configure the eligibility engine to retrieve the user's country code dynamically by querying:
> `GET /healthkit/v2/user`
> If the user's region is `RU`, the eligibility service will grant full access to advanced telemetry streams (such as ABPM and Sleep Breathing), which are heavily supported in the RU market, while enforcing relevant developer tier consents.

---

## Proposed Changes

We will group our implementation into three clear layers:
1. **Database Schema Enhancements** (modifying `HuaweiConnection` and creating the new `HuaweiAdvancedRecord` schema).
2. **Eligibility Engine and REST Client Extensions** (implementing real REST queries for advanced categories and dynamic device capabilities).
3. **Controller & Routing Layer** (adding REST endpoints and DTOs).

---

### Component 1: Database & Config Enhancements

We will update our configuration definition, extend the existing connection schema to track real regional settings and linked watch capabilities, and introduce the new unified advanced records collection.

---

#### [MODIFY] [configuration.ts](file:///c:/PersonalProjects/huawei-health-ai-backend/src/config/configuration.ts)
Add `developerTier` to the configuration definition to govern enterprise-level features.

```typescript
export interface AppConfig {
  // ... existing fields
  huawei: {
    // ... existing fields
    developerTier: 'individual' | 'enterprise';
  };
}
```

#### [MODIFY] [env.example](file:///c:/PersonalProjects/huawei-health-ai-backend/env.example)
Expose the developer tier configuration variable.

```ini
# Huawei Developer Tier Configuration ('individual' or 'enterprise')
HUAWEI_DEVELOPER_TIER=enterprise
```

#### [MODIFY] [huawei-connection.schema.ts](file:///c:/PersonalProjects/huawei-health-ai-backend/src/integrations/huawei/schemas/huawei-connection.schema.ts)
Add `region` and `linkedDevices` to track real hardware capability eligibility.

```typescript
export interface HuaweiLinkedDevice {
  deviceId: string;
  modelName: string;
  capabilities: Array<
    | 'heartRate'
    | 'sleep'
    | 'spo2'
    | 'temperature'
    | 'abpm'
    | 'runningForm'
    | 'breathing'
  >;
}

// ... inside HuaweiConnection class:
  @Prop({ required: false, default: 'RU' })
  region!: string;

  @Prop({ type: [Object], required: true, default: [] })
  linkedDevices!: HuaweiLinkedDevice[];
```

#### [NEW] [huawei-advanced-record.schema.ts](file:///c:/PersonalProjects/huawei-health-ai-backend/src/integrations/huawei/schemas/huawei-advanced-record.schema.ts)
Create a new, high-performance unified schema for advanced record logs.

```typescript
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { HuaweiUserBoundSchema } from './huawei-user-bound.schema';

export type HuaweiAdvancedRecordDocument = HuaweiAdvancedRecord & Document;

@Schema({ timestamps: true })
export class HuaweiAdvancedRecord extends HuaweiUserBoundSchema {
  _id!: Types.ObjectId;

  @Prop({ required: true, index: true })
  recordType!: string; // 'sleepBreathing' | 'cardiacAlerts' | 'abpm' | 'skinTemperature' | 'vo2Max' | 'runningForm'

  @Prop({ required: true, index: true })
  timestamp!: Date;

  @Prop({ type: Object, required: true })
  data!: Record<string, any>;

  @Prop({ type: Object, required: false })
  rawPayload?: Record<string, any>;
}

export const HuaweiAdvancedRecordSchema = SchemaFactory.createForClass(HuaweiAdvancedRecord);
HuaweiAdvancedRecordSchema.index({ userId: 1, recordType: 1, timestamp: -1 });
```

---

### Component 2: Eligibility & REST Client Logic

We will build the core eligibility computation logic and extend the real REST client service to fetch advanced telemetry streams and registered data collectors.

---

#### [NEW] [huawei-eligibility.service.ts](file:///c:/PersonalProjects/huawei-health-ai-backend/src/integrations/huawei/huawei-eligibility.service.ts)
Dedicated logic class implementing the eligibility rules, reasons taxonomy, and actionable next steps.

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HuaweiConnection } from './schemas/huawei-connection.schema';

export type EligibilityStatus = 'eligible' | 'notEligible' | 'actionRequired';

export type EligibilityReason =
  | 'eligible'
  | 'missingPermission'
  | 'missingDevice'
  | 'regionRestriction'
  | 'developerTierRestriction';

export interface AdvancedRecordMeta {
  recordType: string;
  displayName: string;
  description: string;
  requiredScope: string;
  requiredDataType: string;
}

export interface EligibilityReport {
  recordType: string;
  displayName: string;
  description: string;
  status: EligibilityStatus;
  reason: EligibilityReason;
  explanation: string;
  nextSteps: string[];
}

@Injectable()
export class HuaweiEligibilityService {
  private readonly logger = new Logger(HuaweiEligibilityService.name);

  private readonly ADVANCED_CATALOG: AdvancedRecordMeta[] = [
    {
      recordType: 'sleepBreathing',
      displayName: 'Sleep Breathing Quality',
      description: 'Tracks sleep breathing pauses and ventilation quality indicators.',
      requiredScope: 'HEALTHKIT_PULMONARY_READ',
      requiredDataType: 'com.huawei.health.record.sleep_breathing',
    },
    {
      recordType: 'cardiacAlerts',
      displayName: 'Tachycardia & Bradycardia Alerts',
      description: 'Flag anomalous heart rhythm spikes and drops outside normal limits.',
      requiredScope: 'HEALTHKIT_HEARTRATE_READ',
      requiredDataType: 'com.huawei.health.record.tachycardia',
    },
    {
      recordType: 'abpm',
      displayName: 'Ambulatory Blood Pressure Monitoring',
      description: '24-hour interval blood pressure logs for chronic cardiovascular tracking.',
      requiredScope: 'HEALTHKIT_BLOODPRESSURE_READ',
      requiredDataType: 'com.huawei.health.record.abpm',
    },
    {
      recordType: 'skinTemperature',
      displayName: 'High Body Temperature Logs',
      description: 'Tracks skin temperature anomalies and fever thresholds.',
      requiredScope: 'HEALTHKIT_PULMONARY_READ',
      requiredDataType: 'com.huawei.continuous.skin_temperature',
    },
    {
      recordType: 'vo2Max',
      displayName: 'VO2 Max & Aerobic Capacity',
      description: 'Measures maximal oxygen consumption during structured outdoor activities.',
      requiredScope: 'HEALTHKIT_ACTIVITY_RECORD_READ',
      requiredDataType: 'com.huawei.instant.vo2max',
    },
    {
      recordType: 'runningForm',
      displayName: 'Running Form Dynamics',
      description: 'Analyzes stance time, flight time, vertical oscillation, and ground impact balance.',
      requiredScope: 'HEALTHKIT_ACTIVITY_RECORD_READ',
      requiredDataType: 'com.huawei.instant.running_form',
    },
  ];

  constructor(private readonly configService: ConfigService) {}

  /**
   * Evaluates eligibility for all catalog items based on user's connection profile, scopes, devices, and region.
   */
  evaluateEligibility(connection: HuaweiConnection | null, registeredDataTypes: string[]): EligibilityReport[] {
    const reports: EligibilityReport[] = [];
    const devTier = this.configService.get<string>('HUAWEI_DEVELOPER_TIER') || 'individual';

    for (const record of this.ADVANCED_CATALOG) {
      reports.push(this.checkItemEligibility(record, connection, registeredDataTypes, devTier));
    }

    return reports;
  }

  private checkItemEligibility(
    meta: AdvancedRecordMeta,
    conn: HuaweiConnection | null,
    registeredDataTypes: string[],
    devTier: string,
  ): EligibilityReport {
    // 1. Not connected state
    if (!conn || conn.status !== 'connected') {
      return {
        ...meta,
        status: 'actionRequired',
        reason: 'missingPermission',
        explanation: 'Huawei Account is not linked to your profile.',
        nextSteps: ['Connect your Huawei Health account under account settings.'],
      };
    }

    // 2. Developer Tier Restriction Check
    if (devTier === 'individual' && ['sleepBreathing', 'cardiacAlerts', 'abpm'].includes(meta.recordType)) {
      return {
        ...meta,
        status: 'notEligible',
        reason: 'developerTierRestriction',
        explanation: 'This analysis requires enterprise-level developer registration from the application host.',
        nextSteps: ['No immediate action. Enterprise clearance is pending for this application tier.'],
      };
    }

    // 3. Regional Restriction Check (Note: RU region has full support for all advanced metrics)
    const activeRegion = conn.region || 'RU';
    if (meta.recordType === 'abpm' && activeRegion === 'US') {
      return {
        ...meta,
        status: 'notEligible',
        reason: 'regionRestriction',
        explanation: 'Blood pressure reports are restricted in your region due to local regulatory compliance policies.',
        nextSteps: ['Verify if your Huawei ID account region is configured correctly.'],
      };
    }

    // 4. Missing Permission Check
    const hasScope = conn.grantedScopes.includes(meta.requiredScope);
    if (!hasScope) {
      return {
        ...meta,
        status: 'actionRequired',
        reason: 'missingPermission',
        explanation: `Scope ${meta.requiredScope} was not granted during authorization.`,
        nextSteps: [`Re-authorize your connection and select the checkbox for ${meta.displayName} permissions.`],
      };
    }

    // 5. Hardware Device capability Check (Dynamically discovered from active data collectors!)
    const hasDeviceCapability = registeredDataTypes.includes(meta.requiredDataType) || 
      (meta.recordType === 'cardiacAlerts' && registeredDataTypes.includes('com.huawei.health.record.bradycardia'));
      
    if (!hasDeviceCapability) {
      const hardwareMap: Record<string, string> = {
        'com.huawei.health.record.sleep_breathing': 'TruSleep-enabled smartwatch with breathing monitoring capabilities',
        'com.huawei.health.record.tachycardia': 'Smartwatch or band with continuous heart-rate tracking',
        'com.huawei.health.record.abpm': 'Huawei Watch D or a supported blood pressure cuff connected to Huawei Health',
        'com.huawei.continuous.skin_temperature': 'Smartwatch containing active skin temperature sensor',
        'com.huawei.instant.vo2max': 'GPS watch linkage with running data streams',
        'com.huawei.instant.running_form': 'Huawei S-Tag running pod or dual-sensor smart accessories',
      };

      return {
        ...meta,
        status: 'actionRequired',
        reason: 'missingDevice',
        explanation: `No active linked wearable is currently transmitting ${meta.requiredDataType} logs.`,
        nextSteps: [
          `Connect a compatible device (${hardwareMap[meta.requiredDataType] || 'wearable'}) in the Huawei Health app.`,
          'Ensure the measurement switch is toggled ON on your phone and trigger a sync.',
        ],
      };
    }

    // 6. Fully Eligible State
    return {
      ...meta,
      status: 'eligible',
      reason: 'eligible',
      explanation: 'All requirements met. Advanced data streams are active.',
      nextSteps: [],
    };
  }
}
```

#### [MODIFY] [huawei-client.service.ts](file:///c:/PersonalProjects/huawei-health-ai-backend/src/integrations/huawei/huawei-client.service.ts)
Expose production REST client methods to fetch registered data collectors, user profiles, and advanced datasets.

```typescript
// ... inside HuaweiClientService:

  /**
   * Fetches real user profile details from Huawei cloud (age, gender, region)
   */
  async getUserProfile(token: string): Promise<{ gender?: string; age?: number; countryCode?: string }> {
    try {
      const response = await fetch(`${this.getBaseUrl()}/healthkit/v2/user`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      if (!response.ok) {
        throw new Error(`Huawei User Profile API Error: ${response.status}`);
      }
      const data = await response.json();
      return {
        gender: data.gender,
        age: data.age,
        countryCode: data.countryCode || 'RU', // Defaults to RU if empty
      };
    } catch (err) {
      this.logger.error('Failed to fetch real user profile from Huawei', err);
      throw err;
    }
  }

  /**
   * Retrieves all active data collectors registered under the user's Huawei account.
   * This is used to dynamically extract active data streams and watch capabilities.
   */
  async getRegisteredDataTypes(token: string): Promise<string[]> {
    try {
      const response = await fetch(`${this.getBaseUrl()}/healthkit/v2/dataCollectors`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      if (!response.ok) {
        throw new Error(`Huawei DataCollectors API Error: ${response.status}`);
      }
      const data = await response.json();
      const collectors = data.dataCollectors || [];
      const dataTypes = collectors.map((c: any) => c.dataType?.name).filter(Boolean);
      return Array.from(new Set(dataTypes)) as string[];
    } catch (err) {
      this.logger.error('Failed to fetch data collectors from Huawei', err);
      throw err;
    }
  }

  /**
   * Queries real Health Records or Sampling Datasets from Huawei Cloud.
   */
  async getAdvancedRecords(
    token: string,
    recordType: string,
    dataType: string,
    from: Date,
    to: Date,
  ): Promise<any[]> {
    const isHealthRecord = dataType.includes('.record.');
    const url = isHealthRecord
      ? `${this.getBaseUrl()}/healthkit/v2/healthRecords?type=${dataType}&startTime=${from.toISOString()}&endTime=${to.toISOString()}`
      : `${this.getBaseUrl()}/healthkit/v2/samplingDatasets/${dataType}?startTime=${from.toISOString()}&endTime=${to.toISOString()}`;

    try {
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      if (!response.ok) {
        throw new Error(`Huawei Advanced REST API Error: ${response.status}`);
      }
      const data = await response.json();
      
      if (isHealthRecord) {
        return (data.healthRecords || []).map((rec: any) => ({
          id: rec.id,
          timestamp: new Date(rec.startTime),
          data: rec.detailInfo || rec.summaryInfo || {},
        }));
      } else {
        return (data.samplingDataPoints || []).map((point: any) => ({
          id: `point_${point.startTime}`,
          timestamp: new Date(point.startTime),
          data: point.value || {},
        }));
      }
    } catch (err) {
      this.logger.error(`Failed to fetch real advanced records for dataType ${dataType}`, err);
      throw err;
    }
  }
```

#### [MODIFY] [huawei.service.ts](file:///c:/PersonalProjects/huawei-health-ai-backend/src/integrations/huawei/huawei.service.ts)
Implement advanced records syncing under the `selectedRecords` consent category and hook up the eligibility service.

```typescript
// ... inside HuaweiService:

  constructor(
    // ... existing
    private readonly eligibilityService: HuaweiEligibilityService,
    @InjectModel(HuaweiAdvancedRecord.name)
    private readonly advancedRecordModel: Model<HuaweiAdvancedRecordDocument>,
  ) {}

  async getAdvancedEligibility(userId: string): Promise<any[]> {
    this.assertUserId(userId);
    const connection = await this.connectionModel
      .findOne({ userId: new Types.ObjectId(userId) })
      .lean();
      
    if (!connection || connection.status !== 'connected') {
      return this.eligibilityService.evaluateEligibility(null, []);
    }

    const token = await this.getOrRefreshToken(userId);
    const registeredDataTypes = await this.clientService.getRegisteredDataTypes(token);
    
    return this.eligibilityService.evaluateEligibility(connection, registeredDataTypes);
  }

  async getAdvancedRecords(userId: string, recordType?: string): Promise<any[]> {
    this.assertUserId(userId);
    const filter: Record<string, any> = { userId: new Types.ObjectId(userId) };
    if (recordType) {
      filter.recordType = recordType;
    }
    return this.advancedRecordModel.find(filter).sort({ timestamp: -1 }).lean();
  }

  // Hook sync pipeline inside syncCategory case 'selectedRecords':
  private async syncSelectedRecordsCategory(
    userIdObj: Types.ObjectId,
    token: string,
    to: Date,
  ): Promise<boolean> {
    const connection = await this.connectionModel.findOne({ userId: userIdObj }).lean();
    if (!connection) return true;

    // 1. Fetch real active data types
    const registeredDataTypes = await this.clientService.getRegisteredDataTypes(token);

    // 2. Resolve eligible categories
    const eligibility = this.eligibilityService.evaluateEligibility(connection, registeredDataTypes);
    const eligibleRecords = eligibility.filter((e) => e.status === 'eligible');

    if (eligibleRecords.length === 0) {
      this.logger.log(`No advanced record types eligible for sync for user ${userIdObj}`);
      return true;
    }

    const from = new Date(to);
    from.setDate(to.getDate() - 3); // 3-day sync window
    let totalSynced = 0;

    for (const record of eligibleRecords) {
      const records = await this.clientService.getAdvancedRecords(
        token, 
        record.recordType, 
        record.requiredDataType, 
        from, 
        to
      );
      totalSynced += records.length;

      const operations = records.map((item) => ({
        updateOne: {
          filter: { userId: userIdObj, recordType: record.recordType, timestamp: item.timestamp },
          update: {
            $set: {
              data: item.data,
              rawPayload: item,
            },
          },
          upsert: true,
        },
      }));

      if (operations.length > 0) {
        await this.advancedRecordModel.bulkWrite(operations);
      }
    }

    // 3. Keep connection region updated dynamically from real profile response
    try {
      const profile = await this.clientService.getUserProfile(token);
      if (profile.countryCode && profile.countryCode !== connection.region) {
        await this.connectionModel.updateOne(
          { userId: userIdObj },
          { $set: { region: profile.countryCode } }
        );
      }
    } catch (e) {
      this.logger.warn('Failed to dynamically refresh connection country profile', e);
    }

    return totalSynced === 0;
  }
```

---

### Component 3: Controller & Endpoint Routing Layer

We will expose the REST interface for retrieving advanced eligibility and querying records.

---

#### [MODIFY] [health-data.controller.ts](file:///c:/PersonalProjects/huawei-health-ai-backend/src/health-data/health-data.controller.ts)
Add routes inside `HealthDataController` so users can retrieve their eligibility catalog and data logs.

```typescript
  @Get('advanced-records/eligibility')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get advanced records eligibility checklist and catalog' })
  @ApiResponse({ status: 200, description: 'List of record categories with status, reasons, and troubleshooting tips.' })
  async getAdvancedEligibility(@User() userId: string) {
    return this.huaweiService.getAdvancedEligibility(userId);
  }

  @Get('advanced-records')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get synchronized advanced health records' })
  @ApiResponse({ status: 200, description: 'Filtered list of advanced records sorted by timestamp.' })
  async getAdvancedRecords(
    @User() userId: string,
    @Query('type') type?: string,
  ) {
    return this.huaweiService.getAdvancedRecords(userId, type);
  }
```

#### [MODIFY] [huawei.module.ts](file:///c:/PersonalProjects/huawei-health-ai-backend/src/integrations/huawei/huawei.module.ts)
Register `HuaweiEligibilityService` and bind the `HuaweiAdvancedRecord` schema in the database Mongoose loader.

```typescript
// Add imports:
// import { HuaweiEligibilityService } from './huawei-eligibility.service';
// import { HuaweiAdvancedRecord, HuaweiAdvancedRecordSchema } from './schemas/huawei-advanced-record.schema';

// Inside @Module imports:
MongooseModule.forFeature([
  // ... existing
  { name: HuaweiAdvancedRecord.name, schema: HuaweiAdvancedRecordSchema },
])

// Inside providers:
providers: [
  // ... existing
  HuaweiEligibilityService,
]

// Inside exports:
exports: [
  // ... existing
  HuaweiEligibilityService,
]
```

---

## Verification Plan

### Automated Tests

We will cover our extensions with full TDD-based unit tests to check all state changes:

1. **Eligibility Engine (`huawei-eligibility.service.spec.ts`):**
   - **Scenario 1: Not connected state** -> Ensure all items show `actionRequired`, reason `missingPermission`.
   - **Scenario 2: Developer Tier limit** -> Set `HUAWEI_DEVELOPER_TIER=individual`. Ensure `abpm` and `sleepBreathing` return `notEligible`, reason `developerTierRestriction`.
   - **Scenario 3: Regional block (Optimized for RU)** -> Verify region `RU` does NOT block `sleepBreathing` or `abpm` (all show `eligible` when devices are present). Verify US region blocks `abpm` with `regionRestriction`.
   - **Scenario 4: Missing hardware/dataTypes** -> Pass a registered data types list with only `com.huawei.continuous.skin_temperature`. Check that `abpm`, `sleepBreathing`, and `runningForm` return `actionRequired` with `missingDevice` and show proper troubleshooting instructions.
   - **Scenario 5: Full validation** -> Pass all scopes and active advanced dataTypes, set tier to `enterprise`. Ensure all reports return status `eligible`.

2. **Sync pipeline integration (`huawei.service.spec.ts`):**
   - Test `syncSelectedRecordsCategory` filters record types by eligibility. If `com.huawei.instant.vo2max` is eligible but `com.huawei.health.record.abpm` is restricted, ensure the service calls `getAdvancedRecords` ONLY for `vo2Max`.

3. **HTTP Controller tests (`health-data.controller.spec.ts`):**
   - Verify `GET /v1/health-data/advanced-records/eligibility` returns the structured JSON catalog.

4. **Verify Quality Gates:**
   Run code verification checks:
   ```powershell
   yarn lint
   yarn build
   yarn format
   yarn test
   yarn test:cov
   ```

### Manual Verification

1. Spin up the dev server (`yarn dev`).
2. Log in, check `GET /v1/health-data/advanced-records/eligibility`. By default, verify it shows missing permissions/connections.
3. Establish a production-like connection. Query the eligibility checklist. Confirm `cardiacAlerts` and `vo2Max` are active/actionRequired, while `abpm` and `sleepBreathing` are fully functional and eligible once user's real data collectors transmit the values.
