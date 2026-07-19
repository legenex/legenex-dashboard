import React, { useMemo } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts';
import { campaignMetrics } from '@/lib/campaignMetrics';

const money = (v) => `$${Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const pct = (v) => `${Number(v || 0).toFixed(1)}%`;

function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
function leadVertical(l) { return String(l.lead_vertical || l.vertical || '').toLowerCase(); }

// Stats strip + Daily P&L and Lead Volume charts for the campaign detail. A
// campaign is a vertical, so leads are matched by vertical code. Pure UI
// aggregation over records already loaded — no routing/billing logic.
export default function CampaignStatsStrip({ campaign, leads }) {
  const m = useMemo(() => campaignMetrics(campaign, leads), [campaign, leads]);

  const code = String(campaign.vertical || '').toLowerCase();
  const rows = useMemo(() => (code ? leads.filter((l) => leadVertical(l) === code) : []), [leads, code]);

  // 14-day daily series for P&L (revenue/cost) and lead volume.
  const daily = useMemo(() => {
    const days = [];
    const now = new Date();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now); d.setDate(now.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      days.push({ key, label: `${d.getMonth() + 1}/${d.getDate()}`, revenue: 0, cost: 0, leads: 0 });
    }
    const byKey = Object.fromEntries(days.map((d) => [d.key, d]));
    for (const l of rows) {
      const key = new Date(l.created_date || l.processed_at || 0).toISOString().slice(0, 10);
      const d = byKey[key];
      if (!d) continue;
      d.revenue += num(l.revenue);
      d.cost += num(l.supplier_payout);
      d.leads += 1;
    }
    return days.map((d) => ({ ...d, profit: d.revenue - d.cost }));
  }, [rows]);

  const stats = [
    { label: 'Total', value: m.total },
    { label: 'Leads 14D', value: m.leads14d },
    { label: 'Acc %', value: pct(m.acceptedPct) },
    { label: 'DQ %', value: pct(m.dqPct) },
    { label: 'Returned %', value: pct(m.returnedPct) },
    { label: 'Revenue', value: money(m.revenue) },
    { label: 'Cost', value: money(m.cost) },
    { label: 'Profit', value: money(m.profit), accent: m.profit >= 0 },
  ];

  return (
    <div className="space-y-4">
      {/* Stats strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-px rounded-lg border border-border bg-border overflow-hidden">
        {stats.map((s) => (
          <div key={s.label} className="bg-card px-3 py-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{s.label}</div>
            <div className={`text-[15px] font-mono tabular-nums mt-0.5 ${s.accent === false ? 'text-primary' : 'text-foreground'}`}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">Daily P&amp;L</div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={daily} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
              <Line type="monotone" dataKey="revenue" stroke="hsl(var(--chart-1))" dot={false} strokeWidth={2} />
              <Line type="monotone" dataKey="cost" stroke="hsl(var(--chart-2))" dot={false} strokeWidth={2} />
              <Line type="monotone" dataKey="profit" stroke="hsl(var(--primary))" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">Lead Volume</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={daily} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} cursor={{ fill: 'hsl(var(--accent))' }} />
              <Bar dataKey="leads" fill="hsl(var(--chart-1))" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}