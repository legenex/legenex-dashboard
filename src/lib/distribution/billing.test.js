import { describe, it, expect } from 'vitest';
import { walletDebit, walletCredit, computeBillingLines, applyReturnAdjustment } from './billing.js';

function makeLedger(initial = {}) {
  return {
    txns: [], byKey: {}, balances: { ...initial },
    async getTxnByKey(k) { return this.byKey[k] || null; },
    async getBalance(id) { return this.balances[id] || 0; },
    async append(txn) {
      const row = { ...txn, id: 't' + (this.txns.length + 1) };
      this.txns.push(row);
      if (txn.idempotency_key) this.byKey[txn.idempotency_key] = row;
      this.balances[txn.buyer_id] = txn.balance_after;
      return row;
    },
  };
}

describe('walletDebit (idempotent, no negative without credit)', () => {
  it('debits once and is idempotent on the same key', async () => {
    const l = makeLedger({ B1: 100 });
    const a = await walletDebit(l, { buyerId: 'B1', amount: 30, idempotencyKey: 'k1' });
    expect(a.applied).toBe(true);
    expect(a.balanceAfter).toBe(70);
    const b = await walletDebit(l, { buyerId: 'B1', amount: 30, idempotencyKey: 'k1' });
    expect(b.duplicate).toBe(true);
    expect(await l.getBalance('B1')).toBe(70); // not 40
  });
  it('refuses to go negative without a credit limit', async () => {
    const l = makeLedger({ B1: 10 });
    const r = await walletDebit(l, { buyerId: 'B1', amount: 25, idempotencyKey: 'k' });
    expect(r.applied).toBe(false);
    expect(r.code).toBe('LOW_BALANCE');
    expect(await l.getBalance('B1')).toBe(10);
  });
  it('allows negative down to the credit limit', async () => {
    const l = makeLedger({ B1: 10 });
    const ok = await walletDebit(l, { buyerId: 'B1', amount: 25, idempotencyKey: 'k', creditLimit: 100 });
    expect(ok.applied).toBe(true);
    expect(ok.balanceAfter).toBe(-15);
    const over = await walletDebit(l, { buyerId: 'B1', amount: 200, idempotencyKey: 'k2', creditLimit: 100 });
    expect(over.applied).toBe(false);
    expect(over.code).toBe('OVER_CREDIT_LIMIT');
  });
});

describe('walletCredit', () => {
  it('adds funds idempotently', async () => {
    const l = makeLedger({ B1: 5 });
    const a = await walletCredit(l, { buyerId: 'B1', amount: 20, idempotencyKey: 'c1', type: 'recharge' });
    expect(a.balanceAfter).toBe(25);
    const b = await walletCredit(l, { buyerId: 'B1', amount: 20, idempotencyKey: 'c1' });
    expect(b.duplicate).toBe(true);
    expect(await l.getBalance('B1')).toBe(25);
  });
});

describe('computeBillingLines (returns counted once)', () => {
  const leads = [
    { id: 'L1', vertical: 'legal', state: 'TX', price: 10 },
    { id: 'L2', vertical: 'legal', state: 'TX', price: 10 },
    { id: 'L3', vertical: 'legal', state: 'CA', price: 20 },
  ];
  it('groups by dims and subtracts approved returns exactly once', () => {
    const lines = computeBillingLines(leads, [{ lead_id: 'L2' }], ['vertical', 'state']);
    const tx = lines.find((l) => l.state === 'TX');
    expect(tx.lead_count).toBe(2);
    expect(tx.returns).toBe(1);
    expect(tx.billable_leads).toBe(1);
    expect(tx.amount).toBe(10); // returned lead not billed
    const ca = lines.find((l) => l.state === 'CA');
    expect(ca.amount).toBe(20);
  });
});

describe('applyReturnAdjustment', () => {
  it('applies once then dedupes', () => {
    const seen = new Set();
    expect(applyReturnAdjustment(seen, 'r1').applied).toBe(true);
    expect(applyReturnAdjustment(seen, 'r1').duplicate).toBe(true);
  });
});
