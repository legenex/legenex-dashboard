import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Megaphone, Send, Zap, Route as RouteIcon, GitBranch, ChevronRight, Webhook, Layers, Users, Truck, Tag } from 'lucide-react';
import SubNavShell from '@/components/layout/SubNavShell';

const ITEMS = [
  { label: 'Dashboard', path: '/distribution', icon: LayoutDashboard },
  { label: 'Campaigns', path: '/campaigns', icon: Megaphone, children: [
    { label: 'Verticals', tab: 'verticals', icon: Layers },
    { label: 'Buyers', tab: 'buyers', icon: Users },
    { label: 'Suppliers', tab: 'suppliers', icon: Truck },
    { label: 'Brands', tab: 'brands', icon: Tag },
  ] },
  { label: 'Webhooks', path: '/deliveries', icon: Webhook },
  { label: 'Conversion Events', path: '/conversion-events', icon: Zap },
  { label: 'Route Groups', path: '/distribution/routes', icon: GitBranch },
  { label: 'Simulator', path: '/distribution/simulator', icon: RouteIcon },
];

const linkClass = (active) =>
  `flex items-center gap-2.5 px-3 py-1.5 rounded-md text-[13px] transition-colors ${
    active ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:text-foreground hover:bg-accent/40'
  }`;

// Left sub-sidebar for the Lead Distribution section.
export default function DistributionNav() {
  const location = useLocation();
  const onCampaigns = location.pathname === '/campaigns';
  const activeTab = new URLSearchParams(location.search).get('tab') || 'verticals';

  // Campaigns dropdown starts expanded; auto-open again whenever on the Campaigns page.
  const [campaignsOpen, setCampaignsOpen] = useState(true);
  useEffect(() => { if (onCampaigns) setCampaignsOpen(true); }, [onCampaigns]);

  const railItems = ITEMS.map(item => ({ label: item.label, icon: item.icon, to: item.path, active: location.pathname === item.path }));

  return (
    <SubNavShell items={railItems}>
      <div className="space-y-0.5">
        {ITEMS.map(item => {
          const Icon = item.icon;
          const active = location.pathname === item.path;

          if (item.children) {
            return (
              <div key={item.path}>
                <div className={`${linkClass(active)} pr-2`}>
                  <Link to={item.path} className="flex items-center gap-2.5 flex-1 min-w-0">
                    <Icon className="w-4 h-4 shrink-0" />
                    {item.label}
                  </Link>
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); setCampaignsOpen(o => !o); }}
                    className="shrink-0 p-0.5 -mr-1 rounded hover:bg-accent/60"
                    aria-label={campaignsOpen ? 'Collapse' : 'Expand'}
                  >
                    <ChevronRight className={`w-3.5 h-3.5 transition-transform ${campaignsOpen ? 'rotate-90' : ''}`} />
                  </button>
                </div>
                {campaignsOpen && (
                  <div className="mt-0.5 ml-4 pl-2.5 border-l border-border space-y-0.5">
                    {item.children.map(child => {
                      const ChildIcon = child.icon;
                      if (child.comingSoon) {
                        return (
                          <div
                            key={child.label}
                            title="Coming soon"
                            className="flex items-center gap-2.5 px-3 py-1.5 rounded-md text-[13px] text-muted-foreground/60 cursor-not-allowed"
                          >
                            {ChildIcon && <ChildIcon className="w-4 h-4 shrink-0" />}
                            <span className="flex-1">{child.label}</span>
                            <span className="shrink-0 text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border">Soon</span>
                          </div>
                        );
                      }
                      const childActive = onCampaigns && activeTab === child.tab;
                      return (
                        <Link
                          key={child.tab}
                          to={`${item.path}?tab=${child.tab}`}
                          className={`flex items-center gap-2.5 px-3 py-1.5 rounded-md text-[13px] transition-colors ${
                            childActive ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:text-foreground hover:bg-accent/40'
                          }`}
                        >
                          {ChildIcon && <ChildIcon className="w-4 h-4 shrink-0" />}
                          {child.label}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }

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