import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Download } from 'lucide-react';
import { Link } from 'react-router-dom';
import { money, groupBy } from '@/lib/reportMetrics';
import { downloadCsv } from '@/lib/csv';

// Shows synced ad spend and the true CPL it produces per supplier/source.
export default function AdSpendTab() {
  const { data: adSpend = [] } = useQuery({ queryKey: ['adspend'], queryFn: () => base44.entities.AdSpend.list('-date', 2000) });
  const { data: leads = [] } = useQuery({ queryKey: ['report-leads'], queryFn: () => base44.entities.Lead.list('-created_date', 2000) });

  const totalSpend = adSpend.reduce((a, r) => a + Number(r.spend || 0), 0);
  const bySupplier = groupBy(leads, 'supplier_name', adSpend);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="bg-card border border-border rounded-[10px] px-4 py-3">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Ad Spend (synced)</div>
          <div className="text-[18px] font-bold text-foreground font-mono">{money(totalSpend)}</div>
        </div>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => downloadCsv('ad_spend', [
          { key: 'date', label: 'Date' }, { key: 'platform', label: 'Platform' }, { key: 'supplier_name', label: 'Supplier' }, { key: 'cost_source', label: 'Source' }, { key: 'spend', label: 'Spend' },
        ], adSpend)}><Download className="w-3.5 h-3.5" /> Export</Button>
      </div>

      {adSpend.length === 0 && (
        <div className="bg-card border border-border rounded-[10px] p-8 text-center text-[13px] text-muted-foreground">
          No ad spend synced yet. Connect Meta and add campaign mappings in <Link to="/settings?tab=integrations" className="text-primary underline">Settings → Integrations</Link>.
        </div>
      )}

      {bySupplier.some(r => r.cost > 0) && (
        <div className="bg-card border border-border rounded-[10px] p-4">
          <div className="text-[13px] font-semibold text-foreground mb-3">True CPL by Supplier</div>
          <table className="w-full text-[12px]">
            <thead><tr className="border-b border-border text-[10px] text-muted-foreground uppercase tracking-wider">
              <th className="text-left py-2">Supplier</th><th className="text-right py-2">Leads</th><th className="text-right py-2">Cost + Spend</th><th className="text-right py-2">True CPL</th>
            </tr></thead>
            <tbody className="divide-y divide-border">
              {bySupplier.filter(r => r.leads > 0).map(r => (
                <tr key={r.key} className="hover:bg-accent/30">
                  <td className="py-2.5 text-foreground">{r.key}</td>
                  <td className="py-2.5 text-right font-mono">{r.leads}</td>
                  <td className="py-2.5 text-right font-mono">{money(r.cost)}</td>
                  <td className="py-2.5 text-right font-mono text-foreground">{money(r.cpl)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="bg-card border border-border rounded-[10px] overflow-hidden">
        <table className="w-full text-[12px]">
          <thead><tr className="border-b border-border bg-muted/40 text-[10px] text-muted-foreground uppercase tracking-wider">
            <th className="text-left px-4 py-2.5">Date</th><th className="text-left px-4 py-2.5">Platform</th><th className="text-left px-4 py-2.5">Supplier</th>
            <th className="text-left px-4 py-2.5">Source</th><th className="text-right px-4 py-2.5">Spend</th>
          </tr></thead>
          <tbody className="divide-y divide-border">
            {adSpend.slice(0, 200).map(r => (
              <tr key={r.id} className="hover:bg-accent/30">
                <td className="px-4 py-2.5 font-mono text-muted-foreground">{r.date}</td>
                <td className="px-4 py-2.5"><Badge variant="outline" className="text-[10px]">{r.platform}</Badge></td>
                <td className="px-4 py-2.5 text-foreground">{r.supplier_name || '—'}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{r.cost_source || '—'}</td>
                <td className="px-4 py-2.5 text-right font-mono">{money(r.spend)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}