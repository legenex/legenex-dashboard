import React from 'react';
import { Outlet } from 'react-router-dom';
import DistributionNav from './DistributionNav';

// Layout route: renders the Distribution sub-sidebar beside the active page.
// Full-height so pages that use h-full (e.g. Deliveries) resolve correctly.
export default function DistributionLayout() {
  return (
    <div className="h-full flex gap-6 min-h-0">
      <DistributionNav />
      <div className="flex-1 min-w-0 h-full overflow-y-auto">
        <Outlet />
      </div>
    </div>
  );
}