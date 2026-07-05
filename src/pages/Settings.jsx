import React from 'react';
import { useSearchParams } from 'react-router-dom';
import SectionShell from '@/components/layout/SectionShell';
import SectionHeader from '@/components/shared/SectionHeader';
import SettingsNav from '@/components/settings/SettingsNav';
import SettingsGeneral from '@/components/settings/SettingsGeneral';
import SettingsUsers from '@/components/settings/SettingsUsers';
import SettingsIntegrations from '@/components/settings/SettingsIntegrations';
import SettingsDataSources from '@/components/settings/SettingsDataSources';
import SettingsCustomFields from '@/components/settings/SettingsCustomFields';
import SettingsFieldMapping from '@/components/settings/SettingsFieldMapping';
import SettingsApiKeys from '@/components/settings/SettingsApiKeys';
import SettingsKnowledgeBase from '@/components/settings/SettingsKnowledgeBase';
import SettingsBilling from '@/components/settings/SettingsBilling';
import SettingsIgnoreList from '@/components/settings/SettingsIgnoreList';
import SettingsProfile from '@/components/settings/SettingsProfile';
import ErrorLogs from '@/pages/ErrorLogs';

const NAV = [
  { group: 'Account', items: [
    { key: 'profile', label: 'Profile' },
    { key: 'general', label: 'General' },
    { key: 'users', label: 'Users and Roles' },
  ] },
  { group: 'Data', items: [
    { key: 'integrations', label: 'Integrations' },
    { key: 'data-sources', label: 'Data Sources' },
    { key: 'fields', label: 'Custom Fields' },
    { key: 'field-mapping', label: 'Field Mapping' },
    { key: 'apikeys', label: 'API Keys' },
    { key: 'errors', label: 'Error Logs' },
    { key: 'knowledge', label: 'Knowledge Base' },
    { key: 'billing', label: 'Billing and Plan' },
  ] },
];

const PANELS = {
  profile: <SettingsProfile />,
  general: <SettingsGeneral />,
  users: <SettingsUsers />,
  integrations: <SettingsIntegrations />,
  'data-sources': <SettingsDataSources />,
  fields: <SettingsCustomFields />,
  'field-mapping': <SettingsFieldMapping />,
  apikeys: <SettingsApiKeys />,
  errors: <ErrorLogs embedded />,
  knowledge: <SettingsKnowledgeBase />,
  billing: <SettingsBilling />,
  adaptive: <SettingsIgnoreList />,
};

const VALID = Object.keys(PANELS);

export default function Settings() {
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get('tab') || 'general';
  const tab = VALID.includes(raw) ? raw : 'general';
  const setTab = (v) => setSearchParams({ tab: v }, { replace: true });

  return (
    <SectionShell nav={<SettingsNav groups={NAV} active={tab} onSelect={setTab} />}>
      <SectionHeader title="Settings" subtitle="Account, users & roles, integrations, data sources and more" />
      {PANELS[tab]}
    </SectionShell>
  );
}