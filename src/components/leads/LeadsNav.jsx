import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { List, CheckCircle2, XCircle, Ban, Slash, Clock } from 'lucide-react';

const ITEMS = [
  { label: 'All Leads', path: '/leads', icon: List },
  { label: 'Sold', path: '/leads/sold', icon: CheckCircle2 },
  { label: 'Unsold', path: '/leads/unsold', icon: XCircle },
  { label: 'Disqualified', path: '/leads/disqualified', icon: Ban },
  { label: 'Rejected', path: '/leads/rejected', icon: Slash },
  { label: 'Queued', path: '/leads/queued', icon: Clock },
];

// Left sub-sidebar for the Leads section.
export default function LeadsNav() {
  const location = useLocation();

  return (
    <nav className="w-56 shrink-0 border-r border-border pr-3">
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