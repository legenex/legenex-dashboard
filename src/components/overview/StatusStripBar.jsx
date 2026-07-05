import React from 'react';

// Bottom status strip. `items` = [{ label, value, tone }].
const TONE = {
  good: 'status-sold',
  warn: 'status-unsold',
  bad: 'status-error',
  neutral: 'text-foreground',
};

export default function StatusStripBar({ items = [] }) {
  return (
    <div className="bg-card border border-border rounded-[12px] px-4 py-3 flex items-center flex-wrap gap-x-6 gap-y-3">
      {items.map((it, i) => (
        <div key={it.label} className="flex items-center gap-2">
          {it.dot && <span className={`w-2 h-2 rounded-full ${it.dotClass || 'bg-[#22C55E]'}`} />}
          <span className="text-[11px] text-muted-foreground uppercase tracking-wider">{it.label}</span>
          <span className={`text-[12px] font-mono font-medium ${TONE[it.tone] || TONE.neutral}`}>{it.value}</span>
          {i < items.length - 1 && <span className="hidden lg:inline h-4 w-px bg-border ml-4" />}
        </div>
      ))}
    </div>
  );
}