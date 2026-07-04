import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, FileText, Share2, Wrench, Settings as SettingsIcon,
  BarChart3, Wallet, ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown,
} from 'lucide-react';

const navGroups = [
  { label: 'Overview', icon: LayoutDashboard, path: '/', type: 'single' },
  {
    label: 'Leads', icon: FileText, type: 'dropdown', path: '/leads',
    children: [
      { label: 'Sold Leads', path: '/leads/sold' },
      { label: 'Unsold Leads', path: '/leads/unsold' },
      { label: 'Disqualified Leads', path: '/leads/disqualified' },
      { label: 'Rejected Leads', path: '/leads/rejected' },
      { label: 'Queued Leads', path: '/leads/queued' },
    ],
  },
  {
    label: 'Lead Distribution', icon: Share2, type: 'dropdown',
    children: [
      { label: 'Campaigns', path: '/campaigns' },
      { label: 'Deliveries', path: '/deliveries' },
      { label: 'Conversion Events', path: '/conversion-events' },
    ],
  },
  { label: 'Reports', icon: BarChart3, path: '/reports', type: 'single' },
  { label: 'Finances', icon: Wallet, path: '/finances', type: 'single' },
  {
    label: 'Tools', icon: Wrench, type: 'dropdown',
    children: [
      { label: 'Notifications', path: '/notifications' },
      { label: 'Calculated Fields', path: '/calculated-fields' },
      { label: 'Verification', path: '/verification' },
      { label: 'Payload Tester', path: '/payload-tester' },
    ],
  },
  {
    label: 'Settings', icon: SettingsIcon, type: 'dropdown', path: '/settings',
    children: [
      { label: 'General', path: '/settings', tab: 'general' },
      { label: 'Users', path: '/settings', tab: 'users' },
      { label: 'API Keys', path: '/settings', tab: 'apikeys' },
      { label: 'Custom Fields', path: '/settings', tab: 'fields' },
      { label: 'Error Logs', path: '/settings', tab: 'errors' },
    ],
  },
];

function isChildActive(location, child) {
  if (child.tab) {
    const params = new URLSearchParams(location.search);
    return location.pathname === child.path && params.get('tab') === child.tab;
  }
  if (child.path === '/') return location.pathname === '/';
  return location.pathname === child.path;
}

function shouldExpand(group, location) {
  if (group.type !== 'dropdown') return false;
  return group.children.some(c => isChildActive(location, c));
}

const SIDEBAR_GROUPS_KEY = 'legenex_sidebar_open_groups';

// Persisted open groups - survives navigation and page refresh.
function loadOpenGroups(location) {
  try {
    const stored = JSON.parse(localStorage.getItem(SIDEBAR_GROUPS_KEY));
    if (Array.isArray(stored)) return stored;
  } catch {}
  return navGroups.filter(g => shouldExpand(g, location)).map(g => g.label);
}

export default function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const [openGroups, setOpenGroups] = useState(() => loadOpenGroups(location));

  useEffect(() => {
    try { localStorage.setItem(SIDEBAR_GROUPS_KEY, JSON.stringify(openGroups)); } catch {}
  }, [openGroups]);

  const toggleGroup = (label) => {
    setOpenGroups(prev => prev.includes(label) ? prev.filter(l => l !== label) : [...prev, label]);
  };

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-[248px] bg-sidebar flex flex-col border-r border-sidebar-border z-50"
      style={{ borderTopRightRadius: '16px', borderBottomRightRadius: '16px' }}>

      <Link to="/" className="flex items-center px-5 py-6">
        <img src="https://media.base44.com/images/public/6a363ed8bf1b77641238d41d/f9cc21785_LogoWideLightClear.png" alt="Legenex DashFlo" className="h-10 w-auto max-w-full object-contain" />
      </Link>

      <nav className="flex-1 px-3 space-y-0.5 mt-2 overflow-y-auto">
        {navGroups.map(group => {
          const Icon = group.icon;

          if (group.type === 'single') {
            const isActive = group.path === '/' ? location.pathname === '/' : location.pathname === group.path;
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

          const isOpen = openGroups.includes(group.label);
          const hasActiveChild = group.children.some(c => isChildActive(location, c));
          const groupActive = group.path ? location.pathname === group.path : false;
          const highlight = hasActiveChild || groupActive;

          return (
            <div key={group.label}>
              <div className="flex items-center">
                <button
                  onClick={() => group.path ? navigate(group.path) : toggleGroup(group.label)}
                  className={`flex-1 flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all duration-150 relative
                    ${highlight ? 'text-foreground' : 'text-sidebar-foreground hover:text-foreground hover:bg-sidebar-accent'}`}
                >
                  {highlight && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-primary rounded-r-full" />}
                  <Icon className={`w-[18px] h-[18px] ${highlight ? 'text-primary' : ''}`} />
                  <span className="flex-1 text-left">{group.label}</span>
                </button>
                <button
                  onClick={() => toggleGroup(group.label)}
                  aria-label={isOpen ? 'Collapse' : 'Expand'}
                  className={`shrink-0 mr-1.5 p-1 rounded-md border transition-all duration-150
                    ${isOpen ? 'bg-primary/15 text-primary border-primary/30' : 'bg-muted/60 border-sidebar-border text-sidebar-foreground hover:text-foreground hover:bg-accent'}`}
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

      <div className="px-3 py-3 border-t border-sidebar-border space-y-2">
        <button
          onClick={() => {
            const labels = navGroups.filter(g => g.type === 'dropdown').map(g => g.label);
            const allOpen = labels.length > 0 && labels.every(l => openGroups.includes(l));
            setOpenGroups(allOpen ? [] : labels);
          }}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-[12px] font-medium text-sidebar-foreground hover:text-foreground hover:bg-sidebar-accent transition-all duration-150 border border-sidebar-border"
        >
          {(() => {
            const labels = navGroups.filter(g => g.type === 'dropdown').map(g => g.label);
            const allOpen = labels.length > 0 && labels.every(l => openGroups.includes(l));
            return allOpen ? (
              <><ChevronsDownUp className="w-3.5 h-3.5" /> Collapse All</>
            ) : (
              <><ChevronsUpDown className="w-3.5 h-3.5" /> Expand All</>
            );
          })()}
        </button>
        <div className="text-[11px] text-muted-foreground text-center">v1.0.0</div>
      </div>
    </aside>
  );
}