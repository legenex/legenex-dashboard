import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { money } from '@/lib/partnerMetrics';

const BLANK = {
  company_name: '', email: '', phone: '', location: '',
  buyer_type: '', vertical: '', billing_mode: 'lead_count',
  billing_model: '', billing_email: '', min_balance: 0,
};

export default function CampaignBuyers() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(BLANK);

  const { data: buyers = [] } = useQuery({
    queryKey: ['buyers'],
    queryFn: () => base44.entities.Buyer.list('-created_date'),
  });
  const { data: verticalList = [] } = useQuery({
    queryKey: ['verticals'],
    queryFn: () => base44.entities.Vertical.list(),
  });
  const verticalOptions = verticalList.map(v => ({ value: v.code, label: v.name }));

  const openCreate = () => { setForm(BLANK); setModal(true); };

  const createBuyer = async () => {
    await base44.entities.Buyer.create({
      company_name: form.company_name,
      email: form.email,
      phone: form.phone,
      location: form.location,
      buyer_type: form.buyer_type,
      vertical: form.vertical,
      billing_mode: form.billing_mode,
      billing_model: form.billing_model,
      billing_email: form.billing_email,
      portal_enabled: false,
      balance: 0,
      min_balance: Number(form.min_balance) || 0,
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
        <DialogContent className="bg-popover border-border max-w-[520px]">
          <DialogHeader><DialogTitle>New Buyer</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label className="text-[12px]">Company Name *</Label><Input value={form.company_name} onChange={e => setForm(p => ({ ...p, company_name: e.target.value }))} placeholder="e.g. Acme Legal" className="mt-1 bg-background" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-[12px]">Email</Label><Input value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="contact@buyer.com" className="mt-1 bg-background" /></div>
              <div><Label className="text-[12px]">Phone</Label><Input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} placeholder="(555) 123-4567" className="mt-1 bg-background" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-[12px]">Location</Label><Input value={form.location} onChange={e => setForm(p => ({ ...p, location: e.target.value }))} className="mt-1 bg-background" /></div>
              <div>
                <Label className="text-[12px]">Buyer Type</Label>
                <SearchableSelect
                  value={form.buyer_type}
                  onValueChange={v => setForm(p => ({ ...p, buyer_type: v }))}
                  className="mt-1 bg-background"
                  placeholder="Select…"
                  options={[
                    { value: 'Direct', label: 'Direct' },
                    { value: 'Aggregator', label: 'Aggregator' },
                    { value: 'Network', label: 'Network' },
                  ]}
                />
              </div>
            </div>
            <div>
              <Label className="text-[12px]">Vertical (optional)</Label>
              <SearchableSelect
                value={form.vertical}
                onValueChange={v => setForm(p => ({ ...p, vertical: v }))}
                className="mt-1 bg-background"
                placeholder="Any vertical"
                options={[{ value: '', label: 'Any vertical' }, ...verticalOptions]}
              />
            </div>
            <div>
              <Label className="text-[12px] mb-2 block">Billing Mode</Label>
              <div className="grid grid-cols-2 gap-2">
                {[{ v: 'lead_count', l: 'Lead Count', d: 'Operator-managed, invoiced' }, { v: 'wallet', l: 'Wallet', d: 'Prepaid, auto-deducted' }].map(o => (
                  <button key={o.v} type="button" onClick={() => setForm(p => ({ ...p, billing_mode: o.v }))}
                    className={`text-left p-2.5 rounded-lg border transition-all ${form.billing_mode === o.v ? 'border-primary bg-primary/10' : 'border-border bg-background hover:bg-accent/40'}`}>
                    <div className="text-[13px] font-medium text-foreground">{o.l}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">{o.d}</div>
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-[12px]">Billing Model</Label><Input value={form.billing_model} onChange={e => setForm(p => ({ ...p, billing_model: e.target.value }))} placeholder="e.g. Net 30, Prepaid" className="mt-1 bg-background" /></div>
              <div><Label className="text-[12px]">Billing Email</Label><Input value={form.billing_email} onChange={e => setForm(p => ({ ...p, billing_email: e.target.value }))} className="mt-1 bg-background" /></div>
            </div>
            {form.billing_mode === 'wallet' && (
              <div><Label className="text-[12px]">Min Balance ($)</Label><Input type="number" value={form.min_balance} onChange={e => setForm(p => ({ ...p, min_balance: e.target.value }))} className="mt-1 bg-background font-mono text-[12px]" /></div>
            )}
            <p className="text-[11px] text-muted-foreground">Portal access, wallet funding, and invoicing can be configured after creation.</p>
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