# Task 007 — Advanced health records & eligibility (tier/device/region)

## Summary
Expand beyond MVP by supporting additional Huawei Health record types when eligible, while making eligibility constraints explicit to users.

## User story
As a **user**, I want the app to support **additional Huawei health records** (when my device and region support them), so I can get deeper insights without confusion when something isn’t available.

## In scope
- Product requirements for “advanced records” support where available:
  - Examples from Huawei categories: sleep breathing records, tachycardia/bradycardia records, ABPM reports, high body temperature records, VO2 max, running form, etc.
- Eligibility transparency:
  - Some record types may require enterprise-level developer access or specific approvals
  - Some may require watch linkage or specific device capabilities
  - Region availability may vary
- UX requirements:
  - Show “Eligible / Not eligible” and why
  - Offer next steps when user action can help (connect watch, enable measurement)

## Out of scope
- Guaranteeing all record types are supported on all users (not possible)

## Deliverables
- A catalog of supported advanced record types (product list; final list can evolve).
- Per-record “eligibility reasons” taxonomy and user-friendly messaging.
- UX requirements for surfacing advanced records (where they appear in the product).

## Acceptance criteria
- Advanced record surfaces never appear “broken”; they show eligibility status and reason.
- The product does not promise advanced records universally.
- Users can understand which constraints are due to:
  - Missing permission
  - Missing device capability / watch linkage
  - Region/service availability
  - Developer eligibility/tier constraints

