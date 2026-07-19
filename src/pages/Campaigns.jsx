import React, { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Plus, Megaphone, Loader2 } from 'lucide-react';
import SectionHeader from '@/components/shared/SectionHeader';
import CampaignCreateModal from '@/components/campaigns/CampaignCreateModal';
import CampaignDetail from '@/components/distribution/CampaignDetail';

export default function Campaigns() {
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(null);

  const { data: campaigns = [], isLoading } = useQuery({ queryKey: ['campaigns'], queryFn: () => base44.entities.Campaign.list('-created_date', 500) });
  const selected = useMemo(() => campaigns.find((c) => c.id === selectedId) || null, [campaigns, selectedId]);

  return (
    <div>
      <SectionHeader title="Campaigns" subtitle="Campaign routing, suppliers, and verticals/brands setup">
        <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-1.5"><Plus className="w-4 h-4" /> Create Campaign</Button>
      </SectionHeader>

      {/* Campaigns list + detail (routing order across buyers, publish flow). */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(260px,320px)_1fr] gap-5 items-start mt-4">
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          {isLoading && <div className="px-4 py-10 text-center text-[13px] text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />Loading campaigns...</div>}
          {!isLoading && campaigns.length === 0 && <div className="px-4 py-10 text-center text-[13px] text-muted-foreground"><Megaphone className="w-7 h-7 text-muted-foreground mx-auto mb-2" />No campaigns yet. Create one to configure routing.</div>}
          <div className="divide-y divide-border">
            {campaigns.map((c) => {
              const active = c.active !== false;
              return (
                <button
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  className={`w-full text-left px-4 py-3 flex items-center justify-between gap-2 text-[13px] transition-colors ${selectedId === c.id ? 'bg-accent text-foreground' : 'text-foreground hover:bg-accent'}`}
                >
                  <span className="truncate">{c.name || c.id}</span>
                  <span className={`inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-medium ${active ? 'text-primary' : 'text-muted-foreground'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-primary' : 'bg-muted-foreground'}`} />
                    {active ? 'on' : 'off'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        <div>
          {selected
            ? <CampaignDetail key={selected.id} campaign={selected} />
            : (
              <div className="rounded-lg border border-border bg-card p-12 text-center">
                <Megaphone className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <div className="text-[13px] font-medium text-foreground">Select a campaign</div>
                <div className="text-[12px] text-muted-foreground mt-1">Pick a campaign to configure its vertical, suppliers, and routing order.</div>
              </div>
            )}
        </div>
      </div>

      <CampaignCreateModal open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}