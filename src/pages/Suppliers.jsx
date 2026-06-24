import React from 'react';
import PageHeader from '@/components/shared/PageHeader';
import SettingsSuppliers from '@/components/settings/SettingsSuppliers';

export default function Suppliers() {
  return (
    <div>
      <PageHeader title="Suppliers" subtitle="Manage lead suppliers, API keys, and endpoint settings" />
      <SettingsSuppliers />
    </div>
  );
}