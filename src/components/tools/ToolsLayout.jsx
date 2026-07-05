import React from 'react';
import { Outlet } from 'react-router-dom';
import ToolsNav from './ToolsNav';

// Layout route: renders the Tools sub-sidebar beside the active page.
export default function ToolsLayout() {
  return (
    <div className="h-full flex gap-6 min-h-0">
      <ToolsNav />
      <div className="flex-1 min-w-0 h-full overflow-y-auto">
        <Outlet />
      </div>
    </div>
  );
}