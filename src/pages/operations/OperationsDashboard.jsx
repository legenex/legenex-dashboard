import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import ToolTile from '@/components/tools/ToolTile';
import { Users, Factory, MapPin, ReceiptText, UserPlus, Megaphone } from 'lucide-react';

const num = (n) => (n ?? 0).toLocaleString();

function StatCard({ label, value, hint, tone }) {
  const toneClass = tone === 'good' ? 'status-sold' : tone === 'warn' ? 'status-unsold' : 'text-foreground';
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-[0_12px_32px_-16px_rgba(0,0,0,0.4)]">
      <div className="text-[10px] font-semibold uppercase tracking-[0.11em] text-muted-foreground/70 truncate">{label}</div>
      <div className={`text-[24px] font-bold font-mono tabular-nums mt-1 leading-none whitespace-nowrap ${toneClass}`}>{value}</div>
      {hint && <div className="text-[11px] text-muted-foreground/70 mt-1.5 truncate">{hint}</div>}
    </div>
  );
}

// Operations landing dashboard: who is live right now, mirroring the Tools dashboard.
// All aggregation happens server side in the operationsData function.
export default function OperationsDashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ['operations-dashboard'],
    queryFn: async () => {
      const res = await base44.functions.invoke('operationsData', {});
      return res.data;
    },
  });

  const counts = data?.counts || {};
  const sections = data?.section_metrics || {};
  const dash = (v) => (isLoading || v == null ? '-' : num(v));

  // Empty when the reference tables have nothing set up yet.
  const isEmpty = !isLoading && data
    && (counts.total_buyers ?? 0) === 0
    && (counts.total_suppliers ?? 0) === 0
    && (counts.total_campaigns ?? 0) === 0
    && (counts.total_states ?? 0) === 0;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[19px] font-semibold text-foreground">
          Operations <span className="text-muted-foreground/70 font-normal">/ Dashboard</span>
        </h1>
        <p className="text-[13px] text-muted-foreground mt-1">Who is live right now: active buyers, suppliers and states across the last 30 days.</p>
      </div>

      {isEmpty ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center shadow-[0_12px_32px_-16px_rgba(0,0,0,0.4)]">
          <p className="text-[14px] font-semibold text-foreground">No operations data yet</p>
          <p className="text-[13px] text-muted-foreground mt-1.5">
            Add buyers, suppliers and campaigns, then run the priority engine to populate state coverage.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard label="Active Buyers" value={dash(counts.active_buyers)} hint={`${dash(counts.total_buyers)} total`} tone="good" />
            <StatCard label="Active Suppliers" value={dash(counts.active_suppliers)} hint={`${dash(counts.total_suppliers)} total`} tone="good" />
            <StatCard label="Active States" value={dash(counts.active_states)} hint="states with active coverage" tone="good" />
            <StatCard label="Active Campaigns" value={dash(counts.active_campaigns)} hint={`${dash(counts.total_campaigns)} total`} tone={(counts.active_campaigns ?? 0) > 0 ? 'good' : 'warn'} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ToolTile
              to="/operations/buyers"
              icon={Users}
              title="Buyers"
              description="Active buyers, acceptance and exposure across campaigns."
              status={(sections.buyers?.active ?? 0) > 0 ? 'ok' : 'warn'}
              stats={[{ label: 'Active', value: dash(sections.buyers?.active) }, { label: 'Total', value: dash(sections.buyers?.total) }]}
            />
            <ToolTile
              to="/operations/suppliers"
              icon={Factory}
              title="Suppliers"
              description="Sources sending leads and their recent volume."
              status={(sections.suppliers?.active ?? 0) > 0 ? 'ok' : 'warn'}
              stats={[{ label: 'Active', value: dash(sections.suppliers?.active) }, { label: 'Total', value: dash(sections.suppliers?.total) }]}
            />
            <ToolTile
              to="/operations/active-states"
              icon={MapPin}
              title="Active States"
              description="Geographic coverage with active buyer pricing."
              status={(sections.active_states?.active ?? 0) > 0 ? 'ok' : 'warn'}
              stats={[{ label: 'States', value: dash(sections.active_states?.active) }, { label: 'Leads 30d', value: dash(sections.active_states?.period_leads) }]}
            />
            <ToolTile
              to="/operations/billing-reports"
              icon={ReceiptText}
              title="Billing Reports"
              description="Per-buyer billing exports and reconciliation."
              status="ok"
              stats={[{ label: 'Due to bill', value: dash(sections.billing_reports?.due_to_bill) }, { label: 'Outstanding', value: dash(sections.billing_reports?.outstanding) }]}
            />
            <ToolTile
              to="/operations/buyer-onboarding"
              icon={UserPlus}
              title="Buyer Onboarding"
              description="Bring a new buyer live: mapping, caps and go-live checks."
              status="ok"
              stats={[{ label: 'In progress', value: dash(sections.buyer_onboarding?.in_progress) }, { label: 'Blocked', value: dash(sections.buyer_onboarding?.blocked) }]}
            />
            <ToolTile
              to="/campaigns"
              icon={Megaphone}
              title="Campaigns"
              description="Manage campaigns, verticals, buyers, suppliers and brands."
              status="ok"
              stats={[{ label: 'Active', value: dash(sections.campaigns?.active) }, { label: 'Total', value: dash(sections.campaigns?.total) }]}
            />
          </div>
        </>
      )}
    </div>
  );
}