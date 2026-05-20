# Task 010 — Privacy, security, and auditability (product requirements)

## Summary
Define product requirements for handling sensitive health data safely: minimum necessary data, clear consent, auditability, and secure operations posture.

## User story
As a **user**, I want to trust that the product **protects my health data**, uses it only for stated purposes, and provides transparency and control.

## In scope
- Data minimization requirements:
  - Only request permissions needed for user-visible features
  - Only process/store what is necessary for those features
- Auditability requirements:
  - Maintain an auditable record of consent grants and changes (user-visible summary + internal audit requirement)
- Security posture requirements (product-level, not implementation):
  - Strong account protections
  - No sensitive tokens or raw health history exposed in logs or support views
  - Principle of least privilege for internal access
- AI privacy constraints:
  - AI inputs must be bounded to necessary features; avoid sending raw, excessive health history by default

## Out of scope
- Legal compliance documentation creation (DPIA, RoPA) as final artifacts
- Specific cryptography/KMS selections

## Deliverables
- A set of privacy/security non-functional requirements (NFRs) suitable for acceptance testing.
- A product requirement for user-facing transparency:
  - What data categories we store
  - Why we store them
  - How long we retain them (must align with policy)
- A product requirement for breach/user incident communication expectations (high-level).

## Acceptance criteria
- Users can see what they’ve consented to and change/revoke it easily.
- Product surfaces never leak sensitive secrets (tokens) to user-visible screens or logs.
- AI features operate on the minimum necessary data and are bounded to wellness coaching.

