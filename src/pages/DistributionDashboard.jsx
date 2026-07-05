import React, { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { integrationStatus } from '@/functions/integrationStatus';
import PageHeader from '@/components/shared/PageHeader';
import RefreshButton from '@/components/shared/RefreshButton';
import PeriodTabs from '@/components/shared/PeriodTabs';
import StatusStrip from '@/components/distribution/StatusStrip';
import AiInsightsPanel from '@/components/distribution/AiInsightsPanel';
import { resolvePeriod, priorWindow, PERIOD_LABELS } from '@/lib/periodRange';
import { operationalMetrics, statusDonut, leadsOverTime, supplierBreakdown } from '@/lib/distributionMetrics';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const TOOLTIP_STYLE = { backgroundColor: '#1A1F2B', border: '1px solid #232938', borderRadius: '8px', fontSize: 12 };

function MetricCard({ label, value, tone }) {
  return (
    <div className="bg-card border border-border rounded-[10px] p-4">
      <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{label}</div>
      <div className={`text-[26px] font-bold mt-1 leading-tight font-display ${tone || 'text-foreground'}`}>{value}</div>
    </div>
  );
}

function PctCard({ label, value }) {
  return (
    <div className="bg-card border border-border rounded-[10px] p-3.5">
      <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{label}</div>
      <div className="text-[20px] font-bold text-foreground mt-1 font-display">{value}%</div>
    </div>
  );
}

export default function DistributionDashboard() {
  const qc = useQueryClient();
  const [period, setPeriod] = useState('this_month');
  const [custom, setCustom] = useState({ from: '', to: '' });

  const win = useMemo(() => resolvePeriod(period, custom), [period, custom]);
  const prior = useMemo(() => priorWindow(win), [win]);

  const { data: leads = [] } = useQuery({ queryKey: ['dist-leads'], queryFn: () => base44.entities.Lead.filter({ archived: false }, '-created_date', 2000) });
  const { data: errors = [] } = useQuery({ queryKey: ['dist-errors'], queryFn: () => base44.entities.ErrorLog.list('-created_date', 1000) });
  const { data: hlrArr = [] } = useQuery({ queryKey: ['hlr-settings'], queryFn: () => base44.entities.HlrSettings.list() });
  const { data: emailArr = [] } = useQuery({ queryKey: ['email-val-settings'], queryFn: () => base44.entities.EmailValidationSettings.list() });
  const { data: appSettingsArr = [] } = useQuery({ queryKey: ['app-settings'], queryFn: () => base44.entities.AppSettings.list() });
  const { data: metaCfg } = useQuery({ queryKey: ['meta-config'], queryFn: async () => (await base44.entities.IntegrationConfig.filter({ name: 'meta' }))[0] || null });
  const { data: intStatus } = useQuery({ queryKey: ['integration-status'], queryFn: async () => (await integrationStatus({}))?.data?.status || {} });

  const publicBaseUrl = appSettingsArr[0]?.public_base_url || 'https://api.legenex.com';
  const endpointUrl = `${publicBaseUrl}/functions/leads`;

  const m = useMemo(() => operationalMetrics(leads, errors, win), [leads, errors, win]);
  const priorM = useMemo(() => operationalMetrics(leads, errors, prior), [leads, errors, prior]);
  const donut = useMemo(() => statusDonut(m), [m]);
  const series = useMemo(() => leadsOverTime(m.leads, win), [m.leads, win]);

  const hlrProvider = hlrArr[0]?.provider_name;
  const emailActive = emailArr.length > 0 ? (emailArr[0]?.enabled !== false) : true;

  const connections = [
    { label: 'Meta', active: !!metaCfg },
    { label: 'Slack', active: !!intStatus?.slack },
  ];

  const insightSummary = useMemo(() => ({
    period: PERIOD_LABELS[period],
    current: {
      total: m.total, sold: m.sold, disqualified: m.disqualified, unsold: m.unsold,
      returns: m.returns, rejections: m.rejections, errors: m.errors, conversions: m.conversions,
      pctDq: m.pctDq, pctError: m.pctError, pctRejection: m.pctRejection, convRate: m.convRate,
    },
    prior: {
      total: priorM.total, disqualified: priorM.disqualified, errors: priorM.errors,
      pctDq: priorM.pctDq, pctError: priorM.pctError,
    },
    suppliers: supplierBreakdown(m.leads).slice(0, 15),
  }), [m, priorM, period]);

  return (
    <div>
      <PageHeader title="Distribution Dashboard" subtitle="Operational pipeline health — volume, status mix, verification and source performance">
        <div className="flex items-center gap-3 flex-wrap">
          <PeriodTabs value={period} onChange={setPeriod} custom={custom} onCustomChange={setCustom} />
          <RefreshButton onClick={() => qc.invalidateQueries()} />
        </div>
      </PageHeader>

      <StatusStrip
        endpointUrl={endpointUrl}
        hlrActive={!!hlrProvider}
        hlrLabel={hlrProvider}
        emailActive={emailActive}
        connections={connections}
      />

      {/* Metric cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 mt-4">
        <MetricCard label="Total Leads" value={m.total} />
        <MetricCard label="Sold" value={m.sold} tone="status-sold" />
        <MetricCard label="Disqualified" value={m.disqualified} tone="status-error" />
        <MetricCard label="Unsold" value={m.unsold} tone="status-unsold" />
        <MetricCard label="Returns" value={m.returns} />
        <MetricCard label="Rejections" value={m.rejections} tone="status-error" />
        <MetricCard label="Errors" value={m.errors} tone="status-error" />
        <MetricCard label="Conversions" value={m.conversions} tone="status-sold" />
      </div>

      {/* Percentage cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 mt-3">
        <PctCard label="Sold %" value={m.pctSold} />
        <PctCard label="DQ %" value={m.pctDq} />
        <PctCard label="Unsold %" value={m.pctUnsold} />
        <PctCard label="Return %" value={m.pctReturn} />
        <PctCard label="Rejection %" value={m.pctRejection} />
        <PctCard label="Error %" value={m.pctError} />
        <PctCard label="Conversion Rate" value={m.convRate} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
        <div className="lg:col-span-2 bg-card border border-border rounded-[10px] p-5">
          <div className="text-[13px] font-semibold text-foreground mb-4">Leads Over Time · {PERIOD_LABELS[period]}</div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={series} barGap={1}>
              <XAxis dataKey="date" tick={{ fill: '#6B7280', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#6B7280', fontSize: 11 }} axisLine={false} tickLine={false} width={30} />
              <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={{ color: '#E6E9F0' }} />
              <Bar dataKey="Sold" stackId="a" fill="#22C55E" />
              <Bar dataKey="Disqualified" stackId="a" fill="#F59E0B" />
              <Bar dataKey="Error" stackId="a" fill="#EF4444" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-card border border-border rounded-[10px] p-5">
          <div className="text-[13px] font-semibold text-foreground mb-4">Leads by Status</div>
          {donut.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={donut} cx="50%" cy="50%" innerRadius={58} outerRadius={84} dataKey="value" stroke="none">
                  {donut.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip contentStyle={TOOLTIP_STYLE} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[240px] flex items-center justify-center text-muted-foreground text-[13px]">No data in this period</div>
          )}
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 mt-2">
            {donut.map(d => (
              <div key={d.name} className="flex items-center gap-1.5 text-[11px]">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                <span className="text-muted-foreground">{d.name} ({d.value})</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* AI Insights */}
      <div className="mt-4">
        <AiInsightsPanel summary={insightSummary} periodLabel={PERIOD_LABELS[period]} />
      </div>
    </div>
  );
}