// Pure shadow-mode comparison. Contrasts the legacy LeadByte outcome with what
// the new engine would have decided (from a RouteDecisionTrace), so discrepancies
// can be triaged before any canary. No I/O.

export const COMPARE = {
  BOTH_ROUTED: 'both_routed',       // legacy sold/accepted AND shadow selected a member
  SHADOW_ONLY: 'shadow_only',       // shadow would route, legacy did not sell
  LEGACY_ONLY: 'legacy_only',       // legacy sold, shadow found no eligible member
  NEITHER: 'neither',               // both declined
};

// legacy: { status } where status is a final_status like 'Sold'/'Unsold'/'Queued'.
// shadow: { winner_member_id } from the recorded trace (empty string = none).
export function compareDecision(legacy, shadow) {
  const legacyRouted = ['sold'].includes(String(legacy?.status || '').toLowerCase());
  const shadowRouted = !!(shadow && shadow.winner_member_id);
  let category;
  if (legacyRouted && shadowRouted) category = COMPARE.BOTH_ROUTED;
  else if (!legacyRouted && shadowRouted) category = COMPARE.SHADOW_ONLY;
  else if (legacyRouted && !shadowRouted) category = COMPARE.LEGACY_ONLY;
  else category = COMPARE.NEITHER;
  return { category, agree: category === COMPARE.BOTH_ROUTED || category === COMPARE.NEITHER };
}

// Summarize a batch of {legacy, shadow} pairs into counts + a discrepancy rate.
// Discrepancies (SHADOW_ONLY / LEGACY_ONLY) are what must be explained before canary.
export function summarizeComparisons(pairs) {
  const counts = { both_routed: 0, shadow_only: 0, legacy_only: 0, neither: 0 };
  for (const p of pairs || []) counts[compareDecision(p.legacy, p.shadow).category] += 1;
  const total = (pairs || []).length;
  const discrepancies = counts.shadow_only + counts.legacy_only;
  return {
    total,
    counts,
    agreements: counts.both_routed + counts.neither,
    discrepancies,
    discrepancyRate: total ? round4(discrepancies / total) : 0,
  };
}

function round4(n) { return Math.round(n * 10000) / 10000; }
