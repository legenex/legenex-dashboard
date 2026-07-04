import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { money } from '@/lib/partnerMetrics';

const BLANK = { company_name: '', email: '', phone: '', location: '' };

export default function CampaignBuyers() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(BLANK);

  const { data: buyers = [] } = useQuery({
    queryKey: ['buyers'],
    queryFn: () => base44.entities.Buyer.list('-created_date'),
  });

  const openCreate = () => { setForm(BLANK); setModal(true); };

  const createBuyer = async () => {
    await base44.entities.Buyer.create({
      company_name: form.company_name,
      email: form.email,
      phone: form.phone,
      location: form.location,
      billing_mode: 'lead_count',
      portal_enabled: false,
      balance: 0,
      min_balance: 0,
      active: true,
    });
    qc.invalidateQueries({ queryKey: ['buyers'] });
    setModal(false);
    toast.success('Buyer created');
  };

  const togglePortal = async (b, e) => {
    e.stopPropagation();
    await base44.entities.Buyer.update(b.id, { portal_enabled: !b.portal_enabled });
    qc.invalidateQueries({ queryKey: ['buyers'] });
  };

  const COLS = ['Buyer Name', 'Portal', 'Type', 'Vertical', 'Balance', 'Min Balance', 'Card', 'Auto Recharge', 'Billing', 'Revenue', 'Cost', 'Profit'];

  return (
    <div>
      <div className="flex justify-end mb-4">
        <Button size="sm" onClick={openCreate} className="gap-1.5"><Plus className="w-4 h-4" /> New Buyer</Button>
      </div>

      <div className="bg-card border border-border rounded-[10px] overflow-x-auto">
        <table className="w-full text-[13px] min-w-[1000px]">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              {COLS.map(h => (
                <th key={h} className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {buyers.length === 0 && (
              <tr><td colSpan={COLS.length} className="px-4 py-8 text-center text-muted-foreground">No buyers yet. Buyers can be created manually or are auto-created from LeadByte sold responses.</td></tr>
            )}
            {buyers.map(b => (
              <tr key={b.id} onClick={() => navigate(`/buyers/${b.id}`)} className="hover:bg-accent/40 transition-colors cursor-pointer">
                <td className="px-4 py-3">
                  <div className="font-medium text-foreground">{b.company_name}</div>
                  {b.auto_created && <Badge variant="outline" className="text-[9px] mt-0.5 text-muted-foreground">Auto</Badge>}
                </td>
                <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                  <Switch checked={!!b.portal_enabled} onClick={(e) => togglePortal(b, e)} onCheckedChange={() => {}} />
                </td>
                <td className="px-4 py-3 text-muted-foreground">{b.buyer_type || '-'}</td>
                <td className="px-4 py-3 text-muted-foreground">{b.vertical || '-'}</td>
                <td className="px-4 py-3 font-mono text-[12px]">{money(b.balance)}</td>
                <td className="px-4 py-3 font-mono text-[12px]">{money(b.min_balance)}</td>
                <td className="px-4 py-3 font-mono text-[12px]">{b.card_last4 ? `•••• ${b.card_last4}` : '-'}</td>
                <td className="px-4 py-3">{b.auto_recharge ? <Badge className="text-[10px] status-sold bg-status-sold">On</Badge> : <span className="text-muted-foreground text-[12px]">Off</span>}</td>
                <td className="px-4 py-3"><Badge variant="outline" className="text-[10px]">{b.billing_mode === 'wallet' ? 'Wallet' : 'Lead Count'}</Badge></td>
                <td className="px-4 py-3 font-mono text-[12px] status-sold">-</td>
                <td className="px-4 py-3 font-mono text-[12px]">-</td>
                <td className="px-4 py-3 font-mono text-[12px]">-</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={modal} onOpenChange={setModal}>
        <DialogContent className="bg-popover border-border max-w-[440px]">
          <DialogHeader><DialogTitle>Create Destination</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label className="text-[12px]">Company Name *</Label><Input value={form.company_name} onChange={e => setForm(p => ({ ...p, company_name: e.target.value }))} className="mt-1 bg-background" /></div>
            <div><Label className="text-[12px]">Email</Label><Input value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} className="mt-1 bg-background" /></div>
            <div><Label className="text-[12px]">Phone</Label><Input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} className="mt-1 bg-background" /></div>
            <div><Label className="text-[12px]">Location</Label><Input value={form.location} onChange={e => setForm(p => ({ ...p, location: e.target.value }))} className="mt-1 bg-background" /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setModal(false)}>Cancel</Button>
            <Button onClick={createBuyer} disabled={!form.company_name}>Create Buyer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}