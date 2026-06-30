import React from 'react';
import PageHeader from '@/components/shared/PageHeader';
import SettingsApiConnectors from '@/components/settings/SettingsApiConnectors';

export default function ConversionEvents() {
  return (
    <div>
      <PageHeader title="Conversion Events" subtitle="Conversion API connectors — Facebook, TikTok, Google, SnapChat, Taboola & other platforms" />
      <SettingsApiConnectors />
    </div>
  );
}