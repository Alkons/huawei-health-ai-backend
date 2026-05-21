# Task 004 — Data freshness, completeness, and confidence UX — Implementation plan

## Goal
Implement a robust reliability tracking framework in the NestJS backend to calculate and expose health data **freshness**, **completeness**, and **AI coaching confidence** levels. This ensures that the user interface never displays false "zero-activity" states due to sync delays, provides clear trouble-shooting guidance for sync clogs, and supplies reliable data quality signals to the AI coaching system.

---

## User Review Required

> [!IMPORTANT]
> **Reliability & Confidence Derivation Matrix**
> We define a deterministic logic matrix to derive overall and category-level status flags.
>
> 1. **Freshness State (based on time since `lastSuccessAt`):**
>    - **`fresh`**: `lastSuccessAt` is within the last 4 hours (active sync window).
>    - **`delayed`**: `lastSuccessAt` is between 4 and 24 hours ago (wearable hasn't synced with HMS cloud recently).
>    - **`stale`**: `lastSuccessAt` is older than 24 hours ago, or the last sync attempt failed and the previous success is > 24 hours old.
>    - **`unknown`**: No successful sync has ever completed (`lastSuccessAt` is null).
>
> 2. **Completeness State (for a given time window / daily card):**
>    - **`complete`**: All enabled categories synced successfully, and no sync errors are currently present.
>    - **`partial`**: At least one enabled category synced successfully, but other enabled categories have failed, are pending first sync, or report `'noDataForRange'` despite the user being active.
>    - **`none`**: All enabled categories have failed, are pending, or have their consent settings turned off (zero active streams).
>
> 3. **Confidence Level (AI Coaching Context):**
>    - **`high`**: Overall completeness is `complete` and freshness is `fresh`.
>    - **`medium`**: Completeness is `complete` but freshness is `delayed`; OR completeness is `partial` but critical metrics (`activity`, `workouts`) are `fresh` or `delayed`.
>    - **`low`**: Freshness is `stale`, or completeness is `none`, or key metrics have critical sync failures (e.g. `'permissionNotGranted'`).

> [!NOTE]
> **No Magic "You Did Nothing" States**
> To prevent the system from falsely showing "0 steps" or "no workouts done" when data sync has actually lagged, the dashboard and timeline endpoints will be enhanced. If a metric is empty, the backend will check its sync completeness status. If it is incomplete/stale, a clear `completeness` and `guidanceHint` will be attached so the client-side UI can show a warning or pending card instead of a blank slate.

---

## Open Questions

> [!NOTE]
> **Timezone Shifts and Windowing**
> Standard timezone changes (e.g., traveling) can shift the alignment of daily activity aggregates. We handle all timestamps in standard UTC in the database. Daily aggregates utilize the local date format (`YYYY-MM-DD`) provided by Huawei. When calculating daily completeness, the backend will assess the completeness state relative to the user's current local date.

---

## Proposed Changes

### Component 1: Data Types and Models

We will create a structured interface definition for the reliability report returned to the client and AI engine.

---

#### [NEW] [huawei-reliability.types.ts](file:///c:/PersonalProjects/huawei-health-ai-backend/src/integrations/huawei/dto/huawei-reliability.types.ts)
Defines the typescript models, enumerations, and content guidance contracts.

```typescript
import { HuaweiConsentCategory } from '../schemas/huawei-consent-category';
import { HuaweiSyncReasonClass } from '../schemas/huawei-sync-progress.schema';

export type HuaweiFreshnessState = 'fresh' | 'delayed' | 'stale' | 'unknown';
export type HuaweiCompletenessState = 'complete' | 'partial' | 'none';
export type HuaweiConfidenceLevel = 'high' | 'medium' | 'low';

export interface UserGuidance {
  message: string;
  actionSteps: string[];
}

export interface CategoryReliability {
  category: HuaweiConsentCategory;
  displayName: string;
  status: 'synced' | 'syncing' | 'failed' | 'pending';
  lastSuccessAt?: Date;
  lastAttemptedAt?: Date;
  reasonClass: HuaweiSyncReasonClass;
  explanation?: string;
  freshness: HuaweiFreshnessState;
  guidanceHint: string;
  isStaleBannerRequired: boolean;
}

export interface ReliabilityReport {
  overall: {
    lastSyncAt?: Date;
    freshness: HuaweiFreshnessState;
    completeness: HuaweiCompletenessState;
    confidence: HuaweiConfidenceLevel;
    guidance: UserGuidance;
    isStaleBannerRequired: boolean;
  };
  categories: CategoryReliability[];
}
```

---

### Component 2: Business Logic Updates in Health Data Service

We will implement the reliability calculation, error mapping dictionary, and update the dashboard/timeline payload structures.

---

#### [MODIFY] [health-data.service.ts](file:///c:/PersonalProjects/huawei-health-ai-backend/src/health-data/health-data.service.ts)
We will add methods to calculate freshness, completeness, confidence, and corresponding user advice. We will also annotate dashboard summary data with reliability metadata.

- **Add Reason Dictionary:**
  Create a private map of `HuaweiSyncReasonClass` to user-facing advice and reason codes:
  - `permissionNotGranted` -> Code: `HUAWEI_PERMISSION_DENIED`, Advice: "Consent missing. Open settings to grant permissions.", Action Steps: ["Go to Consent settings in the app", "Enable access to health categories", "Re-authenticate with Huawei Health if prompted"]
  - `deviceUnsupported` -> Code: `HUAWEI_DEVICE_UNSUPPORTED`, Advice: "Metric not supported by your wearable.", Action Steps: ["Verify wearable device compatibility", "Ensure HMS core is updated"]
  - `regionLimitation` -> Code: `HUAWEI_REGIONAL_RESTRICTION`, Advice: "Service restricted in your account region.", Action Steps: ["Check Huawei account region configuration"]
  - `syncSettingsOff` -> Code: `HUAWEI_SYNC_DISABLED`, Advice: "Sync is toggled off in settings.", Action Steps: ["Enable sync for this category in settings"]
  - `noDataForRange` -> Code: `HUAWEI_NO_DATA`, Advice: "No data recorded today on Huawei Cloud.", Action Steps: ["Open the Huawei Health app on your phone", "Pull down to force sync your wearable to the cloud", "Wait a few minutes and refresh this screen"]
  - `notYetSynced` -> Code: `HUAWEI_PENDING_FIRST_SYNC`, Advice: "Initial sync is pending.", Action Steps: ["Wait a few minutes or tap Sync Now"]

- **Add Reliability Logic:**
  - `async getReliabilityReport(userId: string): Promise<ReliabilityReport>`
    - Fetch user's `HuaweiConnection` and `HuaweiSyncProgress` records.
    - Calculate per-category freshness based on `lastSuccessAt` (thresholds: 4h = fresh, 24h = delayed, else stale).
    - Determine overall freshness, completeness, and confidence using the rule matrix.
    - Generate human-friendly guidance, action items, and stale flags.

- **Modify `getDashboard`:**
  - Annotate each card with:
    - `lastUpdated?: Date`
    - `completenessStatus: HuaweiCompletenessState`
    - `guidanceHint?: string`
    - `isStale: boolean`
  - E.g., if steps activity is empty and step sync is `failed` / `pending`, instead of the frontend guessing, the backend returns:
    ```json
    "activity": {
      "steps": 0,
      "reliability": {
        "status": "partial",
        "isStale": true,
        "hint": "Steps sync delayed. Make sure your wearable is connected to Huawei Health."
      }
    }
    ```

---

### Component 3: Controller Endpoints

Expose the reliability metrics to the mobile/web clients.

---

#### [MODIFY] [health-data.controller.ts](file:///c:/PersonalProjects/huawei-health-ai-backend/src/health-data/health-data.controller.ts)
Add a dedicated endpoint for fetching the user's sync reliability status.

- **Endpoints:**
  - **GET** `/v1/health-data/reliability`
    - Retrieves the unified `ReliabilityReport` containing overall and per-category stats, freshness states, confidence, and action steps.
    - Authenticated via `JwtAuthGuard`.

---

## Verification Plan

### Automated Tests
We will build comprehensive unit and integration tests using Jest.

1. **Unit Tests in `health-data.service.spec.ts`:**
   - Test freshness state categorization (verify <4h is `'fresh'`, <24h is `'delayed'`, >24h is `'stale'`).
   - Test completeness resolution (verify all success is `'complete'`, mixed is `'partial'`, all failed/pending is `'none'`).
   - Test confidence classification (verify the combination of freshness & completeness maps to correct confidence level).
   - Verify that when no data is present, the dashboard returns the appropriate metadata warning rather than just default zero-activity values.

2. **Integration Tests in `health-data.controller.spec.ts`:**
   - Verify `GET /v1/health-data/reliability` returns `200 OK` with the expected schema fields.

3. **Validation Suite:**
   - Run compilation, linting, and automated checks:
     ```powershell
     yarn build
     yarn lint
     yarn format
     yarn test
     yarn test:cov
     ```

### Manual Verification
1. Run application: `yarn dev`.
2. Emulate user with stale sync records (e.g. modify `lastSuccessAt` in DB to be 36 hours ago).
3. Query `GET /v1/health-data/reliability` and verify `freshness: 'stale'`, `confidence: 'low'`, and that actionable steps specify "Open Huawei Health..."
4. Query `GET /v1/health-data/dashboard` and verify that the metrics include the `reliability` metadata object with appropriate warnings.
