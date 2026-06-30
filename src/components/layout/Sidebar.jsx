import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, FileText, Share2, Wrench, Settings as SettingsIcon,
  ChevronDown, ChevronRight,
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
  {
    label: 'Tools', icon: Wrench, type: 'dropdown',
    children: [
      { label: 'Notifications', path: '/notifications' },
      { label: 'Calculated Fields', path: '/calculated-fields' },
      { label: 'Verification', path: '/verification' },
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

export default function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const initialOpen = navGroups.filter(g => shouldExpand(g, location)).map(g => g.label);
  const [openGroups, setOpenGroups] = useState(initialOpen);

  const toggleGroup = (label) => {
    setOpenGroups(prev => prev.includes(label) ? prev.filter(l => l !== label) : [...prev, label]);
  };

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-[248px] bg-sidebar flex flex-col border-r border-sidebar-border z-50"
      style={{ borderTopRightRadius: '16px', borderBottomRightRadius: '16px' }}>

      <Link to="/" className="flex items-center px-5 py-6">
        <img src="https://media.base44.com/images/public/6a363ed8bf1b77641238d41d/f9cc21785_LogoWideLightClear.png" alt="Legenex" className="h-10 w-auto max-w-full object-contain" />
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

          return (
            <div key={group.label}>
              <button
                onClick={() => { toggleGroup(group.label); if (group.path) navigate(group.path); }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all duration-150 relative
                  ${hasActiveChild ? 'text-foreground' : 'text-sidebar-foreground hover:text-foreground hover:bg-sidebar-accent'}`}
              >
                {hasActiveChild && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-primary rounded-r-full" />}
                <Icon className={`w-[18px] h-[18px] ${hasActiveChild ? 'text-primary' : ''}`} />
                <span className="flex-1 text-left">{group.label}</span>
                {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              </button>
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