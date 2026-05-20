# Task 005 — Health dashboard, history, and trends

## Summary
Provide a user-facing dashboard that summarizes key health and training signals and their recent trends, grounded in synced Huawei Health data.

## User story
As a **user**, I want a **single place to view my activity, sleep, and key health signals over time**, so I can understand patterns and make better training/recovery choices.

## In scope
- Dashboard requirements covering:
  - Today/this week summary cards (steps, activity time, workouts, sleep, heart metrics, SpO2 where available)
  - Trend views (7/14/30 day) for supported metrics
  - Drill-down timelines for workouts and sleep sessions
- “Data source” transparency:
  - Indicate data comes from Huawei Health
  - Show limitations when categories are incomplete or unavailable

## Out of scope
- Diagnosing conditions based on trends
- Custom charting features beyond defined core views

## Deliverables
- A defined set of dashboard cards and required data for each (product definition).
- A defined set of trend charts and supported time windows.
- Copy requirements for:
  - “No data” states
  - “Limited data” states
  - “Not supported / not permitted” states

## Acceptance criteria
- Users can see at least:
  - A daily/weekly activity summary
  - Recent workouts list
  - Recent sleep summary
  - At least one heart-related metric summary where supported
- Trend charts do not appear if the metric is unsupported or permission is missing; instead the UI shows the correct explanation and a path to fix (grant permission, connect watch, etc.).

## Edge cases
- Users with sparse history still see meaningful summaries without empty dashboards.
- Metrics recorded in Huawei Health with gaps do not produce misleading trend lines (product requirement: communicate gaps).

