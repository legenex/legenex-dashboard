import React from 'react';
import PageHeader from '@/components/shared/PageHeader';
import ComingSoon from '@/components/shared/ComingSoon';

export default function Campaigns() {
  return (
    <div>
      <PageHeader title="Campaigns" subtitle="Manage lead acquisition campaigns" />
      <ComingSoon title="Campaigns" description="Campaign management for your lead acquisition sources will be available here." />
    </div>
  );
}