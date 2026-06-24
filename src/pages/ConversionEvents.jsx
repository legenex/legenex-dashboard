import React from 'react';
import PageHeader from '@/components/shared/PageHeader';
import SettingsApiConnectors from '@/components/settings/SettingsApiConnectors';

export default function ConversionEvents() {
  return (
    <div>
      <PageHeader title="Conversion Events" subtitle="Facebook CAPI and webhook connector configuration" />
      <SettingsApiConnectors />
    </div>
  );
}