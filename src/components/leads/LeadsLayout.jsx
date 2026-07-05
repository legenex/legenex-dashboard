import React from 'react';
import { Outlet } from 'react-router-dom';
import LeadsNav from './LeadsNav';

// Layout route: renders the Leads sub-sidebar beside the active page.
export default function LeadsLayout() {
  return (
    <div className="h-full flex gap-3 min-h-0">
      <LeadsNav />
      <div className="flex-1 min-w-0 h-full overflow-y-auto">
        <Outlet />
      </div>
    </div>
  );
}