import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Bell, Calculator, ShieldCheck, FlaskConical } from 'lucide-react';
import SubNavShell from '@/components/layout/SubNavShell';

const ITEMS = [
  { label: 'Notifications', path: '/notifications', icon: Bell },
  { label: 'Calculated Fields', path: '/calculated-fields', icon: Calculator },
  { label: 'Verification', path: '/verification', icon: ShieldCheck },
  { label: 'Payload Tester', path: '/payload-tester', icon: FlaskConical },
];

// Left sub-sidebar for the Tools section.
export default function ToolsNav() {
  const location = useLocation();

  return (
    <SubNavShell>
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
    </SubNavShell>
  );
}