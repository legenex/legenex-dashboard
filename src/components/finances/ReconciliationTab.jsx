import React, { useState } from 'react';
import { reconInsights } from '@/functions/reconInsights';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Sparkles, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';
import { money, int } from '@/lib/reportMetrics';
import { reconcile, workbench } from '@/lib/financeMetrics';

// Per-counterparty reconciliation view + AI insights + workbench cards.
export default function ReconciliationTab({ data, onResolve }) {
  const [insights, setInsights] = useState('');
  const [loading, setLoading] = useState(false);

  const rows = reconcile(data);
  const wb = workbench(rows, data.invoices);

  const getInsights = async () => {
    setLoading(true);
    try {
      const res = await reconInsights({ gaps: wb.openGaps });
      setInsights(res?.data?.insights || 'No insights available.');
    } catch { toast.error('Could not generate insights'); }
    setLoading(false);
  };

  const resolveRate = data.resolved != null ? data.resolved : 0;

  return (
    <div className="space-y-6">
      {/* Workbench metric cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'Revenue Gap', value: money(wb.revenueGap), warn: wb.revenueGap > 0 },
          { label: 'Unmatched In', value: money(data.unmatchedIn || 0), warn: (data.unmatchedIn || 0) > 0 },
          { label: 'Overdue', value: money(wb.overdue), warn: wb.overdue > 0 },
          { label: 'Total At Risk', value: money(wb.totalAtRisk), warn: wb.totalAtRisk > 0 },
          { label: 'Resolve Rate', value: `${resolveRate}/${wb.openGaps.length + resolveRate}`, warn: false },
        ].map(c => (
          <div key={c.label} className="bg-card border border-border rounded-[10px] p-3.5">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{c.label}</div>
            <div className={`text-[20px] font-bold font-mono mt-1 ${c.warn ? 'text-destructive' : 'text-foreground'}`}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* AI insights */}
      <div className="bg-card border border-border rounded-[10px] p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[13px] font-semibold text-foreground flex items-center gap-1.5"><Sparkles className="w-4 h-4 text-primary" /> AI Insights</div>
          <Button size="sm" variant="outline" onClick={getInsights} disabled={loading}>{loading ? 'Analyzing…' : 'Generate'}</Button>
        </div>
        {insights ? (
          <div className="text-[13px] text-muted-foreground prose prose-sm prose-invert max-w-none"><ReactMarkdown>{insights}</ReactMarkdown></div>
        ) : (
          <p className="text-[13px] text-muted-foreground">Generate AI insights on your open reconciliation gaps.</p>
        )}
      </div>

      {/* Open gaps by counterparty */}
      <div className="bg-card border border-border rounded-[10px] p-4">
        <div className="text-[13px] font-semibold text-foreground mb-3">Open Gaps by Counterparty</div>
        {wb.openGaps.length === 0 ? (
          <div className="flex items-center gap-2 text-[13px] status-sold py-4"><CheckCircle2 className="w-4 h-4" /> No open gaps - everything reconciles.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead><tr className="border-b border-border text-[10px] text-muted-foreground uppercase tracking-wider">
                <th className="text-left py-2">Counterparty</th><th className="text-left py-2">Type</th>
                <th className="text-right py-2">Expected</th><th className="text-right py-2">Paid</th><th className="text-right py-2">Short</th><th className="text-right py-2">Action</th>
              </tr></thead>
              <tbody className="divide-y divide-border">
                {wb.openGaps.map((g, i) => (
                  <tr key={i} className="hover:bg-accent/30">
                    <td className="py-2.5 text-foreground">{g.name}</td>
                    <td className="py-2.5"><Badge variant="outline" className="text-[10px]">{g.type}</Badge></td>
                    <td className="py-2.5 text-right font-mono">{money(g.expected)}</td>
                    <td className="py-2.5 text-right font-mono">{money(g.paid)}</td>
                    <td className="py-2.5 text-right font-mono text-destructive">{money(g.short)}</td>
                    <td className="py-2.5 text-right"><Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => onResolve?.(g)}>Resolve</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Full reconciliation table */}
      <div className="bg-card border border-border rounded-[10px] p-4">
        <div className="text-[13px] font-semibold text-foreground mb-3">Counterparty Reconciliation</div>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead><tr className="border-b border-border text-[10px] text-muted-foreground uppercase tracking-wider">
              <th className="text-left py-2">Name</th><th className="text-left py-2">Type</th><th className="text-right py-2">Leads</th>
              <th className="text-right py-2">Revenue</th><th className="text-right py-2">Cost</th><th className="text-right py-2">Profit</th>
              <th className="text-right py-2">Invoiced</th><th className="text-right py-2">Paid</th><th className="text-center py-2">Flag</th>
            </tr></thead>
            <tbody className="divide-y divide-border">
              {rows.length === 0 && <tr><td colSpan={9} className="py-6 text-center text-muted-foreground">No counterparties yet</td></tr>}
              {rows.map((r, i) => (
                <tr key={i} className="hover:bg-accent/30">
                  <td className="py-2.5 text-foreground">{r.name}</td>
                  <td className="py-2.5"><Badge variant="outline" className="text-[10px]">{r.type}</Badge></td>
                  <td className="py-2.5 text-right font-mono">{int(r.leads)}</td>
                  <td className="py-2.5 text-right font-mono">{money(r.revenue)}</td>
                  <td className="py-2.5 text-right font-mono">{money(r.cost)}</td>
                  <td className="py-2.5 text-right font-mono">{money(r.profit)}</td>
                  <td className="py-2.5 text-right font-mono">{money(r.invoiced)}</td>
                  <td className="py-2.5 text-right font-mono">{money(r.paid)}</td>
                  <td className="py-2.5 text-center">{r.flag ? <AlertTriangle className="w-3.5 h-3.5 text-destructive inline" /> : <CheckCircle2 className="w-3.5 h-3.5 status-sold inline" />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}