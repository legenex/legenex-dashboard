import { describe, it, expect } from 'vitest';
import { reserve, finalize, release, RESERVE } from './reservation.js';

// Mock store. atomicIncrementIfBelow/decrement are synchronous, which models the
// atomic CAS primitive the real Base44 CapCounter provides. Reservation uniqueness
// (idempotency_key, member) is enforced by the DB unique index in production; the
// sequential idempotency path is what reserve() guarantees at the app layer.
function makeStore() {
  return {
    counters: {}, reservations: [], seq: 0,
    async getReservation(key, member) {
      return this.reservations.find((r) => r.idempotency_key === key && r.route_member_id === member) || null;
    },
    async putReservation(rec) { const r = { ...rec, id: 'r' + (++this.seq) }; this.reservations.push(r); return r; },
    async updateReservation(id, patch) { Object.assign(this.reservations.find((x) => x.id === id), patch); },
    atomicIncrementIfBelow(key, limit) {
      const c = this.counters[key] || 0;
      if (c < limit) { this.counters[key] = c + 1; return true; }
      return false;
    },
    decrement(key) { this.counters[key] = Math.max(0, (this.counters[key] || 0) - 1); },
  };
}

describe('reserve (two-phase, idempotent, cap-safe)', () => {
  it('reserves and increments the counter', async () => {
    const s = makeStore();
    const out = await reserve(s, { idempotencyKey: 'k1', leadId: 'L1', memberId: 'm1', price: 10, scopes: [{ key: 'daily:m1', limit: 5 }] });
    expect(out.ok).toBe(true);
    expect(out.code).toBe(RESERVE.OK);
    expect(s.counters['daily:m1']).toBe(1);
  });

  it('is idempotent on retry (same key does not double-consume)', async () => {
    const s = makeStore();
    const scopes = [{ key: 'daily:m1', limit: 5 }];
    await reserve(s, { idempotencyKey: 'k1', leadId: 'L1', memberId: 'm1', scopes });
    const again = await reserve(s, { idempotencyKey: 'k1', leadId: 'L1', memberId: 'm1', scopes });
    expect(again.code).toBe(RESERVE.ALREADY_RESERVED);
    expect(s.counters['daily:m1']).toBe(1); // not 2
    expect(s.reservations).toHaveLength(1);
  });

  it('rejects when a cap is exhausted and consumes nothing', async () => {
    const s = makeStore();
    const scopes = [{ key: 'daily:m1', limit: 1 }];
    await reserve(s, { idempotencyKey: 'a', leadId: 'L1', memberId: 'm1', scopes });
    const out = await reserve(s, { idempotencyKey: 'b', leadId: 'L2', memberId: 'm1', scopes });
    expect(out.ok).toBe(false);
    expect(out.code).toBe(RESERVE.CAP_EXCEEDED);
    expect(s.counters['daily:m1']).toBe(1); // unchanged
  });

  it('rolls back earlier scopes when a later scope is over limit', async () => {
    const s = makeStore();
    s.counters['monthly:m1'] = 10;
    const out = await reserve(s, {
      idempotencyKey: 'k', leadId: 'L1', memberId: 'm1',
      scopes: [{ key: 'daily:m1', limit: 5 }, { key: 'monthly:m1', limit: 10 }],
    });
    expect(out.ok).toBe(false);
    expect(s.counters['daily:m1']).toBe(0); // rolled back, consumes nothing
    expect(s.counters['monthly:m1']).toBe(10);
  });

  it('never exceeds the cap under concurrent reservations', async () => {
    const s = makeStore();
    const scopes = [{ key: 'daily:m1', limit: 3 }];
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        reserve(s, { idempotencyKey: 'k' + i, leadId: 'L' + i, memberId: 'm1', scopes })),
    );
    expect(results.filter((r) => r.ok).length).toBe(3);
    expect(s.counters['daily:m1']).toBe(3);
  });
});

describe('finalize / release', () => {
  it('finalize keeps capacity; release returns it exactly once', async () => {
    const s = makeStore();
    const scopes = [{ key: 'daily:m1', limit: 5 }];
    const { reservation } = await reserve(s, { idempotencyKey: 'k', leadId: 'L1', memberId: 'm1', scopes });

    const fin = await finalize(s, reservation);
    expect(fin.state).toBe('finalized');
    expect(s.counters['daily:m1']).toBe(1); // kept

    // a finalized reservation cannot be released
    const rel = await release(s, fin);
    expect(rel.state).toBe('finalized');
    expect(s.counters['daily:m1']).toBe(1);
  });

  it('release decrements once and is idempotent', async () => {
    const s = makeStore();
    const scopes = [{ key: 'daily:m1', limit: 5 }];
    const { reservation } = await reserve(s, { idempotencyKey: 'k', leadId: 'L1', memberId: 'm1', scopes });
    const rel1 = await release(s, reservation);
    expect(rel1.state).toBe('released');
    expect(s.counters['daily:m1']).toBe(0);
    const rel2 = await release(s, rel1);
    expect(s.counters['daily:m1']).toBe(0); // not negative
  });
});
