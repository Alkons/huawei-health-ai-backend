# Task 004 — Data freshness, completeness, and confidence UX

## Summary
Make data reliability visible. Users should understand when insights are based on fresh, complete data versus partial or delayed sync.

## User story
As a **user**, I want to know **how fresh and complete my synced data is**, so I can trust the coaching and understand when the app might be missing information.

## In scope
- Definitions and UX requirements for:
  - “Last sync” timestamp (per category and overall)
  - “Freshness” state (fresh / delayed / stale / unknown)
  - “Completeness” state for a time window (complete / partial / none)
  - “Confidence” indicator for AI coaching (high / medium / low) derived from freshness + completeness
- Clear user guidance:
  - What the user can do to improve freshness (e.g., open Huawei Health and trigger sync, check device connectivity)

## Out of scope
- Backend calculations of completeness percentages (this task defines product behavior only)

## Deliverables
- A set of **reason codes** and user-facing messages for common sync problems.
- UX content requirements for:
  - Banner/toast when data is stale
  - Per-metric “delayed data” hints
  - AI feedback disclaimer when confidence is low

## Acceptance criteria
- Every screen showing synced metrics includes a “Last updated” indicator (directly or via drill-in).
- When confidence is low, AI feedback explicitly states it is based on incomplete/delayed data and suggests next steps.
- The product never presents missing data as “you did nothing” without checking completeness.

## Edge cases
- Huawei sends event notifications but actual data is not yet available; app shows “pending update” state.
- User changes timezone; dates still display coherently and explanations remain correct.

