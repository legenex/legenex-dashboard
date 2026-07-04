import React from 'react';
import { X, GripVertical } from 'lucide-react';
import Sparkline from './Sparkline';
import { METRIC_CATALOG, formatMetric } from '@/lib/reportMetrics';

// A single editable metric card. Draggable (via dragHandle), removable.
// Width is controlled by the parent grid via the `w` span.
export default function MetricCard({ card, value, series = [], onRemove, dragHandleProps, positive }) {
  const meta = METRIC_CATALOG.find(m => m.key === card.metric);
  const label = card.label || meta?.label || card.metric;
  const format = meta?.format || 'num';
  const display = formatMetric(value, format);
  const color = positive === false ? 'hsl(var(--destructive))' : 'hsl(var(--primary))';

  return (
    <div className="group relative bg-card border border-border rounded-[10px] p-3.5 flex flex-col justify-between min-h-[104px]">
      <div className="flex items-start justify-between">
        <span className="text-[11px] text-muted-foreground uppercase tracking-wider pr-6 leading-tight">{label}</span>
        <div className="absolute top-2 right-2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button {...dragHandleProps} className="p-1 text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing">
            <GripVertical className="w-3.5 h-3.5" />
          </button>
          <button onClick={onRemove} className="p-1 text-muted-foreground hover:text-destructive">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <div className="text-[22px] font-bold text-foreground font-mono mt-1 leading-none">{display}</div>
      <div className="mt-2 -mb-1">
        <Sparkline data={series} color={color} height={24} />
      </div>
    </div>
  );
}