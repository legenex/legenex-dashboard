import React, { useState } from 'react';
import { reconInsights } from '@/functions/reconInsights';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Sparkles, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';
import { money, int } from '@/lib/reportMetrics';
import { reconcile, workbench } from '@/lib/financeMetrics';
import { Panel, PanelHeader, StatChip, THead, rise } from '@/components/finances/financeAtoms';

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

  const chips = [
    { label: 'Revenue Gap', value: money(wb.revenueGap), tone: wb.revenueGap > 0 ? 'risk' : undefined },
    { label: 'Unmatched In', value: money(data.unmatchedIn || 0), tone: (data.unmatchedIn || 0) > 0 ? 'risk' : undefined },
    { label: 'Overdue', value: money(wb.overdue), tone: wb.overdue > 0 ? 'risk' : undefined },
    { label: 'Total At Risk', value: money(wb.totalAtRisk), tone: wb.totalAtRisk > 0 ? 'risk' : undefined },
    { label: 'Resolve Rate', value: `${resolveRate}/${wb.openGaps.length + resolveRate}` },
  ];

  return (
    <div className="space-y-5">
      {/* Workbench KPI chips */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {chips.map((c, i) => <StatChip key={c.label} label={c.label} value={c.value} tone={c.tone} i={i} />)}
      </div>

      {/* AI insights */}
      <Panel>
        <PanelHeader title="">
          <div className="flex items-center gap-1.5 text-[13px] font-semibold text-foreground"><Sparkles className="w-4 h-4 text-primary" /> AI Insights</div>
          <Button size="sm" variant="outline" onClick={getInsights} disabled={loading}>{loading ? 'Analyzing...' : 'Generate'}</Button>
        </PanelHeader>
        <div className="p-4">
          {insights ? (
            <div className="text-[13px] text-muted-foreground prose prose-sm prose-invert max-w-none"><ReactMarkdown>{insights}</ReactMarkdown></div>
          ) : (
            <p className="text-[13px] text-muted-foreground">Generate AI insights on your open reconciliation gaps.</p>
          )}
        </div>
      </Panel>

      {/* Open gaps by counterparty */}
      <Panel className="overflow-hidden">
        <PanelHeader title="Open Gaps by Counterparty" />
        {wb.openGaps.length === 0 ? (
          <div className="flex items-center gap-2 text-[13px] status-sold px-4 py-6"><CheckCircle2 className="w-4 h-4" /> No open gaps, everything reconciles.</div>
        ) : (
          <table className="w-full text-[12px]">
            <thead><THead cols={['Counterparty', 'Type', 'Expected', 'Paid', 'Short', 'Action']} alignRight={[2, 3, 4, 5]} /></thead>
            <tbody className="divide-y divide-border/60">
              {wb.openGaps.map((g, i) => (
                <motion.tr key={i} variants={rise} initial="hidden" animate="show" custom={i} className="hover:bg-foreground/[0.02]">
                  <td className="px-4 py-2.5 text-foreground">{g.name}</td>
                  <td className="px-4 py-2.5"><Badge variant="outline" className="text-[10px]">{g.type}</Badge></td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums">{money(g.expected)}</td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums">{money(g.paid)}</td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-destructive">{money(g.short)}</td>
                  <td className="px-4 py-2.5 text-right"><Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => onResolve?.(g)}>Resolve</Button></td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      {/* Full reconciliation table */}
      <Panel className="overflow-hidden">
        <PanelHeader title="Counterparty Reconciliation" />
        <table className="w-full text-[12px]">
          <thead><THead cols={['Name', 'Type', 'Leads', 'Revenue', 'Cost', 'Profit', 'Invoiced', 'Paid', 'Flag']} alignRight={[2, 3, 4, 5, 6, 7]} center={[8]} /></thead>
          <tbody className="divide-y divide-border/60">
            {rows.length === 0 && <tr><td colSpan={9} className="py-6 text-center text-muted-foreground">No counterparties yet</td></tr>}
            {rows.map((r, i) => (
              <motion.tr key={i} variants={rise} initial="hidden" animate="show" custom={i} className="hover:bg-foreground/[0.02]">
                <td className="px-4 py-2.5 text-foreground">{r.name}</td>
                <td className="px-4 py-2.5"><Badge variant="outline" className="text-[10px]">{r.type}</Badge></td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums">{int(r.leads)}</td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums">{money(r.revenue)}</td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums">{money(r.cost)}</td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums">{money(r.profit)}</td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums">{money(r.invoiced)}</td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums">{money(r.paid)}</td>
                <td className="px-4 py-2.5 text-center">{r.flag ? <AlertTriangle className="w-3.5 h-3.5 text-destructive inline" /> : <CheckCircle2 className="w-3.5 h-3.5 status-sold inline" />}</td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}