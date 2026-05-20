# Task 000 — Product scope & promises (Huawei Health integration)

## Summary
Define clear, user-facing product promises and constraints for “Huawei Health sync + AI coaching” so we do not overpromise “all data” and we remain compliant and trustworthy.

## User story
As a **user evaluating the product**, I want to understand **what data the app can and cannot access**, **what the AI will and will not do**, and **what conditions may prevent data from appearing**, so I can decide whether to connect my Huawei Health account.

## Problem / context
Huawei Health does not expose “everything in the Huawei Health app” to third-party apps. Availability depends on:
- User consent scopes granted
- Huawei developer approval tier (individual vs enterprise)
- Device support (phone vs watch), user settings, and region availability
- Sync freshness (wearable connectivity + Huawei Health cloud sync)

## In scope
- Product promise phrasing that matches Huawei public openness: “everything Huawei Health Service Kit publicly opens for this user/device/approval tier”.
- Explicit statements of expected constraints (region, device support, user settings, staleness).
- Clear wellness framing: AI is coaching/explanatory, not medical diagnosis.
- Terminology for “data freshness” and “confidence” that is user-friendly.

## Out of scope
- Legal doc drafting (privacy policy, ToS) as final text (this task defines product requirements only).
- Implementation details (OAuth flows, storage, scheduling, queues).

## Deliverables
- A **Product Promise statement** suitable for marketing and onboarding screens.
- A **Capabilities matrix** (high-level) listing:
  - Data categories supported (activity, workouts, sleep, heart signals, SpO2, selected records)
  - Conditions and known limitations per category (where relevant)
  - Whether it requires watch linkage / extra permission
- A **Non-medical disclaimer** text requirement (short + link to full).
- A **Freshness/availability disclosure** requirement for UI surfaces that show data.

## Acceptance criteria
- The product does **not** claim “sync all Huawei data” without qualification.
- Each key capability has an accompanying “depends on…” note when it can fail due to user/device/region/tier.
- AI is explicitly framed as **wellness/training coaching**, not diagnosis or treatment advice.
- The user can understand, before connecting, that some data may be unavailable or delayed.

## Assumptions / dependencies
- We will operate as a wellness/training application (not a regulated medical device).
- The product may require a companion client for sign-in/consent depending on Huawei flow requirements.

## Edge cases to cover in requirements
- User has Huawei Health installed but cloud sync is off or delayed.
- User is in a region where the service is not fully available.
- User’s device does not measure a metric (e.g., SpO2) or measurement is disabled.
- Developer tier does not allow certain advanced health record types.

