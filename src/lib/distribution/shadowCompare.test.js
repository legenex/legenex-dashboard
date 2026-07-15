import { describe, it, expect } from 'vitest';
import { compareDecision, summarizeComparisons, COMPARE } from './shadowCompare.js';

describe('compareDecision', () => {
  it('both routed = agreement', () => {
    expect(compareDecision({ status: 'Sold' }, { winner_member_id: 'm1' }))
      .toEqual({ category: COMPARE.BOTH_ROUTED, agree: true });
  });
  it('shadow-only and legacy-only are discrepancies', () => {
    expect(compareDecision({ status: 'Unsold' }, { winner_member_id: 'm1' }).category).toBe(COMPARE.SHADOW_ONLY);
    expect(compareDecision({ status: 'Sold' }, { winner_member_id: '' }).category).toBe(COMPARE.LEGACY_ONLY);
  });
  it('neither routed = agreement', () => {
    expect(compareDecision({ status: 'Queued' }, { winner_member_id: '' }))
      .toEqual({ category: COMPARE.NEITHER, agree: true });
  });
});

describe('summarizeComparisons', () => {
  it('counts categories and computes discrepancy rate', () => {
    const pairs = [
      { legacy: { status: 'Sold' }, shadow: { winner_member_id: 'm1' } }, // both
      { legacy: { status: 'Unsold' }, shadow: { winner_member_id: 'm2' } }, // shadow_only
      { legacy: { status: 'Sold' }, shadow: { winner_member_id: '' } },    // legacy_only
      { legacy: { status: 'Queued' }, shadow: { winner_member_id: '' } },  // neither
    ];
    const s = summarizeComparisons(pairs);
    expect(s.total).toBe(4);
    expect(s.counts).toEqual({ both_routed: 1, shadow_only: 1, legacy_only: 1, neither: 1 });
    expect(s.agreements).toBe(2);
    expect(s.discrepancies).toBe(2);
    expect(s.discrepancyRate).toBe(0.5);
  });
});
