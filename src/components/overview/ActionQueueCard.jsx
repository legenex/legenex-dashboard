import React from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { fmtMoney } from '@/lib/overviewFinance';

const LABEL_TONE = {
  'Missing source': 'status-error-bg status-error',
  'Revenue gap': 'status-error-bg status-error',
  'Supplier cost gap': 'status-warn-bg status-unsold',
  'Unmatched income': 'bg-status-duplicate status-duplicate',
  'Payment overdue': 'status-error-bg status-error',
  'Short paid': 'status-warn-bg status-unsold',
};

// Financial variance queue built from workbench.openGaps + unmatched income.
export default function ActionQueueCard({ queue, onResolve, onDone }) {
  const { items, totalAtRisk } = queue;
  return (
    <div className="bg-card border border-border rounded-[12px] overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between">
        <div>
          <div className="text-[13px] font-semibold text-foreground flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 text-primary" /> Action Queue
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">Open financial variances requiring attention</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Total at risk</div>
          <div className={`text-[18px] font-bold font-mono ${totalAtRisk > 0 ? 'text-destructive' : 'text-foreground'}`}>{fmtMoney(totalAtRisk)}</div>
        </div>
      </div>
      <div className="divide-y divide-border">
        {items.length === 0 && (
          <div className="flex items-center gap-2 text-[13px] status-sold px-5 py-8 justify-center">
            <CheckCircle2 className="w-4 h-4" /> Everything reconciles — no open variances.
          </div>
        )}
        {items.map(item => (
          <div key={item.key} className="px-5 py-3 flex items-center gap-3 hover:bg-accent/30 transition-colors">
            <span className={`text-[10px] font-semibold px-2 py-1 rounded-md whitespace-nowrap ${LABEL_TONE[item.label] || 'tag-neutral'}`}>{item.label}</span>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] text-foreground truncate">{item.note}</div>
            </div>
            <div className="text-[14px] font-bold font-mono text-destructive whitespace-nowrap">{fmtMoney(item.amount)}</div>
            <div className="flex items-center gap-1.5 shrink-0">
              <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => onResolve?.(item)}>Resolve</Button>
              <Button size="sm" variant="ghost" className="h-7 text-[11px] text-muted-foreground" onClick={() => onDone?.(item)}>Done</Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}