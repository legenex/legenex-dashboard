import React, { useState, useMemo } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Menu } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import Sidebar from './Sidebar';
import DrawerNav from './DrawerNav';
import DataBotWidget from '@/components/databot/DataBotWidget';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { navGroups } from './navConfig';

// Resolve a human page title from the nav config for the current path.
function usePageTitle() {
  const location = useLocation();
  return useMemo(() => {
    const path = location.pathname;
    if (path === '/') return 'Overview';
    for (const group of navGroups) {
      if (group.path && group.path !== '/' && path === group.path) return group.label;
      for (const child of group.children || []) {
        if (child.path === path) return group.label;
      }
      if (group.path && group.path !== '/' && path.startsWith(group.path + '/')) return group.label;
    }
    return 'Legenex';
  }, [location.pathname]);
}

export default function AppLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const title = usePageTitle();

  const { data: errorCount = 0 } = useQuery({
    queryKey: ['layout-error-count'],
    queryFn: async () => {
      const errs = await base44.entities.ErrorLog.list('-created_date', 100);
      return errs.length;
    },
    staleTime: 60000,
  });

  return (
    <div className="h-screen bg-background overflow-hidden">
      {/* Desktop sidebar: lg and up only */}
      <div className="hidden lg:block">
        <Sidebar />
      </div>

      {/* Mobile top header: below lg only */}
      <header className="lg:hidden sticky top-0 z-30 flex items-center gap-3 px-4 bg-background/95 backdrop-blur border-b border-border" style={{ height: '52px' }}>
        <button
          onClick={() => setDrawerOpen(true)}
          aria-label="Open menu"
          className="relative w-[38px] h-[38px] flex items-center justify-center rounded-lg bg-card border border-border"
        >
          <Menu className="w-[18px] h-[18px]" />
          {errorCount > 0 && (
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-primary" />
          )}
        </button>
        <div className="text-[15px] font-semibold text-foreground truncate">{title}</div>
        <div className="flex-1" />
      </header>

      {/* Mobile drawer */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="left" className="p-0 bg-card border-sidebar-border" style={{ width: '288px', maxWidth: '288px' }}>
          <DrawerNav onNavigate={() => setDrawerOpen(false)} />
        </SheetContent>
      </Sheet>

      <main className="h-screen lg:ml-[var(--sidebar-width,248px)]">
        <div className="h-[calc(100%-52px)] lg:h-full overflow-y-auto overflow-x-hidden p-4 lg:p-8">
          <Outlet />
        </div>
      </main>
      <DataBotWidget />
    </div>
  );
}