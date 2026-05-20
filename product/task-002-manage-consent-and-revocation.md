# Task 002 — Manage consent, permissions, and revocation

## Summary
Let users view, modify, and revoke their Huawei data permissions and understand how those choices affect features.

## User story
As a **user**, I want to **see what data I’ve shared**, **change permissions**, or **disconnect entirely**, so I can control my health data and stop syncing if I choose.

## In scope
- A settings page that shows:
  - Connection state
  - Granted categories/scopes (mapped to user-friendly categories)
  - “Last sync” and data freshness notes
- Permission change requirements:
  - Add more categories later
  - Reduce categories (stop reading certain data)
  - Full disconnect
- Clear effects messaging:
  - Which app features will degrade/disable when a category is removed
  - What happens to previously imported/synced data (retention policy requirements)

## Out of scope
- Writing data back into Huawei Health
- Admin/support tooling (covered elsewhere)

## Deliverables
- UX/content requirements for permission management surfaces
- A user-visible retention policy requirement:
  - What is deleted immediately vs retained (must be consistent with privacy policy)
- A disconnect confirmation flow requirement:
  - Warn about loss of insights/history if deletion is chosen

## Acceptance criteria
- User can disconnect Huawei integration from within the app.
- User can narrow permissions and sees immediate, understandable effects on available insights.
- The app surfaces a consistent, user-readable statement about stored historical data after revocation.

## Privacy / compliance requirements
- Revocation must be easy to find and complete.
- Consent history must be auditable (product requirement).

## Edge cases
- User revokes consent on Huawei side; app must reflect disconnected/limited state.
- Partial permissions lead to partial features with clear “limited data” messaging.

