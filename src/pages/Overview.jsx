import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import PageHeader from '@/components/shared/PageHeader';
import KpiCard from '@/components/overview/KpiCard';
import StatCard from '@/components/overview/StatCard';
import HealthStrip from '@/components/overview/HealthStrip';
import StatusPill from '@/components/shared/StatusPill';
import DateRangeSelector, { RANGE_LABELS } from '@/components/overview/DateRangeSelector';
import TopRejectionReasons from '@/components/overview/TopRejectionReasons';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Percent, AlertTriangle, Copy, Inbox, Zap, Clock, DollarSign, CheckCircle2, XCircle } from 'lucide-react';
import RefreshButton from '@/components/shared/RefreshButton';
import { toast } from 'sonner';
import { format, subDays, startOfDay, isAfter } from 'date-fns';

const PIE_COLORS = ['#22C55E', '#F59E0B', '#EF4444', '#A855F7', '#06B6D4'];

export default function Overview() {
  const qc = useQueryClient();
  const [range, setRange] = useState('today');

  // Real-time lead updates
  useEffect(() => {
    const unsub = base44.entities.Lead.subscribe(() => {
      qc.invalidateQueries({ queryKey: ['leads-all'] });
    });
    return unsub;
  }, [qc]);

  const { data: leads = [] } = useQuery({
    queryKey: ['leads-all'],
    queryFn: () => base44.entities.Lead.filter({ archived: false }, '-created_date', 500),
  });

  const { data: hlrArr = [] } = useQuery({
    queryKey: ['hlr-settings'],
    queryFn: () => base44.entities.HlrSettings.list(),
  });

  const { data: appSettingsArr = [] } = useQuery({
    queryKey: ['app-settings'],
    queryFn: () => base44.entities.AppSettings.list(),
  });

  const publicBaseUrl = appSettingsArr[0]?.public_base_url || 'https://api.legenex.com';
  const endpointUrl = `${publicBaseUrl}/functions/leads`;

  const { data: errors = [] } = useQuery({
    queryKey: ['errors-all'],
    queryFn: () => base44.entities.ErrorLog.list('-created_date', 500),
  });

  const now = new Date();

  // Range window
  const rangeStart = range === 'today'
    ? startOfDay(now)
    : range === '7d'
      ? subDays(now, 7)
      : range === '30d'
        ? subDays(now, 30)
        : null; // all time

  // Prior period (for trend comparisons)
  const priorStart = range === 'today'
    ? subDays(startOfDay(now), 1)
    : range === '7d'
      ? subDays(now, 14)
      : range === '30d'
        ? subDays(now, 60)
        : null;
  const priorEnd = range === 'today'
    ? startOfDay(now)
    : range === '7d'
      ? subDays(now, 7)
      : range === '30d'
        ? subDays(now, 30)
        : null;

  const inRange = (d) => rangeStart ? isAfter(new Date(d), rangeStart) : true;
  const inPrior = (d) => {
    const dt = new Date(d);
    return priorStart ? (isAfter(dt, priorStart) && !isAfter(dt, priorEnd)) : false;
  };

  const rangeLeads = leads.filter(l => inRange(l.created_date));
  const priorLeads = leads.filter(l => inPrior(l.created_date));

  const sumRevenue = (arr) => arr.reduce((s, l) => s + (Number(l.revenue) || 0), 0);
  const rangeRevenue = sumRevenue(rangeLeads);
  const priorRevenue = sumRevenue(priorLeads);

  const pctTrend = (cur, prev) => prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null;
  const leadsTrend = pctTrend(rangeLeads.length, priorLeads.length);
  const revenueTrend = pctTrend(rangeRevenue, priorRevenue);

  const soldLeads = rangeLeads.filter(l => l.final_status === 'Sold');
  const unsoldLeads = rangeLeads.filter(l => l.final_status === 'Unsold');
  const soldRate = rangeLeads.length > 0 ? Math.round((soldLeads.length / rangeLeads.length) * 100) : 0;

  const errorsInRange = errors.filter(e => inRange(e.created_date));
  const queuedLeads = rangeLeads.filter(l => l.final_status === 'Queued');
  const duplicateLeads = rangeLeads.filter(l => l.final_status === 'Duplicate');

  // CAPI fires in range
  const capiFires = rangeLeads.reduce((count, l) => {
    if (!l.capi_log) return count;
    try { return count + JSON.parse(l.capi_log).length; } catch { return count; }
  }, 0);

  const withTime = rangeLeads.filter(l => l.process_time_ms);
  const avgProcessTime = withTime.length > 0
    ? Math.round(withTime.reduce((s, l) => s + l.process_time_ms, 0) / withTime.length)
    : 0;

  // Donut data (scoped by range)
  const donutData = [
    { name: 'Sold', value: rangeLeads.filter(l => l.final_status === 'Sold').length },
    { name: 'Unsold', value: rangeLeads.filter(l => l.final_status === 'Unsold').length },
    { name: 'Error', value: rangeLeads.filter(l => l.final_status === 'Error').length },
    { name: 'Queued', value: rangeLeads.filter(l => l.final_status === 'Queued').length },
    { name: 'Duplicate', value: rangeLeads.filter(l => l.final_status === 'Duplicate').length },
  ].filter(d => d.value > 0);

  // 14-day chart - always 14 days regardless of selected range
  const chartData = [];
  for (let i = 13; i >= 0; i--) {
    const day = subDays(now, i);
    const dayStr = format(day, 'MMM dd');
    const dayStart = startOfDay(day);
    const dayEnd = startOfDay(subDays(now, i - 1));
    const dayLeads = leads.filter(l => {
      const d = new Date(l.created_date);
      return isAfter(d, dayStart) && (i === 0 || !isAfter(d, dayEnd));
    });
    chartData.push({
      date: dayStr,
      Sold: dayLeads.filter(l => l.final_status === 'Sold').length,
      Unsold: dayLeads.filter(l => l.final_status === 'Unsold').length,
      Error: dayLeads.filter(l => l.final_status === 'Error').length,
      Queued: dayLeads.filter(l => l.final_status === 'Queued').length,
      Duplicate: dayLeads.filter(l => l.final_status === 'Duplicate').length,
    });
  }

  const recent20 = rangeLeads.slice(0, 20);

  return (
    <div>
      <PageHeader title="Overview" subtitle="Daily source-of-truth dashboard - real-time pipeline health and lead metrics">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="text-[11px] text-muted-foreground whitespace-nowrap">
            Showing: <span className="text-foreground font-medium">{RANGE_LABELS[range]}</span>
            <span className="mx-2 text-border">·</span>
            as of {format(now, 'HH:mm')}
          </div>
          <DateRangeSelector value={range} onChange={setRange} />
          <RefreshButton onClick={() => qc.invalidateQueries()} />
        </div>
      </PageHeader>

      {/* Endpoint Card */}
      <div className="bg-card border border-primary/20 rounded-[10px] p-4 flex items-center gap-4 mb-4">
        <div className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Supplier Endpoint</div>
        <code className="flex-1 font-mono text-[13px] text-primary truncate">{endpointUrl}</code>
        <button
          onClick={() => { navigator.clipboard.writeText(endpointUrl); toast.success('Endpoint URL copied'); }}
          className="flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-lg border border-border hover:border-primary/40"
        >
          <Copy className="w-3.5 h-3.5" /> Copy
        </button>
      </div>

      <HealthStrip
        hlrProvider={hlrArr[0]?.provider_name}
        lastLeadTime={leads[0]?.created_date}
      />

      {/* Per-Supplier Breakdown */}
      {(() => {
        const supplierNames = [...new Set(rangeLeads.map(l => l.supplier_name).filter(Boolean))];
        if (supplierNames.length === 0) return null;
        return (
          <div className="bg-card border border-border rounded-[10px] mt-4 overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <div className="text-[13px] font-semibold text-foreground">Supplier Breakdown</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">{RANGE_LABELS[range]} · revenue by source</div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    {['Supplier', 'Total', 'Sold', 'Revenue', 'Unsold', 'Queued', 'Dup', 'Error', 'Sold Rate', 'Avg Time'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {supplierNames.map(name => {
                    const sl = rangeLeads.filter(l => l.supplier_name === name);
                    const sold = sl.filter(l => l.final_status === 'Sold').length;
                    const revenue = sumRevenue(sl);
                    const unsold = sl.filter(l => l.final_status === 'Unsold').length;
                    const queued = sl.filter(l => l.final_status === 'Queued').length;
                    const dup = sl.filter(l => l.final_status === 'Duplicate').length;
                    const err = sl.filter(l => l.final_status === 'Error').length;
                    const rate = sl.length > 0 ? Math.round((sold / sl.length) * 100) : 0;
                    const slWithTime = sl.filter(l => l.process_time_ms);
                    const avgT = slWithTime.length > 0 ? Math.round(slWithTime.reduce((s, l) => s + l.process_time_ms, 0) / slWithTime.length) : 0;
                    return (
                      <tr key={name} className="hover:bg-accent/40 transition-colors">
                        <td className="px-4 py-3 font-medium text-foreground">{name}</td>
                        <td className="px-4 py-3 font-mono text-[12px]">{sl.length}</td>
                        <td className="px-4 py-3 font-mono text-[12px] status-sold">{sold}</td>
                        <td className="px-4 py-3 font-mono text-[12px] text-foreground">${revenue.toFixed(2)}</td>
                        <td className="px-4 py-3 font-mono text-[12px] status-unsold">{unsold}</td>
                        <td className="px-4 py-3 font-mono text-[12px] status-queued">{queued}</td>
                        <td className="px-4 py-3 font-mono text-[12px] status-duplicate">{dup}</td>
                        <td className="px-4 py-3 font-mono text-[12px] status-error">{err}</td>
                        <td className="px-4 py-3 font-mono text-[12px]">{rate}%</td>
                        <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground">{avgT ? `${avgT}ms` : '-'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}

      {/* KPI Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mt-6">
        <KpiCard label="Revenue" value={`$${rangeRevenue.toFixed(2)}`} trend={revenueTrend} trendLabel="vs prior period" icon={DollarSign} />
        <KpiCard label="Leads" value={rangeLeads.length} trend={leadsTrend} trendLabel="vs prior period" icon={Inbox} />
        <KpiCard label="Sold" value={soldLeads.length} icon={CheckCircle2} />
        <KpiCard label="Unsold" value={unsoldLeads.length} icon={XCircle} />
        <KpiCard label="Avg Time" value={avgProcessTime ? `${avgProcessTime}ms` : '-'} icon={Clock} />
      </div>

      <div className="mt-6 mb-3 flex items-center gap-2">
        <div className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider">Pipeline Metrics</div>
        <div className="flex-1 h-px bg-border" />
      </div>
      {/* Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard label="Sold Rate" value={`${soldRate}%`} icon={Percent} />
        <StatCard label="Errors" value={errorsInRange.length} icon={AlertTriangle} />
        <StatCard label="Queued" value={queuedLeads.length} icon={Inbox} />
        <StatCard label="Duplicates" value={duplicateLeads.length} icon={Copy} />
        <StatCard label="CAPI Fires" value={capiFires} icon={Zap} />
      </div>

      <div className="mt-6 mb-3 flex items-center gap-2">
        <div className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider">Analytics</div>
        <div className="flex-1 h-px bg-border" />
      </div>
      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-card border border-border rounded-[10px] p-5">
          <div className="text-[13px] font-semibold text-foreground mb-4">Leads - Last 14 Days</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} barGap={1}>
              <XAxis dataKey="date" tick={{ fill: '#6B7280', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#6B7280', fontSize: 11 }} axisLine={false} tickLine={false} width={30} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1A1F2B', border: '1px solid #232938', borderRadius: '8px', fontSize: 12 }}
                labelStyle={{ color: '#E6E9F0' }}
              />
              <Bar dataKey="Sold" stackId="a" fill="#22C55E" radius={[0, 0, 0, 0]} />
              <Bar dataKey="Unsold" stackId="a" fill="#F59E0B" />
              <Bar dataKey="Queued" stackId="a" fill="#A855F7" />
              <Bar dataKey="Error" stackId="a" fill="#EF4444" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-card border border-border rounded-[10px] p-5">
          <div className="text-[13px] font-semibold text-foreground mb-4">Outcome Distribution</div>
          {donutData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={donutData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} dataKey="value" stroke="none">
                  {donutData.map((entry, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: '#1A1F2B', border: '1px solid #232938', borderRadius: '8px', fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[220px] flex items-center justify-center text-muted-foreground text-[13px]">No data</div>
          )}
          <div className="flex justify-center gap-4 mt-2">
            {donutData.map((d, i) => (
              <div key={d.name} className="flex items-center gap-1.5 text-[11px]">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: PIE_COLORS[i] }} />
                <span className="text-muted-foreground">{d.name} ({d.value})</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Top Rejection Reasons */}
      <div className="mt-4">
        <TopRejectionReasons leads={rangeLeads} />
      </div>

      {/* Recent Activity */}
      <div className="bg-card border border-border rounded-[10px] mt-4 overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <div className="text-[13px] font-semibold text-foreground">Recent Activity</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">{RANGE_LABELS[range]}</div>
        </div>
        <div className="divide-y divide-border">
          {recent20.length === 0 && (
            <div className="px-5 py-8 text-center text-muted-foreground text-[13px]">No leads in this range</div>
          )}
          {recent20.map(lead => (
            <div key={lead.id} className="px-5 py-3 flex items-center gap-4 hover:bg-accent/50 transition-colors text-[13px]">
              <span className="text-muted-foreground font-mono text-[11px] w-[100px] shrink-0">
                {format(new Date(lead.created_date), 'HH:mm:ss')}
              </span>
              <span className="text-secondary-foreground w-[120px] shrink-0 truncate">{lead.supplier_name}</span>
              <span className="text-foreground flex-1 truncate">{lead.first_name} {lead.last_name}</span>
              <StatusPill status={lead.final_status} />
            </div>
          ))}
        </div>
      </div>

      {/* Footer note */}
      <div className="mt-6 mb-2 text-[11px] text-muted-foreground text-center px-4">
        System of record: Legenex Lead Gateway (go-forward). Historical pre-gateway volume still lives in LeadByte, BigQuery, and Google Sheets - reconciliation in progress.
      </div>
    </div>
  );
}