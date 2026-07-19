import React, { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Megaphone, Loader2 } from 'lucide-react';
import SectionHeader from '@/components/shared/SectionHeader';
import SettingsVerticals from '@/components/settings/SettingsVerticals';
import CampaignSuppliers from '@/components/campaigns/CampaignSuppliers';
import CampaignBrands from '@/components/campaigns/CampaignBrands';
import CampaignCreateModal from '@/components/campaigns/CampaignCreateModal';
import CampaignDetail from '@/components/distribution/CampaignDetail';

const TABS = ['campaigns', 'suppliers', 'setup'];

export default function Campaigns() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab') || 'campaigns';
  // Old deep-links: buyers -> campaigns list; verticals/brands -> Setup.
  const normalized = raw === 'buyers' ? 'campaigns' : (raw === 'verticals' || raw === 'brands' ? 'setup' : raw);
  const tab = TABS.includes(normalized) ? normalized : 'campaigns';
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(null);

  const onTabChange = (v) => setParams({ tab: v }, { replace: true });

  const { data: campaigns = [], isLoading } = useQuery({ queryKey: ['campaigns'], queryFn: () => base44.entities.Campaign.list('-created_date', 500) });
  const selected = useMemo(() => campaigns.find((c) => c.id === selectedId) || null, [campaigns, selectedId]);

  return (
    <div>
      <SectionHeader title="Campaigns" subtitle="Campaign routing, suppliers, and verticals/brands setup">
        <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-1.5"><Plus className="w-4 h-4" /> Create Campaign</Button>
      </SectionHeader>

      <Tabs value={tab} onValueChange={onTabChange}>
        <TabsList>
          <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
          <TabsTrigger value="suppliers">Suppliers</TabsTrigger>
          <TabsTrigger value="setup">Setup</TabsTrigger>
        </TabsList>

        {/* Campaigns list + detail (routing order across buyers, publish flow). */}
        <TabsContent value="campaigns" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(260px,320px)_1fr] gap-5 items-start">
            <div className="border border-border rounded-[10px] overflow-hidden">
              {isLoading && <div className="p-4 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Loading</div>}
              {!isLoading && campaigns.length === 0 && <div className="p-4 text-sm text-muted-foreground">No campaigns yet. Create one to configure routing.</div>}
              <div className="divide-y divide-border">
                {campaigns.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setSelectedId(c.id)}
                    className={`w-full text-left px-3 py-2.5 flex items-center justify-between gap-2 text-[13px] ${selectedId === c.id ? 'bg-primary/10 text-primary' : 'hover:bg-accent/40'}`}
                  >
                    <span className="truncate">{c.name || c.id}</span>
                    {c.active === false
                      ? <Badge variant="outline" className="text-[10px]">off</Badge>
                      : <Badge className="bg-emerald-500/15 text-emerald-600 text-[10px]">on</Badge>}
                  </button>
                ))}
              </div>
            </div>
            <div>
              {selected
                ? <CampaignDetail key={selected.id} campaign={selected} />
                : (
                  <div className="rounded-[10px] border border-border bg-card p-12 text-center">
                    <Megaphone className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
                    <div className="text-[13px] font-medium">Select a campaign</div>
                    <div className="text-[12px] text-muted-foreground mt-1">Pick a campaign to configure its vertical, suppliers, and routing order.</div>
                  </div>
                )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="suppliers" className="mt-4"><CampaignSuppliers /></TabsContent>

        <TabsContent value="setup" className="mt-4 space-y-8">
          <div>
            <div className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">Verticals</div>
            <SettingsVerticals />
          </div>
          <div>
            <div className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">Brands</div>
            <CampaignBrands />
          </div>
        </TabsContent>
      </Tabs>

      <CampaignCreateModal open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
