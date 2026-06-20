import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import PageHeader from '@/components/shared/PageHeader';
import SettingsSuppliers from '@/components/settings/SettingsSuppliers';
import SettingsCustomFields from '@/components/settings/SettingsCustomFields';
import SettingsLeadByte from '@/components/settings/SettingsLeadByte';
import SettingsUsers from '@/components/settings/SettingsUsers';

export default function Settings() {
  return (
    <div>
      <PageHeader title="Settings" subtitle="Suppliers, field mapping, LeadByte connector, and user management" />
      <Tabs defaultValue="suppliers">
        <TabsList className="bg-muted mb-4">
          <TabsTrigger value="suppliers">Suppliers</TabsTrigger>
          <TabsTrigger value="fields">Custom Fields</TabsTrigger>
          <TabsTrigger value="leadbyte">LeadByte</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
        </TabsList>
        <TabsContent value="suppliers"><SettingsSuppliers /></TabsContent>
        <TabsContent value="fields"><SettingsCustomFields /></TabsContent>
        <TabsContent value="leadbyte"><SettingsLeadByte /></TabsContent>
        <TabsContent value="users"><SettingsUsers /></TabsContent>
      </Tabs>
    </div>
  );
}