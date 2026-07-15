// Canonical engine surface consumed by the Base44 backend (processLead, retry
// worker, simulator function). This is the SINGLE source of truth: the backend
// uses a GENERATED bundle of exactly this module (see scripts/generate-backend-
// engine.mjs), enforced by a blocking parity check (scripts/check-engine-parity.mjs).
// There is no hand-maintained backend mirror. Do not edit the generated file by
// hand; edit the canonical modules and regenerate.

export {
  REASON, isValidTrustedForm, missingRequiredFields, exhaustedCap, evaluateMember,
  resolvePrice, selectPriority, selectWeighted, selectRoundRobin, selectAuction,
  selectHybrid, routeWaterfall, capWindowStart, idempotencyKey, redact,
} from './engine.js';

export { evalLeaf, evalConditionTree, OPERATORS } from './conditions.js';
export { buildRoutingSnapshot } from './snapshot.js';
export { wallClock, isWithinSchedule } from './schedule.js';
export { rankBids, BID_REASON } from './pingpost.js';
export {
  ATTEMPT_STATUS, computeBackoffMs, nextRetryAtIso, shouldRetry, classifyResponse,
  buildAttemptRecord,
} from './deliveryAttempt.js';
