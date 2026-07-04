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

export default function BuyerPaymentsTab({ buyers }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ buyer_id: '', amount: '', method: 'manual', paid_date: new Date().toISOString().slice(0, 10) });

  const { data: payments = [] } = useQuery({ queryKey: ['buyer-payments'], queryFn: () => base44.entities.BuyerPayment.list('-paid_date', 500) });

  const create = async () => {
    if (!form.buyer_id || !form.amount) { toast.error('Buyer and amount required'); return; }
    const b = buyers.find(x => x.id === form.buyer_id);
    await base44.entities.BuyerPayment.create({ buyer_id: form.buyer_id, buyer_name: b?.company_name || '', amount: Number(form.amount) || 0, method: form.method, paid_date: form.paid_date });
    qc.invalidateQueries({ queryKey: ['buyer-payments'] });
    setOpen(false); setForm({ buyer_id: '', amount: '', method: 'manual', paid_date: new Date().toISOString().slice(0, 10) });
    toast.success('Payment recorded');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end gap-2">
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => downloadCsv('buyer_payments', [
          { key: 'buyer_name', label: 'Buyer' }, { key: 'amount', label: 'Amount' }, { key: 'method', label: 'Method' }, { key: 'paid_date', label: 'Date' },
        ], payments)}><Download className="w-3.5 h-3.5" /> Export</Button>
        <Button size="sm" className="gap-1.5" onClick={() => setOpen(true)}><Plus className="w-3.5 h-3.5" /> Record Payment</Button>
      </div>
      <div className="bg-card border border-border rounded-[10px] overflow-hidden">
        <table className="w-full text-[12px]">
          <thead><tr className="border-b border-border bg-muted/40 text-[10px] text-muted-foreground uppercase tracking-wider">
            <th className="text-left px-4 py-2.5">Buyer</th><th className="text-left px-4 py-2.5">Method</th><th className="text-left px-4 py-2.5">Date</th><th className="text-right px-4 py-2.5">Amount</th>
          </tr></thead>
          <tbody className="divide-y divide-border">
            {payments.length === 0 && <tr><td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">No payments recorded</td></tr>}
            {payments.map(p => (
              <tr key={p.id} className="hover:bg-accent/30">
                <td className="px-4 py-2.5 text-foreground">{p.buyer_name}</td>
                <td className="px-4 py-2.5"><Badge variant="outline" className="text-[10px]">{p.method}</Badge></td>
                <td className="px-4 py-2.5 font-mono text-muted-foreground">{p.paid_date}</td>
                <td className="px-4 py-2.5 text-right font-mono status-sold">{money(p.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-popover border-border max-w-[400px]">
          <DialogHeader><DialogTitle>Record Buyer Payment</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-[12px]">Buyer *</Label>
              <Select value={form.buyer_id} onValueChange={v => setForm(p => ({ ...p, buyer_id: v }))}>
                <SelectTrigger className="mt-1 bg-background text-[13px]"><SelectValue placeholder="Select buyer" /></SelectTrigger>
                <SelectContent>{buyers.map(b => <SelectItem key={b.id} value={b.id}>{b.company_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-[12px]">Amount *</Label><Input type="number" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} className="mt-1 bg-background font-mono text-[12px]" /></div>
              <div><Label className="text-[12px]">Date</Label><Input type="date" value={form.paid_date} onChange={e => setForm(p => ({ ...p, paid_date: e.target.value }))} className="mt-1 bg-background text-[12px]" /></div>
            </div>
          </div>
          <DialogFooter><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={create}>Record</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}