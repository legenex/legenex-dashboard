import React from 'react';
import PageHeader from '@/components/shared/PageHeader';
import SettingsLeadByte from '@/components/settings/SettingsLeadByte';
import SettingsIgnoreList from '@/components/settings/SettingsIgnoreList';

export default function Deliveries() {
  return (
    <div>
      <PageHeader title="Deliveries" subtitle="Lead destination configuration and payload templates" />
      <div className="space-y-8">
        <SettingsLeadByte />
        <div>
          <div className="text-[14px] font-semibold text-foreground mb-3">Adaptive Fields</div>
          <SettingsIgnoreList />
        </div>
      </div>
    </div>
  );
}