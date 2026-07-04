import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CreditCard, Check } from 'lucide-react';

const PLANS = [
  { name: 'Starter', price: '$0', features: ['Up to 5k leads / mo', '1 team member', 'CSV import'], current: true },
  { name: 'Growth', price: '$149', features: ['Up to 100k leads / mo', '10 team members', 'Ad spend sync', 'DataBot'] },
  { name: 'Scale', price: 'Custom', features: ['Unlimited leads', 'Unlimited members', 'Priority support', 'SLA'] },
];

export default function SettingsBilling() {
  return (
    <div className="space-y-6">
      <div>
        <div className="text-[13px] text-muted-foreground max-w-2xl mb-4">
          Manage your subscription and payment method. Billing runs through Stripe.
        </div>
        <div className="bg-card border border-border rounded-[12px] p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center"><CreditCard className="w-5 h-5 text-primary" /></div>
            <div>
              <div className="text-[14px] font-semibold text-foreground">Payment method</div>
              <div className="text-[12px] text-muted-foreground">No card on file yet.</div>
            </div>
          </div>
          <Button size="sm" variant="outline">Add card</Button>
        </div>
      </div>

      <div>
        <div className="text-[15px] font-semibold text-foreground mb-3">Plans</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {PLANS.map(p => (
            <div key={p.name} className={`bg-card border rounded-[12px] p-5 ${p.current ? 'border-primary' : 'border-border'}`}>
              <div className="flex items-center justify-between">
                <div className="text-[15px] font-semibold text-foreground">{p.name}</div>
                {p.current && <Badge className="text-[10px]">Current</Badge>}
              </div>
              <div className="text-[26px] font-bold text-foreground mt-2 font-mono">{p.price}<span className="text-[12px] text-muted-foreground font-sans font-normal">{p.price !== 'Custom' ? '/mo' : ''}</span></div>
              <ul className="mt-4 space-y-2">
                {p.features.map(f => (
                  <li key={f} className="flex items-center gap-2 text-[12px] text-muted-foreground"><Check className="w-3.5 h-3.5 status-sold" /> {f}</li>
                ))}
              </ul>
              <Button size="sm" variant={p.current ? 'outline' : 'default'} className="w-full mt-5" disabled={p.current}>
                {p.current ? 'Current plan' : 'Upgrade'}
              </Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}