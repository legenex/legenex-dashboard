import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import PageHeader from '@/components/shared/PageHeader';
import SettingsKeys from '@/components/settings/SettingsKeys';
import SettingsCustomFields from '@/components/settings/SettingsCustomFields';
import SettingsLeadByte from '@/components/settings/SettingsLeadByte';
import SettingsWebhooks from '@/components/settings/SettingsWebhooks';

export default function Settings() {
  return (
    <div>
      <PageHeader title="Settings" subtitle="Configure connectors, API keys, field mappings, and webhooks" />

      <Tabs defaultValue="keys">
        <TabsList className="bg-muted mb-4">
          <TabsTrigger value="keys">Keys</TabsTrigger>
          <TabsTrigger value="fields">Custom Fields</TabsTrigger>
          <TabsTrigger value="leadbyte">LeadByte</TabsTrigger>
          <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
        </TabsList>

        <TabsContent value="keys"><SettingsKeys /></TabsContent>
        <TabsContent value="fields"><SettingsCustomFields /></TabsContent>
        <TabsContent value="leadbyte"><SettingsLeadByte /></TabsContent>
        <TabsContent value="webhooks"><SettingsWebhooks /></TabsContent>
      </Tabs>
    </div>
  );
}