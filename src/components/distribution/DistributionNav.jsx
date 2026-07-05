import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Megaphone, Send, Zap } from 'lucide-react';

const ITEMS = [
  { label: 'Dashboard', path: '/distribution', icon: LayoutDashboard },
  { label: 'Campaigns', path: '/campaigns', icon: Megaphone },
  { label: 'Deliveries', path: '/deliveries', icon: Send },
  { label: 'Conversion Events', path: '/conversion-events', icon: Zap },
];

// Left sub-sidebar for the Lead Distribution section (mirrors the Reports pattern).
export default function DistributionNav() {
  const location = useLocation();

  return (
    <nav className="w-56 shrink-0 border-r border-border pr-3">
      <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-3 mb-1.5">Lead Distribution</div>
      <div className="space-y-0.5">
        {ITEMS.map(item => {
          const active = location.pathname === item.path;
          const Icon = item.icon;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-2.5 px-3 py-1.5 rounded-md text-[13px] transition-colors ${
                active ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:text-foreground hover:bg-accent/40'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}