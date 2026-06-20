import React, { useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import PageHeader from '@/components/shared/PageHeader';
import KpiCard from '@/components/overview/KpiCard';
import StatCard from '@/components/overview/StatCard';
import HealthStrip from '@/components/overview/HealthStrip';
import StatusPill from '@/components/shared/StatusPill';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Percent, AlertTriangle, Clock, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { format, subDays, startOfDay, startOfWeek, startOfMonth, isAfter } from 'date-fns';

const PIE_COLORS = ['#22C55E', '#F59E0B', '#EF4444'];

export default function Overview() {
  const qc = useQueryClient();

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

  const { data: connectors = [] } = useQuery({
    queryKey: ['lb-connectors'],
    queryFn: () => base44.entities.LeadByteConnector.filter({ enabled: true }),
  });

  const { data: appSettingsArr = [] } = useQuery({
    queryKey: ['app-settings'],
    queryFn: () => base44.entities.AppSettings.list(),
  });

  const publicBaseUrl = appSettingsArr[0]?.public_base_url || 'https://api.legenex.com';
  const endpointUrl = `${publicBaseUrl}/functions/leads`;

  const { data: errors = [] } = useQuery({
    queryKey: ['errors-today'],
    queryFn: () => base44.entities.ErrorLog.list('-created_date', 100),
  });

  const now = new Date();
  const todayStart = startOfDay(now);
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const monthStart = startOfMonth(now);

  const leadsToday = leads.filter(l => isAfter(new Date(l.created_date), todayStart));
  const leadsWeek = leads.filter(l => isAfter(new Date(l.created_date), weekStart));
  const leadsMonth = leads.filter(l => isAfter(new Date(l.created_date), monthStart));

  // Prior period comparisons
  const yesterdayStart = subDays(todayStart, 1);
  const leadsYesterday = leads.filter(l => {
    const d = new Date(l.created_date);
    return isAfter(d, yesterdayStart) && !isAfter(d, todayStart);
  });
  const todayTrend = leadsYesterday.length > 0 
    ? Math.round(((leadsToday.length - leadsYesterday.length) / leadsYesterday.length) * 100) 
    : null;

  const soldLeads = leads.filter(l => l.final_status === 'Sold');
  const soldRate = leads.length > 0 ? Math.round((soldLeads.length / leads.length) * 100) : 0;

  const errorsToday = errors.filter(e => isAfter(new Date(e.created_date), todayStart));

  const avgProcessTime = leads.filter(l => l.process_time_ms).length > 0
    ? Math.round(leads.filter(l => l.process_time_ms).reduce((s, l) => s + l.process_time_ms, 0) / leads.filter(l => l.process_time_ms).length)
    : 0;

  // Donut data
  const donutData = [
    { name: 'Sold', value: leads.filter(l => l.final_status === 'Sold').length },
    { name: 'Unsold', value: leads.filter(l => l.final_status === 'Unsold').length },
    { name: 'Error', value: leads.filter(l => l.final_status === 'Error').length },
  ].filter(d => d.value > 0);

  // 14-day chart
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
    });
  }

  const recent20 = leads.slice(0, 20);

  return (
    <div>
      <PageHeader title="Overview" subtitle="Real-time pipeline health and lead metrics" />

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
        leadByteConnector={connectors[0]?.api_name}
        lastLeadTime={leads[0]?.created_date}
      />

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
        <KpiCard label="Leads Today" value={leadsToday.length} trend={todayTrend} trendLabel="vs yesterday" />
        <KpiCard label="This Week" value={leadsWeek.length} />
        <KpiCard label="This Month" value={leadsMonth.length} />
        <KpiCard label="All Time" value={leads.length} />
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-3 gap-4 mt-4">
        <StatCard label="Sold Rate" value={`${soldRate}%`} icon={Percent} />
        <StatCard label="Errors Today" value={errorsToday.length} icon={AlertTriangle} />
        <StatCard label="Avg Process Time" value={`${avgProcessTime}ms`} icon={Clock} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
        <div className="lg:col-span-2 bg-card border border-border rounded-[10px] p-5">
          <div className="text-[13px] font-semibold text-foreground mb-4">Leads — Last 14 Days</div>
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

      {/* Per-Supplier Breakdown */}
      {(() => {
        const supplierNames = [...new Set(leads.map(l => l.supplier_name).filter(Boolean))];
        if (supplierNames.length === 0) return null;
        return (
          <div className="bg-card border border-border rounded-[10px] mt-4 overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <div className="text-[13px] font-semibold text-foreground">Supplier Breakdown</div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    {['Supplier', 'Total', 'Sold', 'Unsold', 'Error', 'Sold Rate', 'Avg Time'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {supplierNames.map(name => {
                    const sl = leads.filter(l => l.supplier_name === name);
                    const sold = sl.filter(l => l.final_status === 'Sold').length;
                    const unsold = sl.filter(l => l.final_status === 'Unsold').length;
                    const err = sl.filter(l => l.final_status === 'Error').length;
                    const rate = sl.length > 0 ? Math.round((sold / sl.length) * 100) : 0;
                    const withTime = sl.filter(l => l.process_time_ms);
                    const avgT = withTime.length > 0 ? Math.round(withTime.reduce((s, l) => s + l.process_time_ms, 0) / withTime.length) : 0;
                    return (
                      <tr key={name} className="hover:bg-accent/40 transition-colors">
                        <td className="px-4 py-3 font-medium text-foreground">{name}</td>
                        <td className="px-4 py-3 font-mono text-[12px]">{sl.length}</td>
                        <td className="px-4 py-3 font-mono text-[12px] status-sold">{sold}</td>
                        <td className="px-4 py-3 font-mono text-[12px] status-unsold">{unsold}</td>
                        <td className="px-4 py-3 font-mono text-[12px] status-error">{err}</td>
                        <td className="px-4 py-3 font-mono text-[12px]">{rate}%</td>
                        <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground">{avgT ? `${avgT}ms` : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}

      {/* Recent Activity */}
      <div className="bg-card border border-border rounded-[10px] mt-4 overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <div className="text-[13px] font-semibold text-foreground">Recent Activity</div>
        </div>
        <div className="divide-y divide-border">
          {recent20.length === 0 && (
            <div className="px-5 py-8 text-center text-muted-foreground text-[13px]">No leads yet</div>
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
    </div>
  );
}