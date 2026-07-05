import React from 'react';
import { fmtMoney } from '@/lib/overviewFinance';
import useCountUp from '@/hooks/useCountUp';

// Grouped KPI: headline number (animated count-up), a sub value, and a gap chip.
export default function GroupedKpiCard({ label, headline, subLabel, sub, gapLabel = 'gap', gap, icon: Icon, format = 'money' }) {
  const animated = useCountUp(headline);
  const f = (v) => format === 'money' ? fmtMoney(v) : v;
  const gapTone = Math.abs(gap) < 0.01 ? 'bg-muted text-muted-foreground' : gap > 0 ? 'status-error-bg status-error' : 'status-sold-bg status-sold';
  return (
    <div className="relative bg-card border border-border rounded-[12px] p-5 overflow-hidden hover:border-primary/30 hover:-translate-y-0.5 transition-all duration-200">
      <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-primary/40" />
      <div className="flex items-start justify-between">
        <div className="text-[12px] font-medium text-muted-foreground uppercase tracking-wider">{label}</div>
        {Icon && (
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <Icon className="w-[18px] h-[18px] text-primary" />
          </div>
        )}
      </div>
      <div className="text-[30px] font-bold text-foreground mt-2 leading-tight font-display">{f(animated)}</div>
      <div className="flex items-center justify-between mt-2">
        <div className="text-[12px] text-muted-foreground">{subLabel}: <span className="text-foreground font-medium">{f(sub)}</span></div>
        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-md ${gapTone}`}>{gapLabel} {f(Math.abs(gap))}</span>
      </div>
    </div>
  );
}