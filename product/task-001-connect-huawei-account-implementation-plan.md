# Task 001 — Connect Huawei account & grant consent — Implementation plan

## Goal
Implement the **backend portion** of “Connect Huawei account” so a user can initiate Huawei authorization, record **explicit/granular consent** (by category), and obtain a durable **Connected** state with actionable post-connect status (expected first data time + immediate blockers).

## Scope mapping (what this plan covers)
- **Backend-in-scope**
  - Authorization initiation metadata (scopes/categories, “why” text, links) that the client renders
  - OAuth callback handling on server (state validation, code exchange, token storage)
  - Consent ledger + audit event that consent was shown and accepted
  - “Connected” durable status endpoint and immediate blocker detection
  - Error classification for failure screen guidance
- **Client-in-scope (as contract only)**
  - The client must show screens per Task 001 deliverables and call the backend endpoints below
  - The client performs the actual browser/app redirect to Huawei auth URL
- **Out of scope**
  - Any Huawei data sync implementation (belongs to Task 003+)
  - Final legal text drafting (privacy policy / disclaimer copy). Backend only stores references (version/URL) and returns configured links.

## Assumptions / decisions (explicit, so no hidden “clog” later)
- **Auth orchestration (what is and is not possible)**:
  - **Not possible**: a *pure backend-only* flow where the user never leaves the app and the backend “does consent for them”. Huawei requires the **user** to authenticate and approve scopes in Huawei-controlled UI (browser/app WebView) and the backend cannot legally/technically bypass this.
  - **What we can do**: backend owns the whole orchestration and security-sensitive parts (state, scope construction, consent ledger, **code → tokens** exchange, refresh-token storage) while the client does only one thing: **open the `authorizationUrl`** for the user and later show the result screen.
  - **Reason**: the token exchange needs the client secret and belongs on server (`product/spec.md`), but the consent UI must be shown to user by Huawei.
- **Granular consent**: user selects **categories** in our UI; we translate categories → Huawei scopes and request only selected scopes (least privilege).
- **Identity**: app user is already authenticated to our backend (session/JWT) before connecting Huawei.
- **Token security**: refresh token stored encrypted-at-rest (envelope encryption service already exists or will be created in auth module).
- **Region availability**: we cannot know availability perfectly without Huawei responses; we implement **best-effort blocker detection** and expose it as “may be” guidance.

## Permission taxonomy (backend canonical)
Backend keeps a stable category enum used across API, audit, and sync planning.

### Categories to support (from Task 001)
- `activity` (daily activity: steps, calories, distance, intensity)
- `workouts` (exercise/activity records)
- `sleep` (sleep sampling + sleep records)
- `heartSignals` (heart rate, resting HR, HRV where allowed)
- `spo2` (SpO2 sampling + low-SpO2 records where allowed)
- `selectedRecords` (subset of health records; exact set is approval-tier dependent)

### Category → scope mapping
Maintain mapping in code (config-driven but not “over-flexible”):
- Example shape:
  - `activity` → `HEALTHKIT_STEP_READ`, `HEALTHKIT_CALORIES_READ`, `HEALTHKIT_DISTANCE_READ` (exact list depends on Huawei openness tier)
  - `workouts` → `HEALTHKIT_ACTIVITY_RECORD_READ`
  - `sleep` → `HEALTHKIT_SLEEP_READ`
  - `heartSignals` → `HEALTHKIT_HEARTRATE_READ` (+ optional HRV scope)
  - `spo2` → `HEALTHKIT_PULMONARY_READ` / SpO2 scope if distinct
  - `selectedRecords` → record-specific read scopes
- Store the resulting scope string we actually requested and the scope string Huawei returned.

### “Why” text per category
Backend returns per-category plain-language rationale strings (client renders). Keep them short and feature-linked:
- `activity`: trends, consistency, adherence coaching
- `workouts`: training load, workout feedback, plan suggestions
- `sleep`: recovery guidance, sleep trend coaching
- `heartSignals`: intensity tuning, recovery signals, overreaching warnings (non-medical)
- `spo2`: recovery context and altitude/sleep quality context (non-medical)
- `selectedRecords`: surface specific insights where available; always “may be unavailable by device/region/tier”

## API design (REST, NestJS)
All endpoints require authenticated app user.

### 1) Get connect screen configuration
**GET** `/v1/integrations/huawei/connect-config`
- **Response**
  - `provider`: `"huawei"`
  - `categories`: list of category objects:
    - `category`: enum
    - `displayName`
    - `whyText`
    - `isRecommended`: boolean
    - `isOptional`: boolean (all are optional; app may enforce a minimum set)
    - `availabilityNotes`: array of strings (device/region/tier/freshness caveats)
  - `links`:
    - `privacyPolicyUrl`
    - `nonMedicalDisclaimerUrl`
    - `manageConsentUrl` (deep link to app settings screen)

### 2) Initiate Huawei authorization
**POST** `/v1/integrations/huawei/authorize`
- **Body**
  - `requestedCategories: HuaweiConsentCategory[]`
  - `clientRedirectUrl: string` (where client wants to go after connection completion in app UI)
  - `consentShownAt: string` (ISO) (client asserts the consent screen was shown)
  - `consentUiVersion: string` (so audits can say what user saw)
  - `privacyPolicyVersion: string`
  - `nonMedicalDisclaimerVersion: string`
- **Behavior**
  - Validate categories are known; enforce “not empty” only if product wants minimum (default allow empty? but Task says minimal required permissions possible, so define a minimal set and allow user to choose that).
  - Create `oauth_state` record with:
    - `state`, `codeVerifier` (PKCE if used), `requestedScopes`, `requestedCategories`, `clientRedirectUrl`
    - `consentShownAt`, `consentUiVersion`, `privacyPolicyVersion`, `nonMedicalDisclaimerVersion`
    - `expiresAt` (short TTL)
  - Return `authorizationUrl` to Huawei authorize endpoint with `state` (and PKCE if applicable).
- **Response**
  - `authorizationUrl: string`
  - `stateId: string` (internal correlation id for support, not secret)

### 3) OAuth callback (server endpoint)
**GET** `/v1/integrations/huawei/callback?code=...&state=...`
- **Behavior**
  - Validate `state` exists, not expired, belongs to same app user session if possible (or use one-time state bound to user id).
  - Exchange `code` for tokens at Huawei token endpoint (server-side).
  - Persist provider identity (e.g., Huawei `sub`) and encrypted refresh token.
  - Write consent ledger (see data model) using the metadata saved at authorize step.
  - Mark connection as `connected`.
  - Redirect user to `clientRedirectUrl` with connection result (success/failure + correlation id).

### 4) Connection status (durable “Connected” state)
**GET** `/v1/integrations/huawei/status`
- **Response**
  - `status`: `notConnected | connecting | connected | errored`
  - `connectedAt?: string`
  - `grantedCategories?: HuaweiConsentCategory[]`
  - `firstDataExpectedAt?: string` (heuristic, see below)
  - `blockers?: HuaweiConnectionBlocker[]`
  - `nextActions?: string[]` (for UI failure/success screens)

### 5) Disconnect / revoke (backend side only; Huawei-side revoke handled in Task 002)
**POST** `/v1/integrations/huawei/disconnect`
- Marks local connection disabled, schedules token revocation (or immediate if implemented), records audit event.

## Data model (MongoDB + Mongoose, minimal but auditable)
This task needs **durable status** and **consent audit**.

### Collections
- `HuaweiConnection`
  - `userId: ObjectId`
  - `providerUserId: string` (Huawei subject)
  - `status: 'connected' | 'errored' | 'disconnected'`
  - `connectedAt: Date`
  - `lastErrorCode?: string`
  - `lastErrorAt?: Date`
  - `grantedScopes: string[]`
  - `grantedCategories: HuaweiConsentCategory[]`
  - `tokenRefId: ObjectId` (ref to token doc)
- `OAuthState`
  - `userId`
  - `state: string` (unique)
  - `requestedCategories: HuaweiConsentCategory[]`
  - `requestedScopes: string[]`
  - `clientRedirectUrl: string`
  - `consentShownAt: Date`
  - `consentUiVersion: string`
  - `privacyPolicyVersion: string`
  - `nonMedicalDisclaimerVersion: string`
  - `expiresAt: Date` (TTL index)
- `ProviderToken` (generic or Huawei-specific)
  - `userId`
  - `provider: 'huawei'`
  - `accessToken: string` (short-lived; store if needed for immediate calls)
  - `accessTokenExpiresAt: Date`
  - `refreshTokenEncrypted: string`
  - `scope: string` (as returned)
- `ConsentLedgerEvent` (append-only)
  - `userId`
  - `provider: 'huawei'`
  - `eventType: 'consent_shown' | 'consent_accepted' | 'consent_denied' | 'disconnect'`
  - `occurredAt: Date`
  - `requestedCategories: HuaweiConsentCategory[]`
  - `requestedScopes: string[]`
  - `grantedCategories?: HuaweiConsentCategory[]`
  - `grantedScopes?: string[]`
  - `consentUiVersion: string`
  - `privacyPolicyVersion: string`
  - `nonMedicalDisclaimerVersion: string`
  - `correlationId: string`

## Blocker detection (post-connection “what might be wrong”)
We provide immediate guidance without starting full sync:
- `missingHuaweiHealthLinkage`: if Huawei scope `HEALTHKIT_HUAWEIHEALTH_LINK` is required for watch data categories but not granted/available.
- `regionUnsupported`: inferred from Huawei error codes during token exchange or later basic API call.
- `noDataYetExpected`: if connected just now; set `firstDataExpectedAt = now + 15..60 minutes` with text “sync may take time”.
- `insufficientScopes`: if user selected categories but Huawei returned narrower scopes.
- `developerTierLimit`: if Huawei returns “not authorized for this scope/data type”.

Implementation detail: after token exchange, do one lightweight call (if available) like Huawei `/healthkit/v2/user` to validate token works; classify errors. Do **not** fetch health data here.

## Error handling & reason classes (for failure screen)
Backend returns a stable `reasonClass` so client can show actionable next steps:
- `userCancelled` (user closed Huawei flow / denied)
- `consentDenied` (explicit deny)
- `invalidState` (CSRF/state mismatch)
- `oauthCodeExpired` (code too old)
- `invalidClient` (misconfigured client id/secret/redirect)
- `regionUnsupported`
- `serviceUnavailable`
- `rateLimited`
- `unknown`

Each reason class maps to `nextActions` strings:
- retry
- check Huawei Health app is installed and logged in
- check Health Service Kit / permissions in Huawei Health
- check region availability
- contact support with correlation id

## Observability (Logger + audit)
- Log important events with `Logger` (no tokens, no raw OAuth responses):
  - authorize initiated (userId, categories, correlationId)
  - callback success (userId, grantedCategories, correlationId)
  - callback failure (reasonClass, correlationId)
- Always write `ConsentLedgerEvent` for:
  - consent shown (on authorize request)
  - consent accepted or denied (on callback)
  - disconnect

## Security checklist (tight pipes, no leaks)
- State validation mandatory; one-time use state; TTL expiry.
- Redirect allowlist: validate `clientRedirectUrl` against configured allowed origins/schemes.
- Encrypt refresh tokens; never log tokens.
- Rate-limit authorize/callback endpoints per user/IP.
- Store minimal PII: only Huawei subject + consent metadata.

## NestJS module breakdown (minimal, feature-module)
- `IntegrationsHuaweiModule`
  - `HuaweiAuthController` (authorize, callback)
  - `HuaweiStatusController` (status, disconnect)
  - `HuaweiAuthService` (state creation, code exchange, token persist)
  - `HuaweiConsentService` (category→scope mapping, ledger writes)
  - `HuaweiBlockerService` (post-connect lightweight validation)
  - `HuaweiHttpClient` (typed wrapper around Huawei endpoints used here)
- Shared
  - `CryptoService` (envelope encryption)
  - `Clock`/`DateProvider` (testable time)

## Test plan (TDD-style, must cover new changes)
Unit tests:
- Category→scope mapping:
  - returns minimal scope set for minimal categories
  - does not include unselected categories
- OAuth state:
  - creates state with TTL
  - rejects expired/unknown state
  - enforces one-time use
- Callback:
  - success path writes `HuaweiConnection` as connected + ledger accepted
  - failure path writes ledger denied/failed with reasonClass
- Blocker classification:
  - maps Huawei error to `regionUnsupported`, `invalidClient`, etc.

Integration tests (HTTP layer, mocked Huawei):
- `POST /authorize` returns authorization URL with state persisted
- `GET /callback` exchanges code (mock) and redirects with success
- `GET /status` returns durable connected state after callback

## Acceptance criteria mapping (how we prove no clog)
- **Durable connected state**: `GET /status` returns `connected` after callback, survives restart.
- **Clear list of categories + purpose**: `GET /connect-config` returns categories with `whyText`.
- **Minimal vs additional categories**: `/authorize` accepts a minimal subset; stores exactly what user selected.
- **Failure reason class + next steps**: callback failure returns redirect with `reasonClass`, `correlationId`, and `/status` shows `errored` + `nextActions`.

## Deliverable file checklist (this task)
- This plan file exists next to task: `product/task-001-connect-huawei-account-implementation-plan.md`
- It captures: endpoints, consent ledger, blocker detection, error classes, tests, observability, security.

