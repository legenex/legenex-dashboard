import React from 'react';
import { Plus } from 'lucide-react';
import SubNavShell from '@/components/layout/SubNavShell';

const STANDARD = [
  { key: 'performance_overview', label: 'Performance Overview' },
  { key: 'daily', label: 'Daily Performance' },
  { key: 'campaign', label: 'Campaign Performance' },
  { key: 'pnl', label: 'P&L' },
  { key: 'ad', label: 'Ad Performance' },
  { key: 'buyer', label: 'Buyer Performance' },
  { key: 'supplier', label: 'Supplier Performance' },
];

// Left sub-sidebar for the Reports report-builder.
export default function ReportSidebar({ active, onSelect, customReports = [], onNewReport }) {
  const Item = ({ id, label }) => (
    <button
      onClick={() => onSelect(id)}
      className={`w-full text-left px-3 py-1.5 rounded-md text-[13px] transition-colors ${
        active === id ? 'bg-primary/10 text-foreground font-medium' : 'text-muted-foreground hover:text-foreground hover:bg-accent/40'
      }`}
    >
      {label}
    </button>
  );

  return (
    <SubNavShell storageKey="legenex_subnav_reports">
      <div className="space-y-0.5 mb-5">
        {STANDARD.map(s => <Item key={s.key} id={`std:${s.key}`} label={s.label} />)}
      </div>

      <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-3 mb-1">Custom</div>
      <div className="space-y-0.5">
        {customReports.map(r => <Item key={r.id} id={`custom:${r.id}`} label={r.name} />)}
        <button onClick={onNewReport} className="w-full text-left px-3 py-1.5 rounded-md text-[13px] text-primary hover:bg-accent/40 flex items-center gap-1.5">
          <Plus className="w-3.5 h-3.5" /> New Report
        </button>
      </div>
    </SubNavShell>
  );
}

export { STANDARD };