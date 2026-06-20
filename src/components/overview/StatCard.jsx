import React from 'react';

export default function StatCard({ label, value, subtitle, icon: Icon }) {
  return (
    <div className="bg-card border border-border rounded-[10px] p-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[12px] font-medium text-muted-foreground uppercase tracking-wider">{label}</div>
          <div className="text-[24px] font-bold text-foreground mt-1">{value}</div>
          {subtitle && <div className="text-[12px] text-muted-foreground mt-1">{subtitle}</div>}
        </div>
        {Icon && (
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Icon className="w-5 h-5 text-primary" />
          </div>
        )}
      </div>
    </div>
  );
}