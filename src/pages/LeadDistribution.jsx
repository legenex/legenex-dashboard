import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import PageHeader from '@/components/shared/PageHeader';
import Campaigns from '@/pages/Campaigns';
import Buyers from '@/pages/Buyers';
import SettingsSuppliers from '@/components/settings/SettingsSuppliers';
import SettingsLeadByte from '@/components/settings/SettingsLeadByte';
import SettingsApiConnectors from '@/components/settings/SettingsApiConnectors';

export default function LeadDistribution() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') || 'campaigns';

  const setTab = (v) => {
    setSearchParams({ tab: v }, { replace: true });
  };

  return (
    <div>
      <PageHeader title="Lead Distribution" subtitle="Campaigns, buyers, suppliers, deliveries, and conversion events" />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-muted mb-4">
          <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
          <TabsTrigger value="buyers">Buyers</TabsTrigger>
          <TabsTrigger value="suppliers">Suppliers</TabsTrigger>
          <TabsTrigger value="deliveries">Deliveries</TabsTrigger>
          <TabsTrigger value="events">Conversion Events</TabsTrigger>
        </TabsList>
        <TabsContent value="campaigns"><Campaigns /></TabsContent>
        <TabsContent value="buyers"><Buyers /></TabsContent>
        <TabsContent value="suppliers"><SettingsSuppliers /></TabsContent>
        <TabsContent value="deliveries"><SettingsLeadByte /></TabsContent>
        <TabsContent value="events"><SettingsApiConnectors /></TabsContent>
      </Tabs>
    </div>
  );
}