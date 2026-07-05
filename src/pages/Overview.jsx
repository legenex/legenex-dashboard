import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import PageHeader from '@/components/shared/PageHeader';
import PeriodTabs from '@/components/shared/PeriodTabs';
import RefreshButton from '@/components/shared/RefreshButton';
import GroupedKpiCard from '@/components/overview/GroupedKpiCard';
import StatCard from '@/components/overview/StatCard';
import ActionQueueCard from '@/components/overview/ActionQueueCard';
import DataConfidenceCard from '@/components/overview/DataConfidenceCard';
import { Badge } from '@/components/ui/badge';
import {
  Bar, Line, ComposedChart, XAxis, YAxis, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import {
  DollarSign, TrendingUp, Megaphone, Users, GitCompareArrows,
} from 'lucide-react';
import { resolvePeriod, PERIOD_LABELS } from '@/lib/periodRange';
import {
  financialTruth, actionQueue, financeDonut, dailyFinance, topCampaigns, buyerRisk, fmtMoney,
} from '@/lib/overviewFinance';
import { money, int } from '@/lib/reportMetrics';
import { toast } from 'sonner';

const CAMPAIGN_TAG_TONE = { Scale: 'status-sold-bg status-sold', Watch: 'status-warn-bg status-unsold', Cut: 'status-error-bg status-error' };
const RISK_TONE = { Overdue: 'status-error-bg status-error', Outstanding: 'status-warn-bg status-unsold', Overpaid: 'bg-status-duplicate status-duplicate', Settled: 'status-sold-bg status-sold' };

export default function Overview() {
  const qc = useQueryClient();
  const [period, setPeriod] = useState('last60');
  const [custom, setCustom] = useState({ from: '', to: '' });
  const [compare, setCompare] = useState(false);

  const win = useMemo(() => resolvePeriod(period, custom), [period, custom]);

  const { data: leads = [] } = useQuery({ queryKey: ['ov-leads'], queryFn: () => base44.entities.Lead.list('-created_date', 2000) });
  const { data: buyers = [] } = useQuery({ queryKey: ['buyers'], queryFn: () => base44.entities.Buyer.list() });
  const { data: suppliers = [] } = useQuery({ queryKey: ['suppliers'], queryFn: () => base44.entities.Supplier.list() });
  const { data: invoices = [] } = useQuery({ queryKey: ['all-invoices'], queryFn: () => base44.entities.Invoice.list('-created_date', 500) });
  const { data: payments = [] } = useQuery({ queryKey: ['buyer-payments'], queryFn: () => base44.entities.BuyerPayment.list('-paid_date', 500) });
  const { data: payouts = [] } = useQuery({ queryKey: ['supplier-payouts'], queryFn: () => base44.entities.SupplierPayout.list('-created_date', 500) });
  const { data: adSpend = [] } = useQuery({ queryKey: ['adspend'], queryFn: () => base44.entities.AdSpend.list('-date', 2000) });
  const { data: txns = [] } = useQuery({ queryKey: ['bank-txns'], queryFn: () => base44.entities.BankTransaction.list('-date', 500) });
  const { data: integrations = [] } = useQuery({ queryKey: ['integration-configs'], queryFn: () => base44.entities.IntegrationConfig.list() });
  const { data: spendMappings = [] } = useQuery({ queryKey: ['adspend-mappings'], queryFn: () => base44.entities.AdSpendMapping.list() });

  const dataset = { leads, buyers, suppliers, invoices, payments, payouts, adSpend, txns };

  const truth = useMemo(() => financialTruth(dataset, win), [leads, buyers, suppliers, invoices, payments, payouts, adSpend, txns, win]);
  const queue = useMemo(() => actionQueue(truth, txns), [truth, txns]);
  const donut = useMemo(() => financeDonut(truth.wLeads), [truth]);
  const daily = useMemo(() => dailyFinance({ wLeads: truth.wLeads, payments, adSpend }, win), [truth, payments, adSpend, win]);
  const campaigns = useMemo(() => topCampaigns(truth.wLeads), [truth]);
  const risk = useMemo(() => buyerRisk(truth.reconRows), [truth]);

  // Compare vs prior window of equal length.
  const priorTruth = useMemo(() => {
    if (!compare) return null;
    const len = win.end.getTime() - win.start.getTime();
    const prior = { start: new Date(win.start.getTime() - len), end: new Date(win.start.getTime()) };
    return financialTruth(dataset, prior);
  }, [compare, win, leads, buyers, suppliers, invoices, payments, payouts, adSpend, txns]);

  const cmpChip = (cur, prev) => {
    if (!compare || prev == null) return null;
    const d = prev === 0 ? null : Math.round(((cur - prev) / Math.abs(prev)) * 100);
    if (d == null) return null;
    return <span className={`ml-2 text-[11px] ${d >= 0 ? 'status-sold' : 'status-error'}`}>{d >= 0 ? '+' : ''}{d}%</span>;
  };

  // Data confidence sources — freshness from stored last_synced_at / newest records.
  const cfg = (name) => {
    const rec = integrations.find(i => i.name === name);
    if (!rec) return null;
    try { return JSON.parse(rec.config || '{}').last_synced_at || null; } catch { return null; }
  };
  const newest = (arr, field) => arr.reduce((max, r) => {
    const v = r[field] ? new Date(r[field]).getTime() : 0;
    return v > max ? v : max;
  }, 0);
  const metaSync = spendMappings.filter(m => m.platform === 'meta').reduce((m, r) => Math.max(m, r.last_synced_at ? new Date(r.last_synced_at).getTime() : 0), 0);
  const googleSync = spendMappings.filter(m => m.platform === 'google_ads').reduce((m, r) => Math.max(m, r.last_synced_at ? new Date(r.last_synced_at).getTime() : 0), 0);
  const tiktokSync = spendMappings.filter(m => m.platform === 'tiktok').reduce((m, r) => Math.max(m, r.last_synced_at ? new Date(r.last_synced_at).getTime() : 0), 0);
  const leadSync = newest(leads.slice(0, 5), 'created_date');

  const confidenceSources = [
    { label: 'Lead ingestion', at: leadSync || null },
    { label: 'Stripe', at: cfg('stripe') },
    { label: 'Xero', at: cfg('xero') },
    { label: 'Mercury', at: cfg('mercury') },
    { label: 'Meta Ads', at: metaSync || null },
    { label: 'Buyer feedback', at: newest(payments, 'paid_date') || null },
    { label: 'Google Ads', at: googleSync || null },
    { label: 'TikTok', at: tiktokSync || null },
    { label: 'Supplier statements', at: newest(payouts, 'updated_date') || null },
    { label: 'Slack', at: cfg('slack') },
  ];

  const { kpis, stats } = truth;

  return (
    <div>
      <PageHeader title="Overview" subtitle="Source of financial truth — profit, revenue, cost and reconciliation health">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="text-[11px] text-muted-foreground whitespace-nowrap">
            Period: <span className="text-foreground font-medium">{PERIOD_LABELS[period]}</span>
          </div>
          <PeriodTabs
            value={period}
            onChange={setPeriod}
            custom={custom}
            onCustomChange={setCustom}
            extra={
              <button
                onClick={() => setCompare(c => !c)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium border transition-colors ${compare ? 'bg-primary/15 text-primary border-primary/30' : 'bg-card border-border text-muted-foreground hover:text-foreground'}`}
              >
                <GitCompareArrows className="w-3.5 h-3.5" /> Compare
              </button>
            }
          />
          <RefreshButton onClick={() => qc.invalidateQueries()} />
        </div>
      </PageHeader>

      {/* Grouped KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div>
          <GroupedKpiCard label="Revenue" headline={kpis.revenue.headline} subLabel="Verified" sub={kpis.revenue.sub} gap={kpis.revenue.gap} icon={DollarSign} />
          {compare && <div className="text-[11px] text-muted-foreground mt-1 px-1">Booked {cmpChip(kpis.revenue.headline, priorTruth?.kpis.revenue.headline)}</div>}
        </div>
        <div>
          <GroupedKpiCard label="Profit" headline={kpis.profit.headline} subLabel="Cash" sub={kpis.profit.sub} gap={kpis.profit.gap} icon={TrendingUp} />
          {compare && <div className="text-[11px] text-muted-foreground mt-1 px-1">Reported {cmpChip(kpis.profit.headline, priorTruth?.kpis.profit.headline)}</div>}
        </div>
        <div>
          <GroupedKpiCard label="Ad Spend" headline={kpis.adSpend.headline} subLabel="Paid" sub={kpis.adSpend.sub} gap={kpis.adSpend.gap} icon={Megaphone} />
          {compare && <div className="text-[11px] text-muted-foreground mt-1 px-1">Tracked {cmpChip(kpis.adSpend.headline, priorTruth?.kpis.adSpend.headline)}</div>}
        </div>
        <div>
          <GroupedKpiCard label="Supplier Cost" headline={kpis.supplierCost.headline} subLabel="Paid" sub={kpis.supplierCost.sub} gap={kpis.supplierCost.gap} icon={Users} />
          {compare && <div className="text-[11px] text-muted-foreground mt-1 px-1">Accrued {cmpChip(kpis.supplierCost.headline, priorTruth?.kpis.supplierCost.headline)}</div>}
        </div>
      </div>

      {/* Small stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 mt-4">
        <StatCard label="Outstanding" value={money(stats.outstanding)} />
        <StatCard label="Due 7 Days" value={money(stats.due7)} />
        <StatCard label="Overdue" value={money(stats.overdue)} />
        <StatCard label="Short-Paid" value={money(stats.shortPaid)} />
        <StatCard label="True CPL" value={money(stats.trueCpl)} />
        <StatCard label="Cash Margin" value={`${stats.cashMargin}%`} />
        <StatCard label="Data Quality" value={`${stats.dataQuality}/100`} />
      </div>

      {/* Daily finance chart */}
      <div className="bg-card border border-border rounded-[12px] p-5 mt-6">
        <div className="text-[13px] font-semibold text-foreground mb-1">Booked Revenue vs Verified Income vs Ad Spend</div>
        <div className="text-[11px] text-muted-foreground mb-4">The distance between the booked bars and the verified line is money booked but not yet proven.</div>
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={daily}>
            <XAxis dataKey="date" tick={{ fill: '#6B7280', fontSize: 11 }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={24} />
            <YAxis tick={{ fill: '#6B7280', fontSize: 11 }} axisLine={false} tickLine={false} width={44} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
            <Tooltip contentStyle={{ backgroundColor: '#1A1F2B', border: '1px solid #232938', borderRadius: '8px', fontSize: 12 }} labelStyle={{ color: '#E6E9F0' }} formatter={(v) => fmtMoney(v)} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="Booked" fill="#EE5656" radius={[3, 3, 0, 0]} maxBarSize={22} />
            <Line dataKey="Verified" stroke="#22C55E" strokeWidth={2} dot={false} />
            <Line dataKey="Spend" stroke="#F59E0B" strokeWidth={2} strokeDasharray="4 3" dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Action queue */}
      <div className="mt-4">
        <ActionQueueCard
          queue={queue}
          onResolve={(item) => toast.info(`Resolving: ${item.label} — ${item.note}`)}
          onDone={(item) => toast.success(`Marked done: ${item.label}`)}
        />
      </div>

      {/* Donut + Top campaigns */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
        <div className="bg-card border border-border rounded-[12px] p-5">
          <div className="text-[13px] font-semibold text-foreground mb-4">Leads by Status</div>
          {donut.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={donut} cx="50%" cy="50%" innerRadius={52} outerRadius={78} dataKey="value" stroke="none">
                    {donut.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: '#1A1F2B', border: '1px solid #232938', borderRadius: '8px', fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5 mt-2">
                {donut.map(d => (
                  <div key={d.name} className="flex items-center gap-1.5 text-[11px]">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                    <span className="text-muted-foreground">{d.name} ({d.value})</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="h-[200px] flex items-center justify-center text-muted-foreground text-[13px]">No leads in period</div>
          )}
        </div>

        <div className="lg:col-span-2 bg-card border border-border rounded-[12px] overflow-hidden">
          <div className="px-5 py-4 border-b border-border text-[13px] font-semibold text-foreground">Top Campaigns by Cash Profit</div>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead><tr className="border-b border-border text-[10px] text-muted-foreground uppercase tracking-wider bg-muted/40">
                <th className="text-left px-4 py-2.5">Campaign</th><th className="text-right px-4 py-2.5">Leads</th>
                <th className="text-right px-4 py-2.5">Estimated</th><th className="text-right px-4 py-2.5">Verified</th><th className="text-center px-4 py-2.5">Action</th>
              </tr></thead>
              <tbody className="divide-y divide-border">
                {campaigns.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">No campaign data</td></tr>}
                {campaigns.map(c => (
                  <tr key={c.name} className="hover:bg-accent/30">
                    <td className="px-4 py-2.5 text-foreground truncate max-w-[200px]">{c.name}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{int(c.leads)}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{money(c.estimated)}</td>
                    <td className="px-4 py-2.5 text-right font-mono status-sold">{money(c.verified)}</td>
                    <td className="px-4 py-2.5 text-center"><Badge variant="outline" className={`text-[10px] border-0 ${CAMPAIGN_TAG_TONE[c.tag]}`}>{c.tag}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Buyer risk + Data confidence */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4 mb-4">
        <div className="bg-card border border-border rounded-[12px] overflow-hidden">
          <div className="px-5 py-4 border-b border-border text-[13px] font-semibold text-foreground">Buyer Payment Risk</div>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead><tr className="border-b border-border text-[10px] text-muted-foreground uppercase tracking-wider bg-muted/40">
                <th className="text-left px-4 py-2.5">Buyer</th><th className="text-right px-4 py-2.5">Booked</th>
                <th className="text-right px-4 py-2.5">Out / Short</th><th className="text-center px-4 py-2.5">Status</th>
              </tr></thead>
              <tbody className="divide-y divide-border">
                {risk.length === 0 && <tr><td colSpan={4} className="py-6 text-center text-muted-foreground">No buyers</td></tr>}
                {risk.map(r => (
                  <tr key={r.name} className="hover:bg-accent/30">
                    <td className="px-4 py-2.5 text-foreground truncate max-w-[160px]">{r.name}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{money(r.booked)}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{money(r.out > 0.01 ? r.out : r.short)}</td>
                    <td className="px-4 py-2.5 text-center"><Badge variant="outline" className={`text-[10px] border-0 ${RISK_TONE[r.status]}`}>{r.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <DataConfidenceCard sources={confidenceSources} />
      </div>
    </div>
  );
}