import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import PageHeader from '@/components/shared/PageHeader';
import SettingsSuppliers from '@/components/settings/SettingsSuppliers';
import SettingsApiKeys from '@/components/settings/SettingsApiKeys';
import SettingsCustomFields from '@/components/settings/SettingsCustomFields';
import SettingsLeadByte from '@/components/settings/SettingsLeadByte';
import SettingsApiConnectors from '@/components/settings/SettingsApiConnectors';
import SettingsIgnoreList from '@/components/settings/SettingsIgnoreList';
import SettingsUsers from '@/components/settings/SettingsUsers';

export default function Settings() {
  return (
    <div>
      <PageHeader title="Settings" subtitle="Suppliers, API keys, field mapping, APIs, and user management" />
      <Tabs defaultValue="suppliers">
        <TabsList className="bg-muted mb-4">
          <TabsTrigger value="suppliers">Suppliers</TabsTrigger>
          <TabsTrigger value="apikeys">API Keys</TabsTrigger>
          <TabsTrigger value="fields">Custom Fields</TabsTrigger>
          <TabsTrigger value="apis">APIs</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
        </TabsList>
        <TabsContent value="suppliers"><SettingsSuppliers /></TabsContent>
        <TabsContent value="apikeys"><SettingsApiKeys /></TabsContent>
        <TabsContent value="fields"><SettingsCustomFields /></TabsContent>
        <TabsContent value="apis">
          <div className="space-y-8">
            <div>
              <div className="text-[14px] font-semibold text-foreground mb-3">Lead Destination</div>
              <SettingsLeadByte />
            </div>
            <div>
              <div className="text-[14px] font-semibold text-foreground mb-3">Event APIs</div>
              <SettingsApiConnectors />
            </div>
            <div>
              <div className="text-[14px] font-semibold text-foreground mb-3">Adaptive Fields</div>
              <SettingsIgnoreList />
            </div>
          </div>
        </TabsContent>
        <TabsContent value="users"><SettingsUsers /></TabsContent>
      </Tabs>
    </div>
  );
}