import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Megaphone, Users, Webhook, Zap } from 'lucide-react';
import SubNavShell from '@/components/layout/SubNavShell';

// Buyer-centric IA. Exactly five top-level sections, each with an icon (also
// shown in the collapsed rail). Verticals, Brands, Suppliers, Deliveries, Route
// Groups, and Simulator are intentionally NOT in the nav: Verticals/Brands live
// on the Campaigns Setup tab, Suppliers in Operations, Deliveries/routing inside
// the Buyers tabs, and Route Groups/Simulator remain routable tools reached from
// Campaigns/Dashboard. Their routes still exist and keep their permission keys.
const ITEMS = [
  { label: 'Dashboard', path: '/distribution', icon: LayoutDashboard },
  { label: 'Campaigns', path: '/campaigns', icon: Megaphone },
  { label: 'Buyers', path: '/distribution/buyers', icon: Users },
  // Webhooks is Nick's live rename of the former Deliveries page; it stays at
  // /deliveries (the live route) and is NOT moved to a new path.
  { label: 'Webhooks', path: '/deliveries', icon: Webhook },
  { label: 'Conversion Events', path: '/conversion-events', icon: Zap },
];

const linkClass = (active) =>
  `flex items-center gap-2.5 px-3 py-1.5 rounded-md text-[13px] transition-colors ${
    active ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:text-foreground hover:bg-accent/40'
  }`;

// Left sub-sidebar for the Lead Distribution section. Flat, buyer-centric: five
// top-level links, each with an icon that also appears in the collapsed rail.
export default function DistributionNav() {
  const location = useLocation();

  const railItems = ITEMS.map(item => ({
    label: item.label, icon: item.icon, to: item.path, active: location.pathname === item.path,
  }));

  return (
    <SubNavShell items={railItems} title="Lead Distribution">
      <div className="space-y-0.5">
        {ITEMS.map(item => {
          const Icon = item.icon;
          const active = location.pathname === item.path;
          return (
            <Link key={item.path} to={item.path} className={linkClass(active)}>
              <Icon className="w-4 h-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </div>
    </SubNavShell>
  );
}