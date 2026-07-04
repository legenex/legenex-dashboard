import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import PageHeader from '@/components/shared/PageHeader';
import ReconciliationTab from '@/components/finances/ReconciliationTab';
import BankFeedTab from '@/components/finances/BankFeedTab';
import InvoicesTab from '@/components/finances/InvoicesTab';
import BuyerPaymentsTab from '@/components/finances/BuyerPaymentsTab';
import SupplierPayoutsTab from '@/components/finances/SupplierPayoutsTab';
import AdSpendTab from '@/components/finances/AdSpendTab';
import { toast } from 'sonner';
import { unmatched } from '@/lib/financeMetrics';

export default function Finances() {
  const [params, setParams] = useSearchParams();
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
      <Tabs value={tab} onValueChange={(v) => setParams({ tab: v }, { replace: true })}>
        <TabsList className="mb-5">
          <TabsTrigger value="overview">Financial Overview</TabsTrigger>
          <TabsTrigger value="bank">Bank Feed</TabsTrigger>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          <TabsTrigger value="payments">Buyer Payments</TabsTrigger>
          <TabsTrigger value="payouts">Supplier Payouts</TabsTrigger>
          <TabsTrigger value="adspend">Ad Spend</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <ReconciliationTab data={reconData} onResolve={(g) => { setResolved(r => r + 1); toast.success(`Marked ${g.name} resolved`); }} />
        </TabsContent>
        <TabsContent value="bank"><BankFeedTab /></TabsContent>
        <TabsContent value="invoices"><InvoicesTab buyers={buyers} /></TabsContent>
        <TabsContent value="payments"><BuyerPaymentsTab buyers={buyers} /></TabsContent>
        <TabsContent value="payouts"><SupplierPayoutsTab suppliers={suppliers} /></TabsContent>
        <TabsContent value="adspend"><AdSpendTab /></TabsContent>
      </Tabs>
    </div>
  );
}