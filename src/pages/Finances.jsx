import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import PageHeader from '@/components/shared/PageHeader';
import ReconciliationTab from '@/components/finances/ReconciliationTab';
import BankFeedTab from '@/components/finances/BankFeedTab';
import InvoicesTab from '@/components/finances/InvoicesTab';
import BuyerPaymentsTab from '@/components/finances/BuyerPaymentsTab';
import SupplierPayoutsTab from '@/components/finances/SupplierPayoutsTab';
import AdSpendTab from '@/components/finances/AdSpendTab';
import { toast } from 'sonner';
import { unmatched } from '@/lib/financeMetrics';
import { usePermissions } from '@/lib/AuthContext';

export default function Finances() {
  const [params] = useSearchParams();
  const { can } = usePermissions();
  const canBank = can('bank_feed');
  const tab = params.get('tab') || 'overview';
  const [resolved, setResolved] = useState(0);

  const { data: leads = [] } = useQuery({ queryKey: ['report-leads'], queryFn: () => base44.entities.Lead.list('-created_date', 2000) });
  const { data: buyers = [] } = useQuery({ queryKey: ['buyers'], queryFn: () => base44.entities.Buyer.list() });
  const { data: suppliers = [] } = useQuery({ queryKey: ['suppliers'], queryFn: () => base44.entities.Supplier.list() });
  const { data: invoices = [] } = useQuery({ queryKey: ['all-invoices'], queryFn: () => base44.entities.Invoice.list('-created_date', 500) });
  const { data: payments = [] } = useQuery({ queryKey: ['buyer-payments'], queryFn: () => base44.entities.BuyerPayment.list('-paid_date', 500) });
  const { data: payouts = [] } = useQuery({ queryKey: ['supplier-payouts'], queryFn: () => base44.entities.SupplierPayout.list('-created_date', 500) });
  const { data: adSpend = [] } = useQuery({ queryKey: ['adspend'], queryFn: () => base44.entities.AdSpend.list('-date', 2000) });
  const { data: txns = [] } = useQuery({ queryKey: ['bank-txns'], queryFn: () => base44.entities.BankTransaction.list('-date', 500) });

  const unmatchedIn = unmatched(txns).filter(t => t.amount > 0).reduce((a, t) => a + Number(t.amount), 0);

  const reconData = { leads, buyers, suppliers, invoices, payments, payouts, adSpend, unmatchedIn, resolved };

  return (
    <div>
      <PageHeader title="Finances" subtitle="Financial overview, reconciliation, invoices, payments and ad spend" />
      {tab === 'overview' && <ReconciliationTab data={reconData} onResolve={(g) => { setResolved(r => r + 1); toast.success(`Marked ${g.name} resolved`); }} />}
      {tab === 'bank' && canBank && <BankFeedTab />}
      {tab === 'invoices' && <InvoicesTab buyers={buyers} />}
      {tab === 'payments' && <BuyerPaymentsTab buyers={buyers} />}
      {tab === 'payouts' && <SupplierPayoutsTab suppliers={suppliers} />}
      {tab === 'adspend' && <AdSpendTab />}
    </div>
  );
}