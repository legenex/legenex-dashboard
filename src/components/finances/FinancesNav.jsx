import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { LayoutDashboard, Landmark, FileText, CreditCard, Wallet, Megaphone } from 'lucide-react';
import { usePermissions } from '@/lib/AuthContext';
import SubNavShell from '@/components/layout/SubNavShell';

const ITEMS = [
  { label: 'Overview', tab: 'overview', icon: LayoutDashboard },
  { label: 'Bank Feed', tab: 'bank', icon: Landmark, perm: 'bank_feed' },
  { label: 'Invoices', tab: 'invoices', icon: FileText },
  { label: 'Buyer Payments', tab: 'payments', icon: CreditCard },
  { label: 'Supplier Payouts', tab: 'payouts', icon: Wallet },
  { label: 'Ad Spend', tab: 'adspend', icon: Megaphone },
];

// Left sub-sidebar for the Finances section. Drives the ?tab= query param.
export default function FinancesNav() {
  const [params, setParams] = useSearchParams();
  const { can } = usePermissions();
  const active = params.get('tab') || 'overview';

  return (
    <SubNavShell>
      <div className="space-y-0.5">
        {ITEMS.filter(item => !item.perm || can(item.perm)).map(item => {
          const isActive = active === item.tab;
          const Icon = item.icon;
          return (
            <button
              key={item.tab}
              onClick={() => setParams({ tab: item.tab }, { replace: true })}
              className={`w-full text-left flex items-center gap-2.5 px-3 py-1.5 rounded-md text-[13px] transition-colors ${
                isActive ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:text-foreground hover:bg-accent/40'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {item.label}
            </button>
          );
        })}
      </div>
    </SubNavShell>
  );
}