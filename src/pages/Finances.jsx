import React from 'react';
import PageHeader from '@/components/shared/PageHeader';
import ComingSoon from '@/components/shared/ComingSoon';

export default function Finances() {
  return (
    <div>
      <PageHeader title="Finances" subtitle="Wallets, invoices, payouts, and billing across all partners" />
      <ComingSoon title="Finances" description="Buyer wallets, invoices, supplier payouts, and reconciliation will live here. Per-buyer wallet and billing is managed inside each buyer's detail page." />
    </div>
  );
}