import React from 'react';
import { formatDistanceToNow } from 'date-fns';

export default function HealthStrip({ hlrProvider, leadByteConnector, lastLeadTime }) {
  return (
    <div className="bg-card border border-primary/20 rounded-[10px] p-4 flex items-center gap-6 flex-wrap">
      <div className="flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full ${hlrProvider ? 'bg-[#22C55E]' : 'bg-[#EF4444]'}`} />
        <span className="text-[12px] text-muted-foreground">HLR Provider</span>
        <span className="text-[12px] font-medium text-foreground">{hlrProvider || 'Not configured'}</span>
      </div>
      <div className="w-px h-5 bg-border" />
      <div className="flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full ${leadByteConnector ? 'bg-[#22C55E]' : 'bg-[#EF4444]'}`} />
        <span className="text-[12px] text-muted-foreground">LeadByte</span>
        <span className="text-[12px] font-medium text-foreground">{leadByteConnector || 'Not configured'}</span>
      </div>
      {lastLeadTime && (
        <>
          <div className="w-px h-5 bg-border" />
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-muted-foreground">Last lead</span>
            <span className="text-[12px] font-medium text-foreground">{formatDistanceToNow(new Date(lastLeadTime), { addSuffix: true })}</span>
          </div>
        </>
      )}
    </div>
  );
}