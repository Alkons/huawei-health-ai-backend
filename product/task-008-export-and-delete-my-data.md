# Task 008 — Export and delete my data (portability & erasure)

## Summary
Support user data rights by providing self-serve export and deletion of data the product stores, including AI outputs derived from health data.

## User story
As a **user**, I want to **export my data** and **delete my data**, so I can control my personal health information and leave the service safely.

## In scope
- Export requirements:
  - Export includes: synced normalized metrics, workouts, sleep summaries, and generated coaching outputs
  - Export format requirements (human-readable + machine-readable)
  - Estimated time and delivery mechanism (download link, email, etc.) as product behavior
- Deletion requirements:
  - Full account deletion and associated data removal
  - Clear explanation of what is deleted and what is retained (if any) and why
- Confirmation and safety UX:
  - Multi-step confirmation for deletion
  - Inform user of loss of history and coaching

## Out of scope
- Forcing deletion from Huawei Health itself (we can only delete what we store; Huawei-side data is controlled by Huawei and user settings)

## Deliverables
- UX/content requirements for:
  - Export request
  - Export ready notification
  - Delete account flow
- A product definition of exported fields/categories (high-level).
- A product definition of deletion completion criteria and user confirmation messaging.

## Acceptance criteria
- User can request export and receive a downloadable package containing their synced data and coaching outputs for the requested time range.
- User can delete their account and see an explicit completion message.
- The product clearly distinguishes between:
  - Data stored by this product (exportable/deletable)
  - Data stored in Huawei Health (outside our control)

## Edge cases
- Export requested while sync is in progress; export indicates cutoff time and freshness.
- User deletes account while an export is pending; product defines expected outcome (cancel or complete with warning).

