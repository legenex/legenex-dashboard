import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, FileText, LifeBuoy, AlertTriangle, Bell, ShieldCheck,
  Settings, Calculator, ChevronDown, ChevronRight, Share2, Wrench,
} from 'lucide-react';

const navGroups = [
  {
    label: 'Overview',
    icon: LayoutDashboard,
    path: '/',
    type: 'single',
  },
  {
    label: 'Leads',
    icon: FileText,
    path: '/leads',
    type: 'dropdown',
    children: [
      { label: 'Rejections', path: '/leads/rejections' },
      { label: 'Queued Leads', path: '/queue-recovery' },
      { label: 'Error Logs', path: '/errors' },
    ],
  },
  {
    label: 'Lead Distribution',
    icon: Share2,
    path: '/lead-distribution',
    type: 'dropdown',
    tabChildren: true,
    children: [
      { label: 'Campaigns', path: '/lead-distribution', tab: 'campaigns' },
      { label: 'Buyers', path: '/lead-distribution', tab: 'buyers' },
      { label: 'Suppliers', path: '/lead-distribution', tab: 'suppliers' },
      { label: 'Deliveries', path: '/lead-distribution', tab: 'deliveries' },
      { label: 'Conversion Events', path: '/lead-distribution', tab: 'events' },
    ],
  },
  {
    label: 'Tools',
    icon: Wrench,
    type: 'dropdown',
    children: [
      { label: 'Notifications', path: '/notifications' },
      { label: 'Custom Calculations', path: '/calculations' },
      { label: 'Verification', path: '/verification' },
    ],
  },
  {
    label: 'Settings',
    icon: Settings,
    path: '/settings',
    type: 'dropdown',
    tabChildren: true,
    children: [
      { label: 'Users', path: '/settings', tab: 'users' },
      { label: 'API Keys', path: '/settings', tab: 'apikeys' },
      { label: 'Custom Fields', path: '/settings', tab: 'fields' },
    ],
  },
];

function isPathActive(location, path, exact = false) {
  if (exact || path === '/') return location.pathname === path;
  return location.pathname === path || location.pathname.startsWith(path + '/');
}

function isChildActive(location, child) {
  if (child.tab) {
    const params = new URLSearchParams(location.search);
    return location.pathname === child.path && params.get('tab') === child.tab;
  }
  if (child.path === '/') return location.pathname === '/';
  return location.pathname === child.path;
}

function shouldGroupExpand(group, location) {
  if (group.type !== 'dropdown') return false;
  if (group.tabChildren) {
    return group.children.some(c => isChildActive(location, c));
  }
  return group.children.some(c => isChildActive(location, c)) || isPathActive(location, group.path);
}

export default function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const initialOpen = navGroups.filter(g => shouldGroupExpand(g, location)).map(g => g.label);
  const [openGroups, setOpenGroups] = useState(initialOpen);

  const toggleGroup = (label) => {
    setOpenGroups(prev => prev.includes(label) ? prev.filter(l => l !== label) : [...prev, label]);
  };

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-[248px] bg-sidebar flex flex-col border-r border-sidebar-border z-50"
      style={{ borderTopRightRadius: '16px', borderBottomRightRadius: '16px' }}>

      <Link to="/" className="flex items-center px-5 py-6 group">
        <img src="https://media.base44.com/images/public/6a363ed8bf1b77641238d41d/f9cc21785_LogoWideLightClear.png" alt="Legenex" className="h-10 w-auto max-w-full object-contain" />
      </Link>

      <nav className="flex-1 px-3 space-y-0.5 mt-2 overflow-y-auto">
        {navGroups.map(group => {
          const Icon = group.icon;
          const isOpen = openGroups.includes(group.label);
          const isExactActive = group.path && isPathActive(location, group.path, group.path === '/');

          if (group.type === 'single') {
            const isActive = isPathActive(location, group.path, true);
            return (
              <Link
                key={group.label}
                to={group.path}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all duration-150 relative
                  ${isActive ? 'bg-primary/10 text-foreground' : 'text-sidebar-foreground hover:text-foreground hover:bg-sidebar-accent'}`}
              >
                {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-primary rounded-r-full" />}
                <Icon className={`w-[18px] h-[18px] ${isActive ? 'text-primary' : ''}`} />
                {group.label}
              </Link>
            );
          }

          return (
            <div key={group.label}>
              <div
                onClick={() => {
                  if (group.path) {
                    navigate(group.path);
                  } else {
                    toggleGroup(group.label);
                  }
                }}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all duration-150 relative cursor-pointer
                  ${isExactActive || (isOpen && group.children.some(c => isChildActive(location, c)))
                    ? 'bg-primary/10 text-foreground'
                    : 'text-sidebar-foreground hover:text-foreground hover:bg-sidebar-accent'}`}
              >
                {(isExactActive || (isOpen && group.children.some(c => isChildActive(location, c)))) && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-primary rounded-r-full" />
                )}
                <Icon className={`w-[18px] h-[18px] ${isExactActive || (isOpen && group.children.some(c => isChildActive(location, c))) ? 'text-primary' : ''}`} />
                <span className="flex-1">{group.label}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); toggleGroup(group.label); }}
                  className="p-0.5 hover:text-foreground transition-colors"
                >
                  {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                </button>
              </div>
              {isOpen && (
                <div className="ml-4 pl-3 border-l border-sidebar-border space-y-0.5 mt-0.5 mb-1">
                  {group.children.map(child => {
                    const active = isChildActive(location, child);
                    const to = child.tab ? `${child.path}?tab=${child.tab}` : child.path;
                    return (
                      <Link
                        key={child.label}
                        to={to}
                        className={`flex items-center px-3 py-1.5 rounded-md text-[12px] font-medium transition-all duration-150
                          ${active ? 'bg-primary/10 text-primary' : 'text-sidebar-foreground hover:text-foreground hover:bg-sidebar-accent'}`}
                      >
                        {child.label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="px-5 py-4 border-t border-sidebar-border">
        <div className="text-[11px] text-muted-foreground">v1.0.0</div>
      </div>
    </aside>
  );
}