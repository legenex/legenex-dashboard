// Delivery-attempt persistence. In-memory mock for tests; real Base44 adapter for
// production (NEEDS-ENV to verify live). Attempts are created BEFORE send so a
// crash mid-send leaves a durable record to recover.

export function makeInMemoryAttemptStore() {
  const attempts = [];
  let seq = 0;
  return {
    async createAttempt(rec) { const row = { ...rec, id: 'a' + (++seq) }; attempts.push(row); return row; },
    async updateAttempt(id, patch) { const a = attempts.find((x) => x.id === id); if (a) Object.assign(a, patch); return a; },
    async getAttempt(id) { return attempts.find((x) => x.id === id) || null; },
    async listDue(nowMs) {
      return attempts.filter((a) => a.status === 'error' && a.next_retry_at != null
        && Date.parse(a.next_retry_at) <= nowMs && (a.lease_until == null || Date.parse(a.lease_until) <= nowMs));
    },
    _debug: { attempts },
  };
}

export function makeBase44AttemptStore(db) {
  return {
    async createAttempt(rec) { return db.entities.DeliveryAttempt.create(rec); },
    async updateAttempt(id, patch) { return db.entities.DeliveryAttempt.update(id, patch); },
    async getAttempt(id) { const rows = await db.entities.DeliveryAttempt.filter({ id }); return rows[0] || null; },
    async listDue(nowMs, limit = 100) {
      const iso = new Date(nowMs).toISOString();
      const rows = await db.entities.DeliveryAttempt.filter({ status: 'error' }, 'next_retry_at', limit);
      return rows.filter((a) => a.next_retry_at && a.next_retry_at <= iso
        && (!a.lease_until || a.lease_until <= iso));
    },
  };
}
