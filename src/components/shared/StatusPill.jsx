import React from 'react';

const statusStyles = {
  Sold: 'bg-status-sold status-sold',
  Unsold: 'bg-status-unsold status-unsold',
  Error: 'bg-status-error status-error',
  Processing: 'bg-status-processing status-processing',
};

export default function StatusPill({ status, size = 'sm' }) {
  const base = statusStyles[status] || 'bg-muted text-muted-foreground';
  const sizeClass = size === 'lg' ? 'px-3 py-1.5 text-[13px]' : 'px-2 py-0.5 text-[11px]';
  
  return (
    <span className={`inline-flex items-center rounded-full font-semibold ${base} ${sizeClass}`}>
      {status}
    </span>
  );
}