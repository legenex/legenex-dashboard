import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import PageHeader from '@/components/shared/PageHeader';
import PeriodTabs from '@/components/shared/PeriodTabs';
import RefreshButton from '@/components/shared/RefreshButton';
import GroupedKpiCard from '@/components/overview/GroupedKpiCard';
import StatCard from '@/components/overview/StatCard';
import ActionQueueCard from '@/components/overview/ActionQueueCard';
import DataConfidenceCard from '@/components/overview/DataConfidenceCard';
import AiAnalystBand from '@/components/overview/AiAnalystBand';
import ActivityStreamBar from '@/components/overview/ActivityStreamBar';
import StatusStripBar from '@/components/overview/StatusStripBar';
import Reveal from '@/components/overview/Reveal';
import { Badge } from '@/components/ui/badge';
import {
  Bar, Line, ComposedChart, XAxis, YAxis, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import {
  DollarSign, TrendingUp, Megaphone, Users, GitCompareArrows, ArrowUpRight,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { resolvePeriod, PERIOD_LABELS } from '@/lib/periodRange';
import {
  financialTruth, actionQueue, financeDonut, dailyFinance, topCampaigns, buyerRisk, fmtMoney,
} from '@/lib/overviewFinance';
import { money, int } from '@/lib/reportMetrics';
import useAiBriefing from '@/hooks/useAiBriefing';
import { toast } from 'sonner';

const CAMPAIGN_TAG_TONE = { Scale: 'status-sold-bg status-sold', Watch: 'status-warn-bg status-unsold', Cut: 'status-error-bg status-error' };
const RISK_TONE = {
  Overdue: 'status-error-bg status-error',
  Outstanding: 'status-warn-bg status-unsold',
  Overpaid: 'bg-status-duplicate status-duplicate',
  Settled: 'status-sold-bg status-sold',
};
// Buyer-risk status -> the label copy the command center uses.
const RISK_LABEL = { Overdue: 'Short Paid', Outstanding: 'No Payment Source', Overpaid: 'Overpaid', Settled: 'On Track' };

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
  const { data: errors = [] } = useQuery({ queryKey: ['ov-errors'], queryFn: () => base44.entities.ErrorLog.list('-created_date', 500) });
  const { data: integrations = [] } = useQuery({ queryKey: ['integration-configs'], queryFn: () => base44.entities.IntegrationConfig.list() });
  const { data: spendMappings = [] } = useQuery({ queryKey: ['adspend-mappings'], queryFn: () => base44.entities.AdSpendMapping.list() });
  const { data: leadSources = [] } = useQuery({ queryKey: ['lead-sources'], queryFn: () => base44.entities.LeadSource.list('-created_date', 100) });

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

  // Prior window (always) for the AI briefing context, independent of the Compare toggle.
  const briefPrior = useMemo(() => {
    const len = win.end.getTime() - win.start.getTime();
    const prior = { start: new Date(win.start.getTime() - len), end: new Date(win.start.getTime()) };
    return financialTruth(dataset, prior);
  }, [win, leads, buyers, suppliers, invoices, payments, payouts, adSpend, txns]);

  const cmpChip = (cur, prev) => {
    if (!compare || prev == null) return null;
    const d = prev === 0 ? null : Math.round(((cur - prev) / Math.abs(prev)) * 100);
    if (d == null) return null;
    return <span className={`ml-2 text-[11px] ${d >= 0 ? 'status-sold' : 'status-error'}`}>{d >= 0 ? '+' : ''}{d}%</span>;
  };

  const { kpis, stats } = truth;

  // ---- AI Analyst briefing summary (revenue-aware finance truth) ----
  const briefingSummary = useMemo(() => ({
    period: PERIOD_LABELS[period],
    revenue: { booked: Math.round(truth.bookedRevenue), verified: Math.round(truth.verifiedRevenue), gap: Math.round(kpis.revenue.gap) },
    profit: { reported: Math.round(kpis.profit.headline), cash: Math.round(kpis.profit.sub) },
    adSpend: { tracked: Math.round(kpis.adSpend.headline), paid: Math.round(kpis.adSpend.sub) },
    supplierCost: { accrued: Math.round(kpis.supplierCost.headline), paid: Math.round(kpis.supplierCost.sub) },
    outstanding: Math.round(stats.outstanding),
    overdue: Math.round(stats.overdue),
    totalAtRisk: Math.round(queue.totalAtRisk),
    topGaps: queue.items.slice(0, 4).map(i => ({ label: i.label, name: i.name, amount: Math.round(i.amount) })),
    topCampaigns: campaigns.slice(0, 3).map(c => ({ name: c.name, estimated: Math.round(c.estimated), verified: Math.round(c.verified), falseProfit: c.falseProfit })),
    leadCount: truth.wLeads.length,
    prior: { bookedRevenue: Math.round(briefPrior.bookedRevenue), reportedProfit: Math.round(briefPrior.kpis.profit.headline), totalAtRisk: Math.round(actionQueue(briefPrior, txns).totalAtRisk) },
  }), [truth, kpis, stats, queue, campaigns, briefPrior, period, txns]);

  // Signature ensures we only regenerate the briefing when the numbers actually change.
  const briefSignature = useMemo(() => JSON.stringify([
    period, Math.round(truth.bookedRevenue), Math.round(truth.verifiedRevenue), Math.round(queue.totalAtRisk), truth.wLeads.length,
  ]), [period, truth, queue]);

  const briefing = useAiBriefing(briefingSummary, briefSignature);

  // ---- Data confidence sources ----
  const cfg = (name) => {
    const rec = integrations.find(i => i.name === name);
    if (!rec) return null;
    try { return JSON.parse(rec.config || '{}').last_synced_at || null; } catch { return null; }
  };
  const newest = (arr, field) => arr.reduce((max, r) => {
    const v = r[field] ? new Date(r[field]).getTime() : 0;
    return v > max ? v : max;
  }, 0);
  const platSync = (plat) => spendMappings.filter(m => m.platform === plat).reduce((m, r) => Math.max(m, r.last_synced_at ? new Date(r.last_synced_at).getTime() : 0), 0);
  const leadSync = newest(leads.slice(0, 5), 'created_date');

  const confidenceSources = [
    { label: 'Lead ingestion', at: leadSync || null },
    { label: 'Stripe', at: cfg('stripe') },
    { label: 'Xero', at: cfg('xero') },
    { label: 'Mercury', at: cfg('mercury') },
    { label: 'Meta Ads', at: platSync('meta') || null },
    { label: 'Buyer feedback', at: newest(payments, 'paid_date') || null },
    { label: 'Google Ads', at: platSync('google_ads') || null },
    { label: 'TikTok', at: platSync('tiktok') || null },
    { label: 'Supplier statements', at: newest(payouts, 'updated_date') || null },
    { label: 'Slack', at: cfg('slack') },
    ...leadSources.filter(s => s.enabled).map(s => ({ label: s.name, at: s.last_synced_at || null })),
  ];

  // ---- Live activity stream chips ----
  const activityEvents = useMemo(() => {
    const ev = [];
    const lastPay = payments[0];
    if (lastPay) ev.push({ id: 'pay', tone: 'green', text: `Payment matched — ${lastPay.buyer_name || 'buyer'} ${fmtMoney(lastPay.amount)}` });
    if (queue.items[0]) ev.push({ id: 'gap', tone: 'amber', text: `Action item open — ${queue.items[0].label} · ${queue.items[0].name}` });
    const lastLead = leads[0];
    if (lastLead) ev.push({ id: 'lead', tone: 'blue', text: `New lead in — ${lastLead.supplier_name || 'source'} · ${lastLead.final_status || 'processing'}` });
    if (errors[0]) ev.push({ id: 'err', tone: 'red', text: `Error logged — ${errors[0].stage}: ${errors[0].message}` });
    if (ev.length === 0) ev.push({ id: 'idle', tone: 'green', text: 'All systems nominal — no new events' });
    return ev;
  }, [payments, queue, leads, errors]);

  // ---- Bottom status strip ----
  const lastLeadAt = leads[0]?.created_date;
  const errorsToday = errors.filter(e => {
    const d = e.created_date ? new Date(e.created_date) : null;
    return d && (Date.now() - d.getTime()) < 86400000;
  }).length;
  const unmatchedIncome = txns.filter(t => !t.matched_entity_type && t.amount > 0).reduce((a, t) => a + Math.abs(Number(t.amount) || 0), 0);
  const matchQueueDepth = txns.filter(t => !t.matched_entity_type).length;

  const stripItems = [
    { label: 'Ingest endpoint', value: 'Live', tone: 'good', dot: true },
    { label: 'Last lead', value: lastLeadAt ? formatDistanceToNow(new Date(lastLeadAt), { addSuffix: true }) : '—', tone: 'neutral' },
    { label: 'Errors today', value: int(errorsToday), tone: errorsToday > 0 ? 'bad' : 'good' },
    { label: 'Match queue', value: int(matchQueueDepth), tone: matchQueueDepth > 0 ? 'warn' : 'good' },
    { label: 'Open variances', value: int(queue.items.length), tone: queue.items.length > 0 ? 'warn' : 'good' },
    { label: 'Unmatched income', value: fmtMoney(unmatchedIncome), tone: unmatchedIncome > 0 ? 'warn' : 'good' },
  ];

  return (
    <div>
      <ActivityStreamBar events={activityEvents} />

      <PageHeader title="Overview" subtitle="One truth: what was booked, what cash is verified, and the gap.">
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

      {/* AI Analyst summary band */}
      <Reveal>
        <AiAnalystBand text={briefing.text} loading={briefing.loading} error={briefing.error} onRefresh={briefing.refresh} />
      </Reveal>

      {/* Grouped KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
        {[
          { key: 'revenue', label: 'Revenue', subLabel: 'Verified', icon: DollarSign, cmp: 'Booked' },
          { key: 'profit', label: 'Profit', subLabel: 'Cash', icon: TrendingUp, cmp: 'Reported' },
          { key: 'adSpend', label: 'Ad Spend', subLabel: 'Paid', icon: Megaphone, cmp: 'Tracked' },
          { key: 'supplierCost', label: 'Supplier Cost', subLabel: 'Paid', icon: Users, cmp: 'Accrued' },
        ].map((c, i) => (
          <Reveal key={c.key} delay={0.05 * i}>
            <GroupedKpiCard label={c.label} headline={kpis[c.key].headline} subLabel={c.subLabel} sub={kpis[c.key].sub} gap={kpis[c.key].gap} icon={c.icon} />
            {compare && <div className="text-[11px] text-muted-foreground mt-1 px-1">{c.cmp} {cmpChip(kpis[c.key].headline, priorTruth?.kpis[c.key].headline)}</div>}
          </Reveal>
        ))}
      </div>

      {/* Small stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 mt-4">
        {[
          { label: 'Outstanding', count: stats.outstanding, render: (n) => money(n) },
          { label: 'Due 7 Days', count: stats.due7, render: (n) => money(n) },
          { label: 'Overdue', count: stats.overdue, render: (n) => money(n) },
          { label: 'Short-Paid', count: stats.shortPaid, render: (n) => money(n) },
          { label: 'True CPL', count: stats.trueCpl, render: (n) => money(n) },
          { label: 'Cash Margin', count: stats.cashMargin, render: (n) => `${Math.round(n)}%` },
          { label: 'Data Quality', count: stats.dataQuality, render: (n) => `${Math.round(n)}/100` },
        ].map((s, i) => (
          <Reveal key={s.label} delay={0.03 * i}>
            <StatCard label={s.label} count={s.count} render={s.render} />
          </Reveal>
        ))}
      </div>

      {/* Daily finance chart */}
      <Reveal delay={0.05}>
        <div className="bg-card border border-border rounded-[12px] p-5 mt-6">
          <div className="text-[13px] font-semibold text-foreground mb-1">Booked Revenue vs Verified Income vs Ad Spend</div>
          <div className="text-[11px] text-muted-foreground mb-4">The distance between the booked bars and the verified line is money booked but not yet proven.</div>
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={daily}>
              <XAxis dataKey="date" tick={{ fill: '#8B95A8', fontSize: 11 }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={24} />
              <YAxis tick={{ fill: '#8B95A8', fontSize: 11 }} axisLine={false} tickLine={false} width={44} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip contentStyle={{ backgroundColor: '#182030', border: '1px solid #243044', borderRadius: '8px', fontSize: 12 }} labelStyle={{ color: '#EEF2F8' }} formatter={(v) => fmtMoney(v)} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="Booked" fill="#E5484D" radius={[3, 3, 0, 0]} maxBarSize={22} animationDuration={800} />
              <Line dataKey="Verified" stroke="#3DD68C" strokeWidth={2} dot={false} animationDuration={900} />
              <Line dataKey="Spend" stroke="#8B95A8" strokeWidth={2} strokeDasharray="4 3" dot={false} animationDuration={900} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Reveal>

      {/* Action queue */}
      <Reveal delay={0.05} className="mt-4 block">
        <ActionQueueCard
          queue={queue}
          onResolve={(item) => toast.info(`Resolving: ${item.label} — ${item.name}`)}
          onDone={(item) => toast.success(`Marked done: ${item.label}`)}
        />
      </Reveal>

      {/* Donut + Top campaigns */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
        <Reveal delay={0.05}>
          <div className="bg-card border border-border rounded-[12px] p-5">
            <div className="text-[13px] font-semibold text-foreground mb-4">Leads by Status</div>
            {donut.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={donut} cx="50%" cy="50%" innerRadius={52} outerRadius={78} dataKey="value" stroke="none" animationDuration={800} paddingAngle={2}>
                      {donut.map((d, i) => <Cell key={i} fill={d.color} />)}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: '#182030', border: '1px solid #243044', borderRadius: '8px', fontSize: 12 }} />
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
        </Reveal>

        <Reveal delay={0.1} className="lg:col-span-2 block">
          <div className="bg-card border border-border rounded-[12px] overflow-hidden">
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
                      <td className="px-4 py-2.5 text-foreground truncate max-w-[200px]">
                        <div className="flex items-center gap-2">
                          <span className="truncate">{c.name}</span>
                          {c.falseProfit && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded status-error-bg status-error whitespace-nowrap">FALSE PROFIT</span>}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono">{int(c.leads)}</td>
                      <td className="px-4 py-2.5 text-right font-mono">{money(c.estimated)}</td>
                      <td className={`px-4 py-2.5 text-right font-mono ${c.verified > 0 ? 'status-sold' : 'text-muted-foreground'}`}>{money(c.verified)}</td>
                      <td className="px-4 py-2.5 text-center"><Badge variant="outline" className={`text-[10px] border-0 ${CAMPAIGN_TAG_TONE[c.tag]}`}>{c.tag}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Reveal>
      </div>

      {/* Buyer risk + Data confidence */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        <Reveal delay={0.05}>
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
                      <td className="px-4 py-2.5 text-center"><Badge variant="outline" className={`text-[10px] border-0 ${RISK_TONE[r.status]}`}>{RISK_LABEL[r.status] || r.status}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Reveal>

        <Reveal delay={0.1}>
          <DataConfidenceCard sources={confidenceSources} />
          <div className="mt-2 text-right">
            <Link to="/settings?tab=integrations" className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline">
              Manage sources <ArrowUpRight className="w-3 h-3" />
            </Link>
          </div>
        </Reveal>
      </div>

      {/* Bottom status strip */}
      <Reveal delay={0.05} className="mt-4 mb-2 block">
        <StatusStripBar items={stripItems} />
      </Reveal>
    </div>
  );
}