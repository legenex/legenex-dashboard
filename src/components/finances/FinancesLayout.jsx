import React from 'react';
import { Outlet } from 'react-router-dom';
import FinancesNav from './FinancesNav';

// Layout route: renders the Finances sub-sidebar beside the active page.
export default function FinancesLayout() {
  return (
    <div className="h-full flex gap-3 min-h-0">
      <FinancesNav />
      <div className="flex-1 min-w-0 h-full overflow-y-auto">
        <Outlet />
      </div>
    </div>
  );
}