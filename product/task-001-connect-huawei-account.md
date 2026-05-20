# Task 001 — Connect Huawei account & grant consent

## Summary
Enable a user to connect their Huawei account, grant explicit scopes/permissions for selected health categories, and confirm the connection succeeded.

## User story
As a **user**, I want to **connect my Huawei Health data** to the app and **choose what I share**, so I can receive coaching while staying in control of my privacy.

## Primary users
- End users who have Huawei Health data (phone and/or watch)

## In scope
- A connect flow that:
  - Initiates Huawei sign-in/authorization
  - Explains what data is requested and why (per category)
  - Confirms success with a clear “Connected” state
- Consent display requirements:
  - Show categories (activity, workouts, sleep, heart signals, SpO2, selected records)
  - Show how to change/revoke later
  - Link to privacy policy and non-medical disclaimer
- Post-connection confirmation requirements:
  - Show when first data is expected
  - Show any immediate detected blockers (e.g., missing Huawei Health app linkage)

## Out of scope
- Implementation/architecture decisions (server vs client handling details)
- Supporting non-Huawei providers (Apple Health, Google Fit, etc.)

## Deliverables
- UX/content requirements for:
  - Pre-consent screen
  - Consent category selection screen (or equivalent)
  - Connection success screen
  - Connection failure screen with user-actionable guidance
- Permission taxonomy requirements:
  - Categories of data requested
  - Required “why” text per category
- Audit requirements:
  - Record that consent was shown and accepted (product requirement; no storage design)

## Acceptance criteria
- User can connect using Huawei authorization and see a durable “Connected” status.
- User sees a clear list of requested data categories, each with a plain-language purpose.
- User can proceed with minimal required permissions or grant additional categories intentionally.
- If connection fails, the user sees a reason class and next steps (retry, check app settings, region, etc.).

## Privacy / compliance requirements
- Consent must be explicit, granular, and revocable.
- The product must not request “all health data” by default; requests must match the user-visible feature needs.

## Edge cases
- User denies consent for one or more categories.
- User is connected but no data appears yet due to sync delay.
- Huawei service not available in user region.
- User account exists but is not eligible for certain data categories (tier/approval constraints).

