import React, { useMemo } from 'react';
import { campaignMetrics } from '@/lib/campaignMetrics';
import { Users, Factory, Tag as TagIcon, Activity } from 'lucide-react';

const money = (v) => `$${Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const pct = (v) => `${Number(v || 0).toFixed(1)}%`;

// At-a-glance summary of the campaign, its buyers, suppliers and leads. Pure UI
// aggregation over records already loaded on the detail page.
export default function CampaignOverviewTab({ campaign, leads, members, buyerName, supplierCount }) {
  const m = useMemo(() => campaignMetrics(campaign, leads), [campaign, leads]);
  const activeBuyers = members.filter((x) => x.active !== false).length;
  const pausedBuyers = members.length - activeBuyers;

  const summaryCards = [
    { icon: Users, label: 'Buyers', value: members.length, sub: `${activeBuyers} active · ${pausedBuyers} paused` },
    { icon: Factory, label: 'Suppliers', value: supplierCount, sub: 'Linked to campaign' },
    { icon: Activity, label: 'Leads (14D)', value: m.leads14d, sub: `${m.total} total` },
    { icon: TagIcon, label: 'Profit', value: money(m.profit), sub: `${pct(m.profitPct)} margin`, accent: m.profit >= 0 },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {summaryCards.map((c) => {
          const Icon = c.icon;
          return (
            <div key={c.label} className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Icon className="w-4 h-4" />
                <span className="text-[11px] uppercase tracking-wider font-medium">{c.label}</span>
              </div>
              <div className={`text-2xl font-mono tabular-nums mt-2 ${c.accent === false ? 'status-error' : 'text-foreground'}`}>{c.value}</div>
              <div className="text-[11px] text-muted-foreground mt-1">{c.sub}</div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Lead breakdown */}
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">Lead Breakdown</div>
          <div className="space-y-2.5">
            {[
              { label: 'Accepted', value: pct(m.acceptedPct), tone: 'status-sold' },
              { label: 'Disqualified', value: pct(m.dqPct), tone: 'status-disqualified' },
              { label: 'Returned', value: pct(m.returnedPct), tone: 'status-returned' },
              { label: 'Duplicate', value: pct(m.duplicatePct), tone: 'status-duplicate' },
            ].map((r) => (
              <div key={r.label} className="flex items-center justify-between">
                <span className="text-[13px] text-muted-foreground">{r.label}</span>
                <span className={`text-[13px] font-mono tabular-nums ${r.tone}`}>{r.value}</span>
              </div>
            ))}
            <div className="flex items-center justify-between border-t border-border pt-2.5">
              <span className="text-[13px] text-foreground font-medium">Revenue</span>
              <span className="text-[13px] font-mono tabular-nums text-foreground">{money(m.revenue)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-foreground font-medium">Cost</span>
              <span className="text-[13px] font-mono tabular-nums text-foreground">{money(m.cost)}</span>
            </div>
          </div>
        </div>

        {/* Top buyers */}
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">Routing Order</div>
          {members.length === 0 ? (
            <div className="text-[13px] text-muted-foreground py-6 text-center">No buyers linked to this vertical yet.</div>
          ) : (
            <div className="space-y-1.5">
              {members.slice(0, 8).map((mem, i) => {
                const active = mem.active !== false;
                const name = mem.destination_name || buyerName[mem.buyer_id] || mem.buyer_id;
                return (
                  <div key={mem.id} className="flex items-center gap-2.5 py-1">
                    <span className="w-5 text-right font-mono tabular-nums text-[12px] text-muted-foreground">{mem.priority ?? i + 1}</span>
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${active ? 'bg-[hsl(var(--chart-5))]' : 'bg-muted-foreground'}`} />
                    <span className="text-[13px] text-foreground truncate flex-1">{name}</span>
                    <span className="text-[11px] text-muted-foreground">{active ? 'Active' : 'Paused'}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}