import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import PageHeader from '@/components/shared/PageHeader';
import SettingsUsers from '@/components/settings/SettingsUsers';
import SettingsApiKeys from '@/components/settings/SettingsApiKeys';
import SettingsCustomFields from '@/components/settings/SettingsCustomFields';
import ErrorLogs from '@/pages/ErrorLogs';

export default function Settings() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') || 'users';

  const setTab = (v) => {
    setSearchParams({ tab: v }, { replace: true });
  };

  return (
    <div>
      <PageHeader title="Settings" subtitle="Users, API keys, custom fields, and error logs" />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-muted mb-4">
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="apikeys">API Keys</TabsTrigger>
          <TabsTrigger value="fields">Custom Fields</TabsTrigger>
          <TabsTrigger value="errors">Error Logs</TabsTrigger>
        </TabsList>
        <TabsContent value="users"><SettingsUsers /></TabsContent>
        <TabsContent value="apikeys"><SettingsApiKeys /></TabsContent>
        <TabsContent value="fields"><SettingsCustomFields /></TabsContent>
        <TabsContent value="errors"><ErrorLogs embedded /></TabsContent>
      </Tabs>
    </div>
  );
}