import React, { useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { isWithinInterval } from 'date-fns';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Download } from 'lucide-react';
import { Link } from 'react-router-dom';
import { money, groupBy } from '@/lib/reportMetrics';
import { downloadCsv } from '@/lib/csv';
import { Panel, PanelHeader, THead, rise } from '@/components/finances/financeAtoms';
import { StatChip } from '@/components/finances/financeUi';

// Shows synced ad spend and the true CPL it produces per supplier/source.
export default function AdSpendTab({ win }) {
  const { data: allSpend = [] } = useQuery({ queryKey: ['adspend'], queryFn: () => base44.entities.AdSpend.list('-date', 2000) });
  const { data: allLeads = [] } = useQuery({ queryKey: ['report-leads'], queryFn: () => base44.entities.Lead.list('-created_date', 2000) });
  const inWin = (d) => !win || (d && isWithinInterval(new Date(d), { start: win.start, end: win.end }));
  const adSpend = useMemo(() => allSpend.filter(r => inWin(r.date)), [allSpend, win]);
  const leads = useMemo(() => allLeads.filter(l => inWin(l.created_date)), [allLeads, win]);

  const totalSpend = adSpend.reduce((a, r) => a + Number(r.spend || 0), 0);
  const bySupplier = groupBy(leads, 'supplier_name', adSpend);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="w-[240px]">
          <StatChip label="Total Ad Spend (synced)" value={money(totalSpend)} tone={totalSpend > 0 ? 'good' : undefined} pct={totalSpend > 0 ? 100 : 0} />
        </div>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => downloadCsv('ad_spend', [
          { key: 'date', label: 'Date' }, { key: 'platform', label: 'Platform' }, { key: 'supplier_name', label: 'Supplier' }, { key: 'cost_source', label: 'Source' }, { key: 'spend', label: 'Spend' },
        ], adSpend)}><Download className="w-3.5 h-3.5" /> Export</Button>
      </div>

      {adSpend.length === 0 && (
        <Panel className="p-8 text-center text-[13px] text-muted-foreground">
          No ad spend synced yet. Connect Meta and add campaign mappings in <Link to="/settings?tab=integrations" className="text-primary underline">Settings Integrations</Link>.
        </Panel>
      )}

      {bySupplier.some(r => r.cost > 0) && (
        <Panel className="overflow-hidden">
          <PanelHeader title="True CPL by Supplier" />
          <table className="w-full text-[12px]">
            <thead><THead cols={['Supplier', 'Leads', 'Cost + Spend', 'True CPL']} alignRight={[1, 2, 3]} /></thead>
            <tbody className="divide-y divide-border/60">
              {bySupplier.filter(r => r.leads > 0).map((r, i) => (
                <motion.tr key={r.key} variants={rise} initial="hidden" animate="show" custom={i} className="hover:bg-foreground/[0.02]">
                  <td className="px-4 py-2.5 text-foreground">{r.key}</td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-muted-foreground">{r.leads}</td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-muted-foreground">{money(r.cost)}</td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-foreground">{money(r.cpl)}</td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}

      <Panel className="overflow-hidden">
        <table className="w-full text-[12px]">
          <thead><THead cols={['Date', 'Platform', 'Supplier', 'Source', 'Spend']} alignRight={[4]} /></thead>
          <tbody className="divide-y divide-border/60">
            {adSpend.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">No ad spend rows.</td></tr>}
            {adSpend.slice(0, 200).map((r, i) => (
              <motion.tr key={r.id} variants={rise} initial="hidden" animate="show" custom={i} className="hover:bg-foreground/[0.02]">
                <td className="px-4 py-2.5 font-mono text-muted-foreground">{r.date}</td>
                <td className="px-4 py-2.5"><Badge variant="outline" className="text-[10px]">{r.platform}</Badge></td>
                <td className="px-4 py-2.5 text-foreground">{r.supplier_name || '-'}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{r.cost_source || '-'}</td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums">{money(r.spend)}</td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}