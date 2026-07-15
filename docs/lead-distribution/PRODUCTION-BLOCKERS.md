# Production Blocker Register

Primary source of truth for the native lead distribution platform (v2). Verification date:
2026-07-15. Branch: `integration/native-lead-distribution-v2` (from `main` @ `7ac2a41`).

Status values: OPEN, IN-PROGRESS, CLOSED (acceptance proven), INVALID (verified not a problem),
BLOCKED-ON-CREDENTIALS, NEEDS-ENV, AWAITING-APPROVAL. A blocker closes ONLY when its acceptance
criteria are proven with evidence, never because code was written.

## Phase 0 ground-truth findings (evidence)
- GT-1 Live sync: The live Base44 app (6a4957e7b03e9b10c170d29e) has ZERO of the v1 entities
  (RouteGroup..RouteDecisionTrace all absent via list_entity_schemas). `origin/main` does not
  contain the v1 distribution code (engine.js, RouteGroup.jsonc absent; processLead on main has no
  shadowEvaluateRouting or distribution_mode). CONCLUSION: no previous feature-branch code reached
  live. Base44 syncs `main`; feature-branch pushes do not deploy. (Resolves prior D-001.)
- GT-2 Main drift: `main` advanced 24c0557 -> 7ac2a41 with 15 Base44-generated commits implementing
  an unrelated buyer-onboarding feature (new function leadbyteWebhook, entity InboundWebhookRoute,
  OnboardingEmailTemplate, Apply steps, processLead edits). The v1 feature branch is 19 ahead / 15
  behind. v2 starts fresh from main per instruction.
- GT-3 Baseline on main: npm ci PASS; lint 53 errors; typecheck 2355 errors (loose tsc over jsx);
  build FAIL (Base44 app-link/env, environmental); no `test` script. Verified, not assumed.
- GT-4 Live security: main's buyerFeedbackWebhook, testLeadByte, testLeadByteConnector,
  sendPayloadTest still lack the v1 security fixes -> the live app still carries PB-015/H-02/H-03
  class issues. Feeds Phase 1.

## Platform capability findings (Phase 0.3) - some NEEDS-ENV
- CAP-1 updateMany compare-and-swap: PROVEN. processLead `nextLeadId` uses
  updateMany({name, value:expected}, {$set:{value:next}}) and checks result.updated. This is the
  atomic primitive for caps/reservations (PB-008/009).
- CAP-2 Deno shared-module import: UNVERIFIED. No existing base44 function imports a sibling/shared
  module; all are single entry.ts. Determines the PB-001 canonical-engine sharing mechanism.
  Verification requires deploying a function that imports a shared module (NEEDS-ENV) OR using the
  generated-copy-with-hash-parity approach that needs no runtime import. Decision recorded in
  DECISIONS.md; leaning to generated-copy+CI-parity so there is provably one logical engine.
- CAP-3 Unique constraints / indexes / transactions / scheduled functions / cron / durable queues /
  post-response work / secrets storage: UNVERIFIED from here. Base44 exposes create/update entity
  schema and entity CRUD; enforcement of DB-level unique indexes and native transactions is not
  confirmed. Reservation/wallet safety must therefore rest on CAP-1 (CAS), not on assumed unique
  indexes (see PB-009). Scheduling mechanism for the retry worker (PB-011) is NEEDS-ENV.

## Blockers

### PB-001 Two routing engines - IN-PROGRESS (mechanism CLOSED; consumption wiring pending)
Current: v2 starts from main, which has NO mirror (the v1 shadowEvaluateRouting never reached main),
so there is nothing to delete. The single-canonical-engine mechanism is now built and proven:
- Canonical engine: src/lib/distribution/ (backend surface: backend-entry.js).
- Generated backend copy: base44/functions/_shared/routingEngine.generated.js via
  scripts/generate-backend-engine.mjs (esbuild bundle, no imports, hash header).
- Blocking parity + anti-mirror check: scripts/check-engine-parity.mjs (npm run engine:check), wired
  BLOCKING in .github/workflows/ci.yml. Proven to FAIL on a tampered bundle and on any reintroduced
  hand-written routing function, and PASS when clean.
- Behavioral-equivalence test (parity.test.js) proves generated == canonical decisions.
Evidence: 103 tests pass incl. parity; negative tests exit 1 as required.
Remaining: consumption by shadow/native/retry/simulator functions lands in Phases 6/7/9/11 (each will
import the generated bundle). Runtime import from a Base44 Deno function is NEEDS-ENV (CAP-2); the
generated file is self-contained so inlining is the fallback if relative import is unsupported.
Residual: CAP-2 deployment verification.

### PB-002 Backend buyer lifecycle incorrect - OPEN (VALID, verified)
Current: shadow reads RouteMember.buyer_status which does not exist on RouteMember; real Buyer not
joined. Required: join actual Buyer; ineligible if missing/inactive/paused/terminated/contradictory/
billing-suspended/wallet-fail; fail closed. Affected: loadRoutingSnapshot + engine. Verify: fixture
tests incl. paused+active=true, missing buyer.

### PB-003 Draft groups can route - OPEN (VALID, verified)
Current: RouteGroup defaults active:true while lifecycle draft; shadow filters only by active.
Required: route only when active===true AND lifecycle==='active' AND belongs to resolved campaign
AND references a published config version. Verify: fixture tests for draft/paused/archived exclusion.

### PB-004 Campaign attribution missing - OPEN
Current: no deterministic single-campaign attribution; live Campaign count=0. Required: deterministic
hierarchy (key/source -> inbound ref -> source map -> brand+vertical -> configured default), with a
documented per-brand/vertical default bootstrap presented to Nick before any live creation; ambiguous
-> queue/reject with stable code; never evaluate all campaigns. Verify: attribution unit tests incl.
zero-campaign path.

### PB-005 Three routing data shapes - OPEN
Current: snake_case entities, camelCase engine inputs, partial backend shadow shape. Required: one
`loadRoutingSnapshot` mapper; no other component builds snapshots. Verify: fixture tests vs real
snake_case schemas.

### PB-006 Shadow incomplete - OPEN
Current: shadow omits most gates/methods. Required: full canonical engine with every gate/method
listed in the spec. Verify: shadow trace shows all candidate reasons.

### PB-007 Native delivery absent - OPEN
Current: no backend direct/ping/post delivery; only legacy fire-and-forget JSON logs. Required:
real backend delivery persisting DeliveryAttempt. Verify: integration tests vs local destination.

### PB-008 Cap safety unproven - OPEN
Current: atomicIncrementIfBelow only exists against a synchronous mock. Required: real CAS store
adapter (built on CAP-1); adversarial async tests (25 concurrent vs cap 5 => exactly 5). If Base44
cannot guarantee it, STOP and present (no silent downgrade, no external datastore without approval +
Morne sign-off). Verify: adversarial concurrency tests + real adapter.

### PB-009 Reservation race - OPEN
Current: getReservation then putReservation permits duplicate concurrent reservations; no verified
unique index. Required: atomic claim (CAS), not an assumed unique index. Verify: 10 concurrent same
idempotency key => exactly one reservation.

### PB-010 Wallet not concurrency-safe - OPEN
Current: read-calc-append are separate ops; lost updates possible. Required: append-only ledger +
versioned CAS balance (CAP-1). Verify: parallel debits, duplicate key, credit-limit-under-concurrency.

### PB-011 Attempts/retries only models - OPEN
Required: create-before-send, timeout, classify, complete, schedule, claim, backoff+jitter, max,
dead-letter, manual retry, crash recovery, idempotent replay, circuit breaker. Scheduling = NEEDS-ENV
until mechanism verified. Verify: integration + two-worker no-double-send test.

### PB-012 Ping-post only ranking - OPEN
Required: full sequence (minimal-PII ping allowlist, concurrent pings, timeout, BidAttempt persist,
parse, exclude expired/invalid, winner, full PII to winner only, post attempt, fall-through, ambiguous
handling). Verify: >=3 mock bidders integration test.

### PB-013 Simulator uses fake JSON - OPEN
Current: default simulator uses pasted JSON. Required: default loads actual published snapshot via
loadRoutingSnapshot; zero side effects; what-if JSON becomes advanced mode. Verify: simulator uses
real Buyer/cap/wallet/health/schedule/version.

### PB-014 Portal projection orphaned - OPEN
Current: portalProjection.js is frontend-only, unused by backend. Required: enforce canonical
projections inside the actual portal backend functions. Verify: direct-call authorization tests.

### PB-015 Supplier portal exposure - OPEN (verify first)
Current: supplierPortalData returns the supplier's own plaintext ApiKey.key (verified in v1
inventory). Required: never return full keys/revenue/cost/buyer identity/traces/raw payloads; hash
keys where possible; show prefix/status/dates/last-used/rotation. Verify: direct-call tests. If found
already safe, close INVALID with evidence.

### PB-016 Config authorization not server-side - OPEN
Current: Route Group/Member CRUD via browser entity calls. Required: operator-only backend functions
for create/update/validate/publish/pause/archive/rollback/retire/simulate; authz before service-role.
Verify: direct-call authorization tests.

### PB-017 Config validation fails open - OPEN
Current: malformed JSON/unknown ops become unrestricted filters / passing conditions. Required:
CONFIG_INVALID for bad JSON/operators/missing refs/bad state-zip/schedule/caps/pricing; invalid ->
member ineligible + operator alert; never broaden. Verify: validation unit tests.

### PB-018 Group deletion orphans members - OPEN
Required: no hard-delete of active/historically-used config; draft-only delete, archive/retire,
referential checks, immutable snapshots. Verify: deletion-safety tests.

### PB-019 No immutable config versions - OPEN
Required: draft vs published version, published-by/at, change reason, config hash, immutable snapshot,
rollback, RouteDecisionTrace references exact version. Verify: version + rollback tests; historical
lead explainable via its exact version.

### PB-020 Shadow comparison too crude - OPEN
Current: "both routed" treated as agreement. Required: compare campaign/buyer/destination/status/
price/revenue/reason/fall-through/cap/wallet/result/latency into detailed categories. Verify:
comparison unit tests per category.

### PB-021 Redaction incomplete - OPEN
Current: stores a 500-char response excerpt; PII/secret coverage partial. Required: redact/minimize
headers, URL creds, bodies, email/phone/name/address, TrustedForm URL, Jornaya, keys, tokens, payment,
buyer secrets; structured redacted metadata only. Verify: redaction unit tests.

### PB-022 Modes beyond shadow not implemented - OPEN
Current: canary/new_primary_with_legacy_fallback/new_only are strings with no behavior. Required: real
per-mode behavior with double-send prevention and audited, approval-gated mode changes. Verify:
per-mode behavior tests vs mock destination.

### PB-023 Stripe/Xero abstractions only - BLOCKED-ON-CREDENTIALS
Required: sandbox-complete Stripe + Xero (customer/checkout/top-up/webhook-verify/replay/reconcile;
oauth/tenant/contact/invoice/lines/returns/payment sync/reconcile). Credential-free adapter +
verification-against-fixtures may be built and unit tested; blocker stays open until sandbox runs pass.
Needs sandbox creds from Nick. Also Phase 14 is gated on Checkpoint B.

### PB-024 Reporting capped/client-side - OPEN
Current: client query capped at 2000 leads. Required: server-side/pre-aggregated reporting for the
full metric list with defined tz/semantics. Verify: server aggregation tests + cap-independence.

## Notes
- No blocker below is closed. Phase 0 established ground truth only.
- PB-008/010 external-datastore escape hatch requires Nick approval AND Morne infra sign-off; do not
  take it unilaterally.
