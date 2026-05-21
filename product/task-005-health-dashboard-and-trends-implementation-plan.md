# Task 005 — Health Dashboard, History, and Trends — Implementation Plan

## Goal
Implement a robust trends aggregation engine and extend the user-facing health dashboard in the NestJS backend. This will allow users to view activity, sleep, and core health signals over 7/14/30 day windows with clear gap communication (avoiding misleading flat trend lines) and provide complete context on data-source permissions and troubleshooting procedures.

---

## User Review Required

> [!IMPORTANT]
> **Data Gaps Communication Strategy**
> To prevent misleading user-facing trends (e.g. drawing a straight line to `0` or interpolating over missing days as if the user was inactive), the trends aggregation service will generate a continuous grid of dates for the requested range (7, 14, or 30 days). For any date where no synced data is found, the value will be returned as `null`. This allows the client-side charting libraries to render broken/disconnected lines or gap highlights rather than misleading dips.

> [!NOTE]
> **Dashboard Extensions**
> We will extend the existing `GET /v1/health-data/dashboard` payload to satisfy the acceptance criteria:
> 1. Include a `weekly` activity summary alongside the latest `activity` card, aggregating the last 7 days of activity data (total/average steps, active calories, distance, hours active, and the count of logged days).
> 2. Add a `recentWorkouts` array containing the last 5 workouts so the user has immediate access to recent activity histories.

---

## Open Questions

> [!NOTE]
> **Timezone Range Alignment**
> Activity metrics in the database are stored against local date strings (`YYYY-MM-DD`). Workouts, sleep sessions, heart signals, and SpO2 records use UTC `Date` timestamps. When querying trend boundaries, we will generate daily ranges based on standard UTC midnight intervals and match activity records by date strings, which is fully compatible with our database models.

---

## Proposed Changes

### Component 1: DTOs & Return Types

We will define structured interfaces for trend reporting and extend the existing dashboard summary interfaces.

---

#### [MODIFY] [health-data.service.ts](file:///c:/PersonalProjects/huawei-health-ai-backend/src/health-data/health-data.service.ts)

We will modify `health-data.service.ts` to add the interfaces for the new trend endpoint and update the `DashboardSummary` structure.

```typescript
// Update DashboardSummary with weekly summary and recent workouts
export interface DashboardSummary {
  activity?: {
    date: string;
    steps: number;
    calories: number;
    distance: number;
    intensityMinutes: number;
    hoursActive: number;
    weekly?: {
      totalSteps: number;
      avgSteps: number;
      totalCalories: number;
      avgCalories: number;
      totalDistance: number;
      intensityMinutes: number;
      hoursActive: number;
      daysCount: number;
    };
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
  recentWorkouts?: {
    id: string;
    workoutId: string;
    activityType: string;
    startTime: Date;
    endTime: Date;
    duration: number; // seconds
    calories: number; // kcal
    distance?: number; // meters
    avgHeartRate?: number; // bpm
  }[];
}

// Add interfaces for Trends
export interface TrendPoint {
  date: string; // YYYY-MM-DD
  value: number | null; // null signals a gap in data recording
}

export interface MetricTrend {
  category: HuaweiConsentCategory;
  displayName: string;
  unit: string;
  reliability?: MetricReliability;
  points: TrendPoint[];
  summary: {
    total?: number; // only returned for accumulative metrics (e.g. steps, calories)
    average: number | null;
    min: number | null;
    max: number | null;
  };
}

export interface TrendsReport {
  days: number;
  trends: {
    steps?: MetricTrend;
    calories?: MetricTrend;
    sleep?: MetricTrend;
    restingHeartRate?: MetricTrend;
    spo2?: MetricTrend;
  };
}
```

---

### Component 2: Business Logic Updates in Health Data Service

We will update `getDashboard` and implement `getTrends` in the health data service.

---

#### [MODIFY] [health-data.service.ts (methods)](file:///c:/PersonalProjects/huawei-health-ai-backend/src/health-data/health-data.service.ts)

We will modify the core operations of `HealthDataService` to compute weekly activities, fetch recent workouts, and calculate time-series trends.

* **Weekly Activity & Recent Workouts in `getDashboard`:**
  - Retrieve the last 7 days of daily activity data using a query sorted by date descending.
  - Sum and average: steps, active calories, distance, intensity minutes, and hours active. Count the active days retrieved.
  - Query the last 5 workouts: `this.workoutSessionModel.find({ userId: userIdObj }).sort({ startTime: -1 }).limit(5).lean()`.
  - Populate the revised `DashboardSummary`.

* **New Method `getTrends(userId: string, days = 7): Promise<TrendsReport>`:**
  - Standardize the `days` parameter to must be 7, 14, or 30 days.
  - Generate the sequential list of `YYYY-MM-DD` date strings covering the last `N` days.
  - Query all relevant collections concurrently matching records in the range `[today - days, today]`.
  - For each category (`activity`, `sleep`, `heartSignals`, `spo2`), resolve the `MetricReliability` status using the helper `getMetricReliability(...)`.
  - Perform grouping and aggregations:
    - **Steps & Calories**: Group by daily `date` string. Sum values for dates if duplicate records exist. Set to `null` if no records exist.
    - **Sleep**: Group sessions by their local date representation of `startTime`. Sum durations if multiple sessions occur on the same day. Set to `null` if no session ends/starts on that date.
    - **Resting Heart Rate**: Group signals where `restingHeartRate` is defined by day string. Calculate the daily average resting heart rate. Set to `null` if absent.
    - **SpO2**: Group SpO2 records by day string. Calculate the daily average SpO2 percentage. Set to `null` if absent.
  - Calculate `summary` metrics (`total` where applicable, `average`, `min`, `max`) ignoring `null` values in the time-series points.
  - If a category is not enabled or lacks synchronization progress entirely, return a `MetricTrend` containing all `null` points, but with its correct `reliability` metadata set (indicating missing permissions or sync errors).

---

### Component 3: Trends Controller Endpoint

We will expose the trend metrics on a new controller endpoint.

---

#### [MODIFY] [health-data.controller.ts](file:///c:/PersonalProjects/huawei-health-ai-backend/src/health-data/health-data.controller.ts)

Add the trends query endpoint with proper routing and DTO validation.

```typescript
  @Get('trends')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get historical trend graphs (7/14/30 days) with reliability reports' })
  @ApiResponse({
    status: 200,
    description: 'Returns historical trends for activity, sleep, resting heart rate, and SpO2 with data-source transparency.',
  })
  async getTrends(
    @User() userId: string,
    @Query('days') days?: string,
  ) {
    const daysNum = days ? parseInt(days, 10) : 7;
    if (![7, 14, 30].includes(daysNum)) {
      throw new BadRequestException('Trend window must be 7, 14, or 30 days.');
    }
    return this.healthDataService.getTrends(userId, daysNum);
  }
```

---

## Copy Requirements & Sync States

To ensure excellent UX and transparency, the backend provides detailed sync states so the frontend can display matching copy for every scenario:

### 1. "No Data" State
* **Trigger**: A metric's sync category is active and completed, but there is no logged data on Huawei Health for the requested range.
* **Backend reliability info**: `status: 'synced'`, `reasonClass: 'noDataForRange'`, `guidanceHint`: `"No data recorded today on Huawei Cloud. Try opening Huawei Health to sync your wearable."`
* **Copy Requirements**:
  - *Headline*: `"No Activity Recorded"`
  - *Body*: `"We couldn't find any health records for this time frame. Keep moving, and make sure your Huawei wearable is syncing properly with your phone."`
  - *Action*: `"Force Sync Wearable" / "Open Huawei Health"`

### 2. "Limited Data / Sync Delayed" State
* **Trigger**: Partial synchronization is complete, but some metrics are pending first sync or have failed sync attempts (stale charts).
* **Backend reliability info**: `completenessStatus: 'partial'`, `isStale: true`
* **Copy Requirements**:
  - *Headline*: `"Sync Delay Warning"`
  - *Body*: `"Some metrics are out of date because they haven't synced recently. Your weekly summary and AI coaching tips may be incomplete until sync finishes."`
  - *Action steps shown*:
    1. `"Open the Huawei Health app on your phone."`
    2. `"Swipe down on the home screen to force sync with your wearable."`
    3. `"Wait a couple minutes and refresh this dashboard."`

### 3. "Not Supported / Not Permitted" State
* **Trigger**: The user did not grant authorization, sync is disabled, regional limits block HMS sync, or their wearable lacks physical sensors (e.g. no SpO2 or HRV).
* **Backend reliability info**:
  - Permission missing: `reasonClass: 'permissionNotGranted'`, `guidanceHint`: `"Consent missing. Open settings to grant permissions."`
  - Settings disabled: `reasonClass: 'syncSettingsOff'`, `guidanceHint`: `"Sync is toggled off in settings."`
  - Sensors missing: `reasonClass: 'deviceUnsupported'`, `guidanceHint`: `"Metric not supported by your wearable."`
* **Copy Requirements**:
  - *Headline (Permission Required)*: `"Permission Required"`
  - *Body (Permission Required)*: `"We need your permission to access this data stream. Tap the button below to update your Huawei Health data access permissions."`
  - *Action*: `"Manage Consent"`
  - *Headline (Not Supported)*: `"Metric Not Supported"`
  - *Body (Not Supported)*: `"Your connected Huawei wearable does not support tracking this metric (e.g., resting heart rate, SpO2, or HRV). We will hide this chart."`

---

## Verification Plan

### Automated Tests
We will build exhaustive Jest unit tests to verify our implementation:

1. **Unit Tests in `health-data.service.spec.ts`:**
   - **Weekly Summary test**: Mock 7 days of activity documents and verify that `weekly` total/average metrics are computed correctly.
   - **Recent Workouts test**: Mock workout sessions and verify that the latest 5 are included in the dashboard output.
   - **Trend Aggregation tests**:
     - Verify correct day ranges (7, 14, and 30 days) generate matching output lists.
     - Verify date matching and summation of multiple daily activity documents on the same calendar day.
     - Verify that missing dates are correctly represented as `{ date: 'YYYY-MM-DD', value: null }` (gap preservation).
     - Verify that averages, min, max are calculated correctly ignoring `null` values.
     - Verify trend behavior when permissions are missing or sync is failed (returns empty points array or `null` points with `reliability` error codes).

2. **Integration Tests in `health-data.controller.spec.ts`:**
   - Verify `GET /v1/health-data/trends` endpoint is secured by `JwtAuthGuard`.
   - Verify bad request exception is thrown when querying with invalid days (e.g., `days=10`).
   - Verify success `200 OK` returns the valid `TrendsReport` schema.

3. **CI pipeline checks:**
   - Execute verification suite:
     ```powershell
     powershell -ExecutionPolicy Bypass -Command "yarn build"
     powershell -ExecutionPolicy Bypass -Command "yarn lint"
     powershell -ExecutionPolicy Bypass -Command "yarn format"
     powershell -ExecutionPolicy Bypass -Command "yarn test"
     powershell -ExecutionPolicy Bypass -Command "yarn test:cov"
     ```

### Manual Verification
1. Run application in development: `powershell -ExecutionPolicy Bypass -Command "yarn dev"`.
2. Emulate incomplete database states (e.g. only populate steps for Monday and Wednesday in a 7-day trend).
3. Call `GET /v1/health-data/trends?days=7` and verify that Tuesday, Thursday, Friday, Saturday, and Sunday points are returned with `value: null`.
4. Call `GET /v1/health-data/dashboard` and verify `weekly` activity properties and the `recentWorkouts` array contains accurate mock records.
