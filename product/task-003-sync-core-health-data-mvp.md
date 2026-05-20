# Task 003 — Sync core health & workout data (MVP)

## Summary
Provide reliable synchronization of the core Huawei Health categories needed for coaching: daily activity, workouts, sleep, heart signals, and SpO2 (subject to availability).

## User story
As a **user**, I want my **Huawei Health data to appear in the app automatically**, so I can see my recent activity and get coaching without manual effort.

## In scope
- Product requirements for syncing and representing these categories:
  - Daily activity (e.g., steps, active calories, distance, intensity minutes / hours active)
  - Workouts / activity sessions (type, duration, start/end time, summary metrics)
  - Sleep (sleep sessions/records, sleep duration and basic stages if available)
  - Heart signals (heart rate, resting heart rate, HRV where available)
  - SpO2 (spot/periodic values and low-SpO2 record availability where supported)
- Basic “first sync” expectations and timelines (user messaging requirements).
- Handling partial availability (some categories missing) with clear user-facing explanations.

## Out of scope
- Real-time streaming coaching during workouts (separate task)
- Support for every advanced health record type (separate task)
- Writing data back into Huawei Health

## Deliverables
- A list of MVP data categories with definitions in user terms.
- “What you’ll see” examples per category (not mockups; just content requirements).
- Freshness requirements:
  - How “Last updated” is displayed
  - When the app says “Data may be delayed”
- Completeness requirements:
  - Show “No data” vs “Not supported” vs “Not permitted” vs “Not yet synced”

## Acceptance criteria
- After connection, the app shows a populated timeline or summaries for at least one supported category when data exists in Huawei Health.
- If a category cannot be synced, the app explains why using one of the defined reason classes:
  - Permission not granted
  - Device does not support measurement
  - Region/service availability limitation
  - Huawei Health settings/sync off
  - Data not present for time range
- The user can always see the last time the app successfully refreshed each category (or overall).

## Edge cases
- Users with only phone data (no watch) have fewer metrics; app stays useful.
- Users with intermittent connectivity get delayed/partial updates; app shows reduced confidence.
- Duplicate or overlapping records appear in Huawei Health; app should not show confusing duplicates (product requirement).

