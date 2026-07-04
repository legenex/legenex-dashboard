import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Download } from 'lucide-react';
import { toast } from 'sonner';
import { money } from '@/lib/reportMetrics';
import { downloadCsv } from '@/lib/csv';

const STATUS_STYLE = { draft: 'text-muted-foreground', issued: 'bg-status-queued status-queued', paid: 'bg-status-sold status-sold' };

export default function SupplierPayoutsTab({ suppliers }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ supplier_name: '', amount: '', lead_count: '', status: 'draft' });

  const { data: payouts = [] } = useQuery({ queryKey: ['supplier-payouts'], queryFn: () => base44.entities.SupplierPayout.list('-created_date', 500) });

  const create = async () => {
    if (!form.supplier_name || !form.amount) { toast.error('Supplier and amount required'); return; }
    await base44.entities.SupplierPayout.create({ supplier_name: form.supplier_name, amount: Number(form.amount) || 0, lead_count: Number(form.lead_count) || 0, status: form.status, paid_amount: form.status === 'paid' ? Number(form.amount) || 0 : 0 });
    qc.invalidateQueries({ queryKey: ['supplier-payouts'] });
    setOpen(false); setForm({ supplier_name: '', amount: '', lead_count: '', status: 'draft' });
    toast.success('Payout created');
  };

  const markPaid = async (p) => {
    await base44.entities.SupplierPayout.update(p.id, { status: 'paid', paid_amount: p.amount });
    qc.invalidateQueries({ queryKey: ['supplier-payouts'] });
    toast.success('Payout marked paid');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end gap-2">
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => downloadCsv('supplier_payouts', [
          { key: 'supplier_name', label: 'Supplier' }, { key: 'amount', label: 'Amount' }, { key: 'paid_amount', label: 'Paid' }, { key: 'status', label: 'Status' },
        ], payouts)}><Download className="w-3.5 h-3.5" /> Export</Button>
        <Button size="sm" className="gap-1.5" onClick={() => setOpen(true)}><Plus className="w-3.5 h-3.5" /> New Payout</Button>
      </div>
      <div className="bg-card border border-border rounded-[10px] overflow-hidden">
        <table className="w-full text-[12px]">
          <thead><tr className="border-b border-border bg-muted/40 text-[10px] text-muted-foreground uppercase tracking-wider">
            <th className="text-left px-4 py-2.5">Supplier</th><th className="text-right px-4 py-2.5">Amount</th><th className="text-right px-4 py-2.5">Paid</th>
            <th className="text-right px-4 py-2.5">Leads</th><th className="text-left px-4 py-2.5">Status</th><th className="text-right px-4 py-2.5">Action</th>
          </tr></thead>
          <tbody className="divide-y divide-border">
            {payouts.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">No payouts</td></tr>}
            {payouts.map(p => (
              <tr key={p.id} className="hover:bg-accent/30">
                <td className="px-4 py-2.5 text-foreground">{p.supplier_name}</td>
                <td className="px-4 py-2.5 text-right font-mono">{money(p.amount)}</td>
                <td className="px-4 py-2.5 text-right font-mono">{money(p.paid_amount)}</td>
                <td className="px-4 py-2.5 text-right font-mono">{p.lead_count || 0}</td>
                <td className="px-4 py-2.5"><Badge variant="outline" className={`text-[10px] ${STATUS_STYLE[p.status] || ''}`}>{p.status}</Badge></td>
                <td className="px-4 py-2.5 text-right">{p.status !== 'paid' && <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => markPaid(p)}>Mark Paid</Button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-popover border-border max-w-[400px]">
          <DialogHeader><DialogTitle>New Supplier Payout</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-[12px]">Supplier *</Label>
              <Select value={form.supplier_name} onValueChange={v => setForm(p => ({ ...p, supplier_name: v }))}>
                <SelectTrigger className="mt-1 bg-background text-[13px]"><SelectValue placeholder="Select supplier" /></SelectTrigger>
                <SelectContent>{suppliers.map(s => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-[12px]">Amount *</Label><Input type="number" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} className="mt-1 bg-background font-mono text-[12px]" /></div>
              <div><Label className="text-[12px]">Lead Count</Label><Input type="number" value={form.lead_count} onChange={e => setForm(p => ({ ...p, lead_count: e.target.value }))} className="mt-1 bg-background font-mono text-[12px]" /></div>
            </div>
            <div>
              <Label className="text-[12px]">Status</Label>
              <Select value={form.status} onValueChange={v => setForm(p => ({ ...p, status: v }))}>
                <SelectTrigger className="mt-1 bg-background text-[13px]"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="draft">Draft</SelectItem><SelectItem value="issued">Issued</SelectItem><SelectItem value="paid">Paid</SelectItem></SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={create}>Create</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}