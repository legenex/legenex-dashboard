import React from 'react';
import PageHeader from '@/components/shared/PageHeader';
import ComingSoon from '@/components/shared/ComingSoon';

export default function Buyers() {
  return (
    <div>
      <PageHeader title="Buyers" subtitle="Manage lead buyers and their delivery preferences" />
      <ComingSoon title="Buyers" description="Buyer management and delivery routing will be available here." />
    </div>
  );
}