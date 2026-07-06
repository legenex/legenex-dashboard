import React from 'react';
import { Outlet } from 'react-router-dom';
import LeadsNav from './LeadsNav';
import SectionShell from '@/components/layout/SectionShell';

// Layout route: full-width header above a [ Leads sub-menu | page content ] row.
export default function LeadsLayout() {
  return (
    <div className="h-full bg-[#242B34] -m-6 lg:-m-8 p-6 lg:p-8">
      <SectionShell nav={<LeadsNav />}>
        <Outlet />
      </SectionShell>
    </div>
  );
}