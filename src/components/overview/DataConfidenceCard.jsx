import React from 'react';
import { ShieldCheck } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

// Freshness tone based on how long ago a source last synced.
function tone(date) {
  if (!date) return { cls: 'status-error', label: 'never', dot: 'bg-destructive' };
  const ageH = (Date.now() - new Date(date).getTime()) / 3600000;
  if (ageH <= 6) return { cls: 'status-sold', label: formatDistanceToNow(new Date(date), { addSuffix: true }), dot: 'bg-[#3DD68C]' };
  if (ageH <= 48) return { cls: 'status-unsold', label: formatDistanceToNow(new Date(date), { addSuffix: true }), dot: 'bg-[#FACC14]' };
  return { cls: 'status-error', label: formatDistanceToNow(new Date(date), { addSuffix: true }), dot: 'bg-destructive' };
}

// Sync-freshness per money source. `sources` = [{ label, at }].
export default function DataConfidenceCard({ sources }) {
  const fresh = sources.filter(s => s.at && (Date.now() - new Date(s.at).getTime()) / 3600000 <= 6).length;
  return (
    <div className="bg-card border border-border rounded-[12px] overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between">
        <div className="text-[13px] font-semibold text-foreground flex items-center gap-1.5">
          <ShieldCheck className="w-4 h-4 text-primary" /> Data Confidence
        </div>
        <div className="text-[11px] text-muted-foreground">{fresh}/{sources.length} fresh</div>
      </div>
      <div className="divide-y divide-border">
        {sources.map(s => {
          const t = tone(s.at);
          return (
            <div key={s.label} className="px-5 py-2.5 flex items-center gap-3 text-[13px]">
              <span className={`w-2 h-2 rounded-full ${t.dot}`} />
              <span className="flex-1 text-foreground">{s.label}</span>
              <span className={`text-[11px] font-mono ${t.cls}`}>{t.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}