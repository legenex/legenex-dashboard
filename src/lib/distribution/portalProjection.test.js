import { describe, it, expect } from 'vitest';
import {
  projectLeadForBuyer, projectLeadForSupplier, resolveScope, ownsLead,
} from './portalProjection.js';

const fullLead = {
  id: 'L1', lead_id: 42, first_name: 'Jo', last_name: 'Doe', state: 'TX', email: 'a@b.com',
  mobile: '5125550100', final_status: 'Sold', buyer_feedback: 'Converted', revenue: 25,
  // things that must never leak:
  raw_payload: '{"ssn":"..."}', mapped_fields: '{}', capi_log: '[]', delivery_log: '[]',
  supplier_key_id: 'key_123', buyer_api_key: 'secret', trustedform_url: 'https://cert...',
  supplier_name: 'AcmeSupplier', buyer_id: 'B1',
};

describe('buyer projection (deny-by-default)', () => {
  it('exposes only allowlisted fields', () => {
    const out = projectLeadForBuyer(fullLead);
    expect(out).toHaveProperty('final_status', 'Sold');
    expect(out).toHaveProperty('revenue', 25);
    expect(Object.keys(out)).not.toContain('raw_payload');
    expect(Object.keys(out)).not.toContain('supplier_key_id');
    expect(Object.keys(out)).not.toContain('delivery_log');
    expect(Object.keys(out)).not.toContain('supplier_name'); // cross-counterparty
    expect(Object.keys(out)).not.toContain('buyer_api_key');
  });
});

describe('supplier projection (no buyer identity, no revenue)', () => {
  it('exposes only allowlisted fields and never revenue or buyer identity', () => {
    const out = projectLeadForSupplier(fullLead);
    expect(out).toHaveProperty('final_status', 'Sold');
    expect(Object.keys(out)).not.toContain('revenue');
    expect(Object.keys(out)).not.toContain('buyer_id');
    expect(Object.keys(out)).not.toContain('email'); // PII minimized for supplier
    expect(Object.keys(out)).not.toContain('raw_payload');
  });
});

describe('resolveScope (fail-closed)', () => {
  it('pins a portal user to their linked entity', () => {
    expect(resolveScope({ user: { linked_buyer_id: 'B9' }, linkField: 'linked_buyer_id' })).toBe('B9');
  });
  it('lets an admin preview another scope only via explicit override', () => {
    expect(resolveScope({ user: { role: 'admin' }, linkField: 'linked_buyer_id', overrideId: 'B7' })).toBe('B7');
  });
  it('returns null (fail-closed) for an unlinked non-admin', () => {
    expect(resolveScope({ user: { role: 'user' }, linkField: 'linked_buyer_id' })).toBe(null);
    expect(resolveScope({ user: {}, linkField: 'linked_buyer_id', overrideId: 'B7' })).toBe(null);
  });
});

describe('ownsLead (pre-write scope check)', () => {
  it('only true when the lead belongs to the scope', () => {
    expect(ownsLead({ buyer_id: 'B1' }, 'buyer_id', 'B1')).toBe(true);
    expect(ownsLead({ buyer_id: 'B2' }, 'buyer_id', 'B1')).toBe(false);
    expect(ownsLead(null, 'buyer_id', 'B1')).toBe(false);
  });
});
