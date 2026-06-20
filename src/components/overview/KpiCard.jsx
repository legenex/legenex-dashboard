import React from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';

export default function KpiCard({ label, value, trend, trendLabel }) {
  const isUp = trend > 0;
  const isDown = trend < 0;

  return (
    <div className="bg-card border border-border rounded-[10px] p-5 hover:border-primary/30 transition-all duration-150 hover:-translate-y-0.5">
      <div className="text-[12px] font-medium text-muted-foreground uppercase tracking-wider">{label}</div>
      <div className="text-[36px] font-bold text-foreground mt-1 leading-tight font-display">{value}</div>
      {trend !== undefined && trend !== null && (
        <div className={`flex items-center gap-1 mt-2 text-[12px] font-medium ${isUp ? 'status-sold' : isDown ? 'status-error' : 'text-muted-foreground'}`}>
          {isUp ? <TrendingUp className="w-3.5 h-3.5" /> : isDown ? <TrendingDown className="w-3.5 h-3.5" /> : null}
          {trend > 0 ? '+' : ''}{trend}% {trendLabel || 'vs prior'}
        </div>
      )}
    </div>
  );
}