// Concurrency-safe, idempotent cap reservation. Pure orchestration over an
// injected atomic store, so it is unit-testable and the real Base44 backend
// supplies the atomic primitive (CapCounter updated with the same optimistic-lock
// CAS pattern proven by Counter.nextLeadId).
//
// Store interface (all async):
//   getReservation(idempotencyKey, memberId) -> reservation | null
//   putReservation(rec) -> rec (rec has { id })
//   updateReservation(id, patch) -> void
//   atomicIncrementIfBelow(scopeKey, limit) -> boolean   // increments iff count < limit; atomic
//   decrement(scopeKey) -> void
//
// A "scope" is { key, limit }. `key` encodes scope_type+scope_id+window+window_start.

export const RESERVE = {
  OK: 'OK',
  ALREADY_RESERVED: 'ALREADY_RESERVED', // idempotent replay
  CAP_EXCEEDED: 'CAP_EXCEEDED',
};

// Two-phase: RESERVE atomically across all cap scopes before the primary send.
// Idempotent by (idempotencyKey, memberId): a retry of the same lead returns the
// original reservation and never double-consumes.
export async function reserve(store, { idempotencyKey, leadId, memberId, price = 0, scopes = [] }) {
  const existing = await store.getReservation(idempotencyKey, memberId);
  if (existing) {
    return { ok: true, code: RESERVE.ALREADY_RESERVED, reservation: existing };
  }

  const incremented = [];
  for (const scope of scopes) {
    if (scope.limit == null) continue; // unlimited window
    const ok = await store.atomicIncrementIfBelow(scope.key, Number(scope.limit));
    if (!ok) {
      // roll back everything we took so a failed reservation consumes nothing
      for (const s of incremented) await store.decrement(s.key);
      return { ok: false, code: RESERVE.CAP_EXCEEDED, scope: scope.key };
    }
    incremented.push(scope);
  }

  const rec = await store.putReservation({
    idempotency_key: idempotencyKey,
    lead_id: leadId,
    route_member_id: memberId,
    price: Number(price),
    scopes: incremented.map((s) => s.key),
    state: 'reserved',
  });
  return { ok: true, code: RESERVE.OK, reservation: rec };
}

// FINALIZE on accepted delivery: capacity is consumed once and kept. Idempotent.
export async function finalize(store, reservation) {
  if (!reservation || reservation.state === 'finalized') return reservation;
  if (reservation.state !== 'reserved') return reservation; // released cannot be finalized
  await store.updateReservation(reservation.id, { state: 'finalized' });
  return { ...reservation, state: 'finalized' };
}

// RELEASE on failed/rejected delivery: give capacity back exactly once. Idempotent.
export async function release(store, reservation) {
  if (!reservation || reservation.state !== 'reserved') return reservation;
  for (const key of reservation.scopes || []) await store.decrement(key);
  await store.updateReservation(reservation.id, { state: 'released' });
  return { ...reservation, state: 'released' };
}
