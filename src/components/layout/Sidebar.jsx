import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, FileText, AlertTriangle, Bell, ShieldCheck, Settings, Zap } from 'lucide-react';

const navItems = [
  { path: '/', label: 'Overview', icon: LayoutDashboard },
  { path: '/leads', label: 'Leads', icon: FileText },
  { path: '/errors', label: 'Error Logs', icon: AlertTriangle },
  { path: '/notifications', label: 'Notifications', icon: Bell },
  { path: '/verification', label: 'Verification', icon: ShieldCheck },
  { path: '/settings', label: 'Settings', icon: Settings },
];

export default function Sidebar() {
  const location = useLocation();

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-[248px] bg-sidebar flex flex-col border-r border-sidebar-border z-50"
      style={{ borderTopRightRadius: '16px', borderBottomRightRadius: '16px' }}>
      
      {/* Brand */}
      <Link to="/" className="flex items-center gap-3 px-5 py-6 group">
        <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center">
          <Zap className="w-5 h-5 text-primary" />
        </div>
        <div>
          <div className="text-[15px] font-bold text-foreground tracking-tight">Legenex</div>
          <div className="text-[11px] text-muted-foreground font-medium">Lead Gateway</div>
        </div>
      </Link>

      {/* Nav */}
      <nav className="flex-1 px-3 space-y-1 mt-2">
        {navItems.map(item => {
          const isActive = item.path === '/' 
            ? location.pathname === '/' 
            : location.pathname.startsWith(item.path);
          const Icon = item.icon;
          
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all duration-150 relative
                ${isActive 
                  ? 'bg-primary/10 text-foreground' 
                  : 'text-sidebar-foreground hover:text-foreground hover:bg-sidebar-accent'
                }`}
            >
              {isActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-primary rounded-r-full" />
              )}
              <Icon className={`w-[18px] h-[18px] ${isActive ? 'text-primary' : ''}`} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-sidebar-border">
        <div className="text-[11px] text-muted-foreground">v1.0.0</div>
      </div>
    </aside>
  );
}