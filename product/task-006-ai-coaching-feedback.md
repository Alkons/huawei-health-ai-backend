# Task 006 — AI coaching feedback (grounded, structured, safe)

## Summary

Generate user-facing coaching based on synchronized signals, with explicit grounding, structured output, and safety constraints (non-medical).

## User story

As a **user**, I want **clear coaching feedback about my training and recovery**, based on my recent data, so I know what to do next without reading raw charts.

## In scope

- Coaching domains:
  - Training adherence and load (based on activity + workouts)
  - Recovery guidance (sleep + heart signals; SpO2 where appropriate)
  - Simple goal alignment (e.g., consistency, endurance, general fitness)
- Output requirements:
  - Short summary
  - Positive signals and concerns (grounded in data)
  - Concrete, safe next actions (wellness/training)
  - Follow-up questions when data is missing or ambiguous
  - “Confidence” level tied to freshness/completeness
  - Non-medical disclaimer
- Grounding requirements:
  - Feedback must only reference metrics that are actually present in the user’s data window.

## Out of scope

- Diagnosis, treatment advice, medication recommendations, emergency guidance beyond “seek professional care”.
- Free-form “chat about anything” assistant.

## Deliverables

- A coaching response schema (fields and meanings), including required disclaimers.
- A defined set of coaching scenarios:
  - High training load + reduced sleep trend
  - Improved sleep + stable activity
  - Missing data / low confidence
  - New user with limited history
- User-facing explanations of what the AI can and cannot do.

## Acceptance criteria

- Coaching always includes a non-medical disclaimer.
- Coaching never claims certainty about health conditions.
- When confidence is low or data is missing, coaching says so and suggests actions to improve data quality (connect device, sync Huawei Health, grant permission).
- Coaching never mentions metrics that are absent from the underlying synced dataset for the referenced period.

## Safety triggers (product requirements)

When the user’s data includes records that indicate potential abnormality (e.g., low SpO2 record types where supported), the coaching must:

- Switch to a cautious tone
- Avoid interpretation beyond acknowledging the record exists
- Recommend appropriate professional care if relevant

# Technical requirements

- Use the OpenAI compatible AI provider.
- Use structured output to generate the coaching feedback.

