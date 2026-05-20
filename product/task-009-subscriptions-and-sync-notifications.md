# Task 009 — Sync notifications & background updates (subscriptions where supported)

## Summary
Keep user data up to date by reacting to Huawei change events where possible, while transparently handling cases where polling or delayed availability is required.

## User story
As a **user**, I want the app to **update soon after my Huawei Health data changes**, so dashboards and coaching reflect my recent activity without me manually refreshing.

## In scope
- Product behavior requirements:
  - The app updates data after new workouts/sleep/activity appear in Huawei Health
  - The app can show “Update pending” when notified but data is not yet available
- Notification policy requirements:
  - Whether the product sends user-facing notifications (push/email/in-app) for “new coaching available”
  - Rate limiting to avoid spam
- Transparency requirements:
  - Explain that some data types update via event hints and others via periodic refresh

## Out of scope
- Implementation details of subscription endpoints, verification, retries

## Deliverables
- A list of events that should trigger background refresh (product-level).
- UX requirements for:
  - In-app “syncing” indicator
  - Optional “new insights available” notification
  - Sync error states and next steps

## Acceptance criteria
- When a user completes a workout and Huawei Health syncs it, the app updates within a defined “expected window” and shows clear staleness messaging if it cannot.
- The product does not promise “real-time” updates without qualification.

## Edge cases
- Huawei indicates a change, but cloud data remains delayed; product shows “pending” rather than incorrect data.
- Users with disabled notifications still see updates in-app.

