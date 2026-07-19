import React from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Plus, Route as RouteIcon, GitBranch } from 'lucide-react';
import { useState } from 'react';
import SectionHeader from '@/components/shared/SectionHeader';
import SettingsVerticals from '@/components/settings/SettingsVerticals';
import CampaignBuyers from '@/components/campaigns/CampaignBuyers';
import CampaignSuppliers from '@/components/campaigns/CampaignSuppliers';
import CampaignBrands from '@/components/campaigns/CampaignBrands';
import CampaignCreateModal from '@/components/campaigns/CampaignCreateModal';

// Buyers and Suppliers here are campaign-scoped assignment (suppliers-in / buyers
// on the campaign). Verticals and Brands are configuration, grouped under Setup.
// Per-buyer routing and endpoints live on the Buyers page; multi-group routing
// order lives in the Route Groups editor, reached via the Advanced button.
const TABS = ['buyers', 'suppliers', 'setup'];

export default function Campaigns() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const raw = params.get('tab') || 'buyers';
  // Old deep-links to the verticals/brands tabs resolve to the Setup tab.
  const normalized = raw === 'verticals' || raw === 'brands' ? 'setup' : raw;
  const tab = TABS.includes(normalized) ? normalized : 'buyers';
  const [createOpen, setCreateOpen] = useState(false);

  const onTabChange = (v) => setParams({ tab: v }, { replace: true });

  return (
    <div>
      <SectionHeader title="Campaigns" subtitle="Campaign buyers and suppliers, plus verticals and brands setup">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Simulator + Advanced routing editor are reachable from the campaign surface. */}
          <Button size="sm" variant="ghost" onClick={() => navigate('/distribution/simulator')} className="gap-1.5">
            <RouteIcon className="w-4 h-4" /> Simulator
          </Button>
          <Button size="sm" variant="ghost" onClick={() => navigate('/distribution/routes')} className="gap-1.5">
            <GitBranch className="w-4 h-4" /> Advanced routing
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-1.5"><Plus className="w-4 h-4" /> Create Campaign</Button>
        </div>
      </SectionHeader>

      <Tabs value={tab} onValueChange={onTabChange}>
        <TabsList>
          <TabsTrigger value="buyers">Buyers</TabsTrigger>
          <TabsTrigger value="suppliers">Suppliers</TabsTrigger>
          <TabsTrigger value="setup">Setup</TabsTrigger>
        </TabsList>
        <TabsContent value="buyers" className="mt-4"><CampaignBuyers /></TabsContent>
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
