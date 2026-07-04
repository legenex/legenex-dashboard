import React from 'react';
import PageHeader from '@/components/shared/PageHeader';
import ComingSoon from '@/components/shared/ComingSoon';

export default function Reports() {
  return (
    <div>
      <PageHeader title="Reports" subtitle="Performance reporting across suppliers, buyers, campaigns, and verticals" />
      <ComingSoon title="Reports" description="Cross-partner performance reporting will live here - lead volume, acceptance, revenue, and profit breakdowns by campaign, supplier, and buyer." />
    </div>
  );
}