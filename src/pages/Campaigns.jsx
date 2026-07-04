import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';
import SettingsVerticals from '@/components/settings/SettingsVerticals';
import CampaignBuyers from '@/components/campaigns/CampaignBuyers';
import CampaignSuppliers from '@/components/campaigns/CampaignSuppliers';
import CampaignBrands from '@/components/campaigns/CampaignBrands';
import CampaignCreateModal from '@/components/campaigns/CampaignCreateModal';

export default function Campaigns() {
  const params = new URLSearchParams(window.location.search);
  const initial = params.get('tab') || 'verticals';
  const [tab, setTab] = useState(['verticals', 'buyers', 'suppliers', 'brands'].includes(initial) ? initial : 'verticals');
  const [createOpen, setCreateOpen] = useState(false);

  const onTabChange = (v) => {
    setTab(v);
    const p = new URLSearchParams(window.location.search);
    p.set('tab', v);
    window.history.replaceState({}, '', `${window.location.pathname}?${p.toString()}`);
  };

  return (
    <div>
      <PageHeader title="Campaigns" subtitle="Verticals, buyers, suppliers, and brands for lead distribution">
        <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-1.5"><Plus className="w-4 h-4" /> Create Campaign</Button>
      </PageHeader>

      <Tabs value={tab} onValueChange={onTabChange}>
        <TabsList>
          <TabsTrigger value="verticals">Verticals</TabsTrigger>
          <TabsTrigger value="buyers">Buyers</TabsTrigger>
          <TabsTrigger value="suppliers">Suppliers</TabsTrigger>
          <TabsTrigger value="brands">Brands</TabsTrigger>
        </TabsList>
        <TabsContent value="verticals" className="mt-4"><SettingsVerticals /></TabsContent>
        <TabsContent value="buyers" className="mt-4"><CampaignBuyers /></TabsContent>
        <TabsContent value="suppliers" className="mt-4"><CampaignSuppliers /></TabsContent>
        <TabsContent value="brands" className="mt-4"><CampaignBrands /></TabsContent>
      </Tabs>

      <CampaignCreateModal open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}