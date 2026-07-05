import React from 'react';
import useCountUp from '@/hooks/useCountUp';

// Small stat card. Pass either a preformatted `value` string, or a numeric
// `count` + `render(n)` for an animated count-up.
export default function StatCard({ label, value, count, render, subtitle, icon: Icon }) {
  const animated = useCountUp(count ?? 0);
  const display = render ? render(animated) : value;
  return (
    <div className="bg-card border border-border rounded-[10px] p-5 hover:border-primary/30 transition-colors duration-200">
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <div className="text-[12px] font-medium text-muted-foreground uppercase tracking-wider truncate">{label}</div>
          <div className="text-[24px] font-bold text-foreground mt-1 font-display">{display}</div>
          {subtitle && <div className="text-[12px] text-muted-foreground mt-1">{subtitle}</div>}
        </div>
        {Icon && (
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Icon className="w-5 h-5 text-primary" />
          </div>
        )}
      </div>
    </div>
  );
}