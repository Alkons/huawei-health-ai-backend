# Task 003 — Sync core health & workout data (MVP) — Implementation plan

## Goal
Implement the **backend portion** of the core health and workout data synchronization from Huawei Health Kit REST API, store the data in a normalized MongoDB format, resolve duplicates/overlaps, and expose endpoints to track sync status, trigger manual sync, and query the synchronized health metrics.

---

## User Review Required

> [!IMPORTANT]
> **Data Storage Format (MongoDB/Mongoose)**
> While the high-level specification (`product/spec.md`) mentions PostgreSQL, the codebase is fully built on Mongoose/MongoDB. We will continue using Mongoose/MongoDB to maintain consistency with the existing data layer (`HuaweiConnection`, `HuaweiProviderToken`, etc.).
> We will create dedicated collections for daily activity summaries, workouts, sleep, heart signals, and SpO2.

> [!NOTE]
> **Incremental Fetch Strategy**
> Since Huawei Health data changes dynamically (e.g., when a user manually syncs their watch to the Huawei Health app), we will fetch data with a sliding window lookback:
> - **Daily Activity:** Look back 3 days to capture retroactive calibration.
> - **Workouts & Sleep:** Look back 7 days to catch any delayed session syncs.
> - **Heart signals & SpO2:** Look back 1 day to sync high-frequency samples efficiently.

---

## Open Questions

> [!NOTE]
> **Mock Huawei REST API for Testing**
> For local development and CI/CD automated tests, we need a reliable way to simulate Huawei Health Kit's cloud endpoints. We will build a comprehensive mock handler within our integration tests that simulates:
> - User info, sleep record list, workout record list, and atomic data points.
> - Success states as well as error conditions (insufficient permission, unsupported device, empty response, etc.) to verify our robust error mapping.

---

## Proposed Changes

### Component 1: Data Models & Database Schemas
We will define Mongoose schemas representing normalized fitness and health facts with built-in deduplication keys.

---

#### [NEW] [huawei-daily-activity.schema.ts](file:///c:/PersonalProjects/huawei-health-ai-backend/src/integrations/huawei/schemas/huawei-daily-activity.schema.ts)
Represents user steps, active calories, distance, hours active, and intensity minutes aggregated per day.
- **Fields:**
  - `userId: Types.ObjectId` (indexed, ref: 'User')
  - `date: string` (YYYY-MM-DD, indexed, unique per user)
  - `steps: number`
  - `calories: number` (active calories, kcal)
  - `distance: number` (meters)
  - `intensityMinutes: number`
  - `hoursActive: number`
  - `rawPayloads: Array<Record<string, any>>` (auditability and compliance)
  - `lastSyncedAt: Date`
- **Unique Constraint:** `{ userId: 1, date: 1 }` (guarantees no duplicate daily cards)

#### [NEW] [huawei-workout-session.schema.ts](file:///c:/PersonalProjects/huawei-health-ai-backend/src/integrations/huawei/schemas/huawei-workout-session.schema.ts)
Represents individual exercise sessions.
- **Fields:**
  - `userId: Types.ObjectId` (indexed, ref: 'User')
  - `workoutId: string` (Huawei native activity record ID, indexed, unique per user)
  - `activityType: string` (e.g., 'running', 'cycling')
  - `startTime: Date` (indexed)
  - `endTime: Date`
  - `duration: number` (seconds)
  - `calories: number` (kcal)
  - `distance?: number` (meters)
  - `avgHeartRate?: number` (bpm)
  - `maxHeartRate?: number` (bpm)
  - `rawPayload: Record<string, any>`
- **Unique Constraint:** `{ userId: 1, workoutId: 1 }`

#### [NEW] [huawei-sleep-session.schema.ts](file:///c:/PersonalProjects/huawei-health-ai-backend/src/integrations/huawei/schemas/huawei-sleep-session.schema.ts)
Represents sleep sessions and sub-stages.
- **Fields:**
  - `userId: Types.ObjectId` (indexed, ref: 'User')
  - `sleepId: string` (Huawei native sleep record ID, indexed, unique per user)
  - `startTime: Date` (indexed)
  - `endTime: Date`
  - `duration: number` (minutes)
  - `deepSleepDuration?: number` (minutes)
  - `lightSleepDuration?: number` (minutes)
  - `remSleepDuration?: number` (minutes)
  - `awakeDuration?: number` (minutes)
  - `rawPayload: Record<string, any>`
- **Unique Constraint:** `{ userId: 1, sleepId: 1 }`

#### [NEW] [huawei-heart-signal.schema.ts](file:///c:/PersonalProjects/huawei-health-ai-backend/src/integrations/huawei/schemas/huawei-heart-signal.schema.ts)
Represents heart rate snapshots, resting heart rate, and HRV (Heart Rate Variability).
- **Fields:**
  - `userId: Types.ObjectId` (indexed, ref: 'User')
  - `timestamp: Date` (indexed)
  - `heartRate: number` (bpm)
  - `restingHeartRate?: number` (bpm)
  - `hrv?: number` (ms)
- **Unique Constraint:** `{ userId: 1, timestamp: 1 }` (deduplication of same-second readings)

#### [NEW] [huawei-spo2-record.schema.ts](file:///c:/PersonalProjects/huawei-health-ai-backend/src/integrations/huawei/schemas/huawei-spo2-record.schema.ts)
Represents SpO2 readings and low-SpO2 records.
- **Fields:**
  - `userId: Types.ObjectId` (indexed, ref: 'User')
  - `timestamp: Date` (indexed)
  - `spo2: number` (percentage)
  - `isLowSpO2?: boolean`
- **Unique Constraint:** `{ userId: 1, timestamp: 1 }`

#### [NEW] [huawei-sync-progress.schema.ts](file:///c:/PersonalProjects/huawei-health-ai-backend/src/integrations/huawei/schemas/huawei-sync-progress.schema.ts)
Tracks status, last updated time, and granular reason classes for each health category sync.
- **Fields:**
  - `userId: Types.ObjectId` (indexed)
  - `category: HuaweiConsentCategory` (indexed)
  - `status: 'synced' | 'syncing' | 'failed' | 'pending'`
  - `lastSuccessAt?: Date`
  - `lastAttemptedAt?: Date`
  - `reasonClass: 'permissionNotGranted' | 'deviceUnsupported' | 'regionLimitation' | 'syncSettingsOff' | 'noDataForRange' | 'ok' | 'notYetSynced'`
  - `explanation?: string`
- **Unique Constraint:** `{ userId: 1, category: 1 }`

---

### Component 2: Synchronization Core Logic
We will build the actual data fetching client and orchestrator, including secure token refreshing.

---

#### [MODIFY] [huawei.service.ts](file:///c:/PersonalProjects/huawei-health-ai-backend/src/integrations/huawei/huawei.service.ts)
We will expand the existing `HuaweiService` to orchestrate token management, REST client execution, deduplication logic, error capturing, and state-writing.
- **Add Token Management:**
  - `async getOrRefreshToken(userId: string): Promise<string>`
    - Checks the stored token in `HuaweiProviderToken` collection.
    - If expired, decrypts the refresh token using `HuaweiTokenCryptoService`, exchanges it with Huawei's token endpoint (`/oauth2/v3/token`), encrypts the new refresh token, updates the document, and returns the new `accessToken`.
- **Add Sync Method:**
  - `async syncCategory(userId: string, category: HuaweiConsentCategory): Promise<void>`
    - Verifies if the category is enabled in user settings and granted in `HuaweiConnection`.
    - If not enabled or not granted, updates `HuaweiSyncProgress` with `status: 'failed'` and `reasonClass: 'permissionNotGranted'`.
    - Otherwise, sets status to `'syncing'`.
    - Fetches token and invokes the private adapter for that category.
    - Captures any exceptions and maps them using a robust error classifier to update `HuaweiSyncProgress` with `reasonClass`:
      - Huawei HTTP 403 / Scope error: `'permissionNotGranted'`
      - Hardware unsupported / empty device profile: `'deviceUnsupported'`
      - Regional blocks / HMS service restriction: `'regionLimitation'`
      - Inactive accounts or syncer disabled: `'syncSettingsOff'`
      - Empty array from successful call: `'noDataForRange'`
    - On success: saves data records using Mongoose `bulkWrite` (for high-performance upserts and deduplication), and sets `HuaweiSyncProgress` to `status: 'synced'`, `reasonClass: 'ok'`, and `lastSuccessAt: new Date()`.
  - `async syncAllEnabledCategories(userId: string): Promise<void>`
    - Concurrent sync of all enabled categories using `Promise.allSettled`.
    - Updates overall `lastSyncAt` and freshness indicators on the user's `HuaweiConnection` record.

#### [NEW] [huawei-client.service.ts](file:///c:/PersonalProjects/huawei-health-ai-backend/src/integrations/huawei/huawei-client.service.ts)
A thin REST client wrapper designed to execute authentic queries on Huawei Health Kit APIs.
- **API Mappings:**
  - `getActivityDaily(token: string, from: Date, to: Date)` -> `/healthkit/v2/samplingDatasets` (query continuous activity indices)
  - `getWorkouts(token: string, from: Date, to: Date)` -> `/healthkit/v2/activityRecords`
  - `getSleep(token: string, from: Date, to: Date)` -> `/healthkit/v2/healthRecords` (filter by sleep record type) and sub-stages datasets.
  - `getHeartSignals(token: string, from: Date, to: Date)` -> `/healthkit/v2/samplingDatasets` (query heart rate metrics)
  - `getSpO2(token: string, from: Date, to: Date)` -> `/healthkit/v2/samplingDatasets` (oxygen saturation)

---

### Component 3: Scheduler and Polling
Ensure automated background synchronization of all connected accounts.

---

#### [NEW] [huawei-sync.scheduler.ts](file:///c:/PersonalProjects/huawei-health-ai-backend/src/integrations/huawei/huawei-sync.scheduler.ts)
A NestJS background provider that periodic runs synchronization tasks.
- **Behavior:**
  - Standard periodic interval (e.g. running every 30 minutes).
  - Finds all users with `status: 'connected'` in `HuaweiConnection`.
  - Sequentially triggers `HuaweiService.syncAllEnabledCategories(user.userId)` for each user.
  - Adds logging and catch boundaries to ensure a failure in one user's sync does not halt the schedule for others.

---

### Component 4: REST API Controllers
Expose the status, triggering mechanisms, and aggregated health facts to our client application.

---

#### [NEW] [health-data.controller.ts](file:///c:/PersonalProjects/huawei-health-ai-backend/src/health-data/health-data.controller.ts)
Provides standard endpoints to access synchronized health timelines, summaries, and check synchronization diagnostics.
- **Endpoints:**
  - **GET** `/v1/health-data/sync-status`
    - Returns full array of `HuaweiSyncProgress` records (current sync state, `lastSuccessAt`, `reasonClass`, and descriptive human messages).
  - **POST** `/v1/health-data/sync`
    - Manually triggers background sync. Returns immediately with `202 Accepted` status.
  - **GET** `/v1/health-data/timeline`
    - Returns a combined chronological feed of workouts, sleep sessions, and daily summaries for standard coaching feed render.
  - **GET** `/v1/health-data/dashboard`
    - Returns standard cards for Steps, Active Calories, Sleep, Heart Rate, and SpO2.
- **Guards:** Authenticated via the standard `JwtAuthGuard`.

#### [NEW] [health-data.module.ts](file:///c:/PersonalProjects/huawei-health-ai-backend/src/health-data/health-data.module.ts)
Declares the `HealthDataModule` imports (including Mongoose model registrations for all new schemas) and registers `HealthDataController`.

#### [MODIFY] [huawei.module.ts](file:///c:/PersonalProjects/huawei-health-ai-backend/src/integrations/huawei/huawei.module.ts)
Register new schemas (`HuaweiDailyActivity`, `HuaweiWorkoutSession`, `HuaweiSleepSession`, `HuaweiHeartSignal`, `HuaweiSpO2Record`, `HuaweiSyncProgress`) in Mongoose module imports, and list `HuaweiClientService` and `HuaweiSyncScheduler` as providers.

#### [MODIFY] [app.module.ts](file:///c:/PersonalProjects/huawei-health-ai-backend/src/app.module.ts)
Import `HealthDataModule` to enable the new endpoints.

---

## Verification Plan

### Automated Tests
We will build robust unit and integration tests using Jest.
1. **Unit Tests (`src/integrations/huawei/huawei.service.spec.ts` & others):**
   - Verify token refresh exchange: if valid, continues; if expired, decrypts and updates.
   - Verify error classification maps standard Huawei REST responses to `'permissionNotGranted'`, `'deviceUnsupported'`, etc.
   - Verify data deduplication using bulk writes (insures no overlapping inputs create duplicate Mongoose records).
2. **Integration Tests (`src/health-data/health-data.controller.spec.ts`):**
   - Mock Huawei HTTP REST API endpoints and verify full sync process.
   - Assert `GET /v1/health-data/sync-status` returns valid reason classes and correct date schemas.
   - Run verification tests to ensure the database stays fully compliant:
     ```powershell
     yarn test
     yarn test:cov
     yarn lint
     yarn format:check
     ```

### Manual Verification
1. Run application in watch mode: `yarn dev`.
2. Connect a test user via OAuth, trigger sync through `POST /v1/health-data/sync`.
3. Check `GET /v1/health-data/sync-status` and ensure `reasonClass: 'ok'` is present.
4. Retrieve summaries through `GET /v1/health-data/dashboard` to verify structured, clean timeline cards exist.
