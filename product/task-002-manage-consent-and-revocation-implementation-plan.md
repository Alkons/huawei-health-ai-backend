# Task 002 — Manage consent, permissions, and revocation — Implementation plan

## Goal
Implement the **backend portion** of consent management so a user can:
- View current Huawei connection + permissions in a user-friendly way
- **Narrow** what the app is allowed to use (stop reading/syncing certain categories immediately)
- **Expand** permissions later (requires Huawei re-authorization for additional scopes)
- **Fully disconnect** and optionally request deletion of previously imported data (per retention policy)
- Get a consistent, auditable record of consent changes and revocation events

## Scope mapping (what this plan covers)
- **Backend-in-scope**
  - Endpoints for “settings page” data: connection state, categories, last sync, freshness notes
  - Consent management operations:
    - Reduce categories (app-level disable + immediate effects messaging)
    - Add categories (creates re-authorization URL for Huawei flow)
    - Full disconnect (local disconnect + optional token revocation attempt)
  - Retention policy requirements:
    - A backend-returned user-readable statement (from config)
    - Optional delete request + auditable deletion workflow hooks
  - Detect revocation done on Huawei side and reflect state in our API
  - Consent history is **auditable** (append-only ledger + optional user-visible history endpoint)
- **Client-in-scope (as contract only)**
  - Renders settings screen and calls endpoints below
  - If user expands categories, client opens returned `authorizationUrl`
  - Presents effects/retention messaging returned by backend
- **Out of scope**
  - Sync implementation details (Task 003) beyond “last sync” + “freshness notes”
  - Final legal drafting of privacy policy text; backend stores references/versions/URLs only
  - Admin/support tooling UI

## Assumptions / decisions (so no hidden clog later)
- **Two layers of permission exist**
  - **Huawei-granted scopes**: what Huawei has authorized (from OAuth token `scope`).
  - **App-enabled categories**: what our app will actively sync/use. This can be narrowed **without** Huawei re-auth by stopping reads for certain categories, even if scopes still exist.
- **Reducing permissions**
  - We treat “reduce categories” as **immediate app behavior change** (stop reading/syncing those categories).
  - If product later requires “also revoke on Huawei side”, that is possible only via Huawei mechanisms (token revocation and/or re-authorization with reduced scopes). Plan supports both, but app-level reduction is the baseline.
- **Expanding permissions**
  - Adding categories that require new Huawei scopes **must** go through Huawei authorization again.
  - We keep least-privilege: requested categories → scopes mapping as in Task 001.
- **Disconnect**
  - “Full disconnect” disables integration locally immediately and removes our ability to sync.
  - We attempt provider token revocation if Huawei offers it (best-effort); regardless, we delete stored tokens from our DB.
- **Retention**
  - Task requires user-visible statement about historical data after revocation.
  - The actual “delete imported data” can be implemented as a background job; this plan defines API + events + data-model hooks so deletion is auditable even if data-domain purge lands in later tasks.

## Current code baseline (what already exists)
Existing endpoints under `v1/integrations/huawei`:
- `GET /connect-config`
- `POST /authorize`
- `GET /callback`
- `GET /status`
- `POST /disconnect`

Existing persistence:
- `HuaweiConnection` with `grantedCategories`, `grantedScopes`, `status`
- `HuaweiProviderToken`
- `HuaweiConsentLedgerEvent` (append-only audit events)
- `HuaweiOAuthState`

Task 002 adds **manage/modify/revoke** flows on top.

## Domain model updates (MongoDB + Mongoose)
Keep changes minimal and auditable.

### `HuaweiConnection` (extend)
Add fields to represent the “settings page” and app-level permission state:
- `enabledCategories: HuaweiConsentCategory[]`
  - Categories currently enabled for **our app usage**.
  - Default on connect: same as `grantedCategories`.
- `lastSyncAt?: Date`
  - Updated by Task 003 sync job (or left undefined until then).
- `dataFreshness?: { status: 'fresh' | 'stale' | 'unknown'; message: string }`
  - Computed/updated by sync logic; for Task 002 we can return `unknown` if no sync exists yet.
- `providerRevokedAt?: Date`
  - When we detect Huawei-side revocation / token invalidation.
- `providerRevocationReason?: 'tokenInvalid' | 'scopeReduced' | 'unknown'`

### `HuaweiConsentLedgerEvent` (extend event types)
Keep append-only ledger. Add new `eventType` values:
- `consent_updated` (user changed enabled categories)
- `permissions_reduced` (explicit subset reduction)
- `permissions_expanded_requested` (user asked for more categories; reauth needed)
- `disconnect_requested`
- `provider_revocation_detected`
- `data_deletion_requested`
- `data_deletion_completed`
- `data_deletion_failed`

Add optional metadata fields:
- `previousEnabledCategories?: HuaweiConsentCategory[]`
- `newEnabledCategories?: HuaweiConsentCategory[]`
- `deletionMode?: 'retain' | 'deleteImportedData'`
- `deletionRequestedAt?: Date`
- `deletionCompletedAt?: Date`
- `reasonClass?: string` (stable reason codes for UI)

## API design (REST, NestJS)
All endpoints require authenticated user (`JwtAuthGuard`), except provider callbacks if any.
Base path: `/v1/integrations/huawei`.

### 1) Settings page data (single “source of truth” endpoint)
**GET** `/v1/integrations/huawei/consent`

**Response**
- `provider: 'huawei'`
- `connection`:
  - `status: 'notConnected' | 'connected' | 'disconnected' | 'errored'`
  - `connectedAt?: string`
  - `lastSyncAt?: string`
  - `dataFreshness?: { status: 'fresh' | 'stale' | 'unknown'; message: string }`
- `permissions`:
  - `categories` (same list as connect-config, but with status):
    - `category`
    - `displayName`
    - `whyText`
    - `isGrantedByHuawei: boolean`
    - `isEnabledInApp: boolean`
    - `availabilityNotes: string[]`
  - `grantedCategories: HuaweiConsentCategory[]`
  - `enabledCategories: HuaweiConsentCategory[]`
- `effects`:
  - `categoryEffects`: map category → list of feature-impact strings (see below)
  - `limitedDataMessage?: string` (when enabled is subset / stale / revoked)
- `retention`:
  - `policySummary: string` (human-readable)
  - `choices`:
    - `retain`: { `label`, `description` }
    - `deleteImportedData`: { `label`, `description`, `isDestructive`: true }

Notes:
- This endpoint is what the settings page uses to render everything.
- It deliberately separates **granted vs enabled** to keep user control clear.

### 2) Update enabled categories (reduce immediately; expand triggers reauth)
**POST** `/v1/integrations/huawei/consent`

**Body**
- `enabledCategories: HuaweiConsentCategory[]`
- `consentUiVersion: string`
- `privacyPolicyVersion: string`
- `nonMedicalDisclaimerVersion: string`

**Behavior**
- Validate categories are known.
- Load current `HuaweiConnection`:
  - If not connected: return `409` with reason `notConnected`.
- Determine what user is asking:
  - **Reduction**: `enabledCategories` is subset of currently granted scopes/categories → update `enabledCategories` in DB immediately.
  - **Expansion**: contains categories that are not currently granted by Huawei → cannot enable yet.
    - Write ledger `permissions_expanded_requested`
    - Return `requiresReauthorization: true` with `authorizationUrl` created via existing `/authorize` logic (reusing code path), so client can run Huawei flow.
- Always write ledger event (`consent_updated`, plus specific reduced/expanded event).

**Response**
- If reduction success:
  - `{ updated: true, requiresReauthorization: false, enabledCategories, effects: ... }`
- If expansion requested:
  - `{ updated: false, requiresReauthorization: true, authorizationUrl, pendingEnabledCategories, effectsPreview: ... }`

### 3) Disconnect (full revoke locally) + optional data deletion request
Replace the current simplistic disconnect with a richer shape, keeping backward compatibility if needed.

**POST** `/v1/integrations/huawei/disconnect`

**Body**
- `deletionMode: 'retain' | 'deleteImportedData'`
- `consentUiVersion: string`
- `privacyPolicyVersion: string`
- `nonMedicalDisclaimerVersion: string`

**Behavior**
- Mark `HuaweiConnection.status = 'disconnected'`
- Clear `enabledCategories = []`
- Delete tokens:
  - Remove `HuaweiProviderToken` record (and/or null out refresh token)
  - Best-effort call to Huawei token revocation endpoint if supported (do not block disconnect on this)
- Write ledger:
  - `disconnect_requested`
  - If `deleteImportedData`, also `data_deletion_requested` and enqueue deletion job (see below)

**Response**
- `{ disconnected: true, deletionMode, deletionJobId?: string }`

### 4) Consent history (user-visible audit trail)
**GET** `/v1/integrations/huawei/consent/history?limit=50&cursor=...`

**Response**
- `events: Array<{ occurredAt, eventType, previousEnabledCategories?, newEnabledCategories?, deletionMode?, correlationId }>`

Note:
- The product requirement says “auditable”; exposing to user is optional but strongly helpful for trust/compliance.
- If you prefer not to expose full detail, return a minimal subset.

### 5) Provider revocation detection hook (internal)
No new public endpoint required; implement in services used by Task 003 sync + token refresh.

When we detect:
- `401/403` from Huawei API
- refresh token invalid/expired

We do:
- Update `HuaweiConnection.status = 'disconnected'` (or `errored`, depending on reason)
- Set `providerRevokedAt = now`
- Write ledger `provider_revocation_detected`
- Return `status` + `limitedDataMessage` via `GET /consent`

## Effects messaging (category → feature impacts)
Backend provides stable strings the client can display under each toggle.
Example mapping:
- `activity`: “Daily trends may be incomplete. Consistency coaching will be limited.”
- `workouts`: “Workout feedback and training load will be limited.”
- `sleep`: “Recovery guidance and sleep trends will be limited.”
- `heartSignals`: “Intensity tuning and recovery signals will be limited.”
- `spo2`: “Recovery context from SpO2 will be unavailable.”
- `selectedRecords`: “Some structured records and insights will be unavailable.”

Implementation detail:
- Keep this mapping in one place (same module as consent category config).
- Do not hardcode feature names that do not exist yet; keep generic but clear.

## Retention policy (requirements + implementation hook)
Task requires a consistent user-readable statement about historical data after revocation.

### Backend responsibility
- Return a `policySummary` string and choice descriptions from config (not from `.env` directly).
- Record user choice on disconnect in ledger.

### Deletion workflow hook
If `deletionMode = deleteImportedData`:
- Enqueue a job (Bull/Redis or existing queue) `DeleteHuaweiImportedDataJob` with `userId`.
- Job should:
  - Delete all Huawei-derived stored data for this user (tables/collections owned by sync module)
  - Delete derived features/AI outputs that are based on Huawei data if policy demands it
  - Emit ledger `data_deletion_completed` or `data_deletion_failed`

Note:
- Actual data collections are mostly owned by Task 003+. This plan defines the contract and audit trail now, so later code just plugs into this “drain valve”.

## NestJS module breakdown (minimal, feature-module)
Extend existing `HuaweiModule` without over-refactor:
- `HuaweiController`
  - Add:
    - `GET /consent`
    - `POST /consent`
    - `GET /consent/history`
  - Update:
    - `POST /disconnect` to accept new body (keep old response keys stable)
- `HuaweiService`
  - Add methods:
    - `getConsentSettings(userId)`
    - `updateEnabledCategories(userId, dto)`
    - `getConsentHistory(userId, pagination)`
    - `disconnect(userId, dto)` (extended)
  - Add helpers:
    - `computeCategoryEffects()`
    - `computeRetentionPolicy()`
    - `classifyRevocationFromError()` (used by sync later)

If module starts getting fat, split into small services (only if needed):
- `HuaweiConsentSettingsService` (read model for settings page)
- `HuaweiConsentUpdateService` (write paths + ledger)
- `HuaweiRetentionService` (disconnect + delete request)

## Security checklist (tight pipes, no leaks)
- Ensure only authenticated user can read/modify their consent.
- Validate requested categories are from canonical enum.
- Never log access/refresh tokens. Log only correlation ids.
- Rate-limit “update consent” and “disconnect” endpoints to prevent abuse.
- Ensure deletion job is idempotent and cannot delete other users’ data.
- Record all consent-altering actions in the ledger (auditable).

## Observability (Logger + audit)
- Log:
  - consent read (optional, usually skip to reduce noise)
  - consent updated (userId, old/new enabled categories, correlationId)
  - disconnect requested (deletionMode, correlationId)
  - provider revocation detected (reason, correlationId)
- Ledger is the canonical audit trail.

## Test plan (TDD-style, must cover new changes)
Unit tests:
- `GET /consent` response shape:
  - notConnected returns correct defaults
  - connected includes granted/enabled mapping
- Consent update:
  - reduction updates enabled categories immediately and writes ledger
  - expansion returns `requiresReauthorization` and does **not** enable categories prematurely
- Disconnect:
  - marks disconnected, clears enabled categories, deletes token record, writes ledger
  - deletionMode `deleteImportedData` writes `data_deletion_requested` and enqueues job (mock queue)
- Revocation detection classifier:
  - maps invalid refresh / 401 to provider revocation state and ledger event

Integration tests (HTTP):
- `POST /consent` reduction flow end-to-end (DB updated)
- `POST /consent` expansion flow returns `authorizationUrl`
- `POST /disconnect` records ledger and token deletion

## Acceptance criteria mapping (how we prove no clog)
- **Disconnect inside app**: `POST /disconnect` works and `GET /consent` shows `disconnected`.
- **Narrow permissions + immediate effects**: `POST /consent` reduction updates enabled categories and `GET /consent` returns clear effects strings.
- **Retention policy statement**: `GET /consent` returns `retention.policySummary` and choices; disconnect stores choice in ledger.
- **Huawei-side revocation**: simulated token invalidation sets state and is reflected via `GET /consent`.

## Deliverable file checklist (this task)
- This plan file exists next to task:
  - `product/task-002-manage-consent-and-revocation-implementation-plan.md`
- It captures: endpoints, data model, retention/deletion hook, revocation detection, security, observability, and tests.

