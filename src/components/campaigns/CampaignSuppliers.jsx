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
import { Plus, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { supplierMetrics, money, pct } from '@/lib/partnerMetrics';

function generateKey() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let key = 'lgnx_ext_';
  for (let i = 0; i < 32; i++) key += chars[Math.floor(Math.random() * chars.length)];
  return key;
}

function parseArr(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try { const p = JSON.parse(raw); return Array.isArray(p) ? p : []; } catch { return []; }
}

const BLANK = { name: '', email: '', phone: '' };

export default function CampaignSuppliers() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(BLANK);
  const [newKey, setNewKey] = useState(null);

  const { data: suppliers = [] } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => base44.entities.Supplier.list('-created_date'),
  });
  const { data: leads = [] } = useQuery({
    queryKey: ['leads-metrics'],
    queryFn: () => base44.entities.Lead.list('-created_date', 1000),
  });

  const openCreate = () => { setForm(BLANK); setNewKey(null); setModal(true); };

  const createSupplier = async () => {
    const supplier = await base44.entities.Supplier.create({
      name: form.name,
      email: form.email,
      phone: form.phone,
      supplier_type: 'External',
      portal_enabled: false,
      active: true,
    });
    const key = generateKey();
    await base44.entities.ApiKey.create({
      name: form.name,
      type: 'supplier',
      supplier_name: form.name,
      supplier_id: supplier.id,
      key,
      key_prefix: key.substring(0, 16),
      active: true,
      request_count: 0,
    });
    setNewKey(key);
    qc.invalidateQueries({ queryKey: ['suppliers'] });
    qc.invalidateQueries({ queryKey: ['api-keys'] });
    toast.success('Supplier created - copy the API key now!');
  };

  const togglePortal = async (s, e) => {
    e.stopPropagation();
    await base44.entities.Supplier.update(s.id, { portal_enabled: !s.portal_enabled });
    qc.invalidateQueries({ queryKey: ['suppliers'] });
  };

  const COLS = ['Name', 'Source Portal', 'Leads', 'Campaigns', 'Accepted', 'Accepted %', 'Duplicate', 'DQ', 'Cost', 'Revenue', 'Profit', 'CPL', 'Conv Rate'];

  return (
    <div>
      <div className="flex justify-end mb-4">
        <Button size="sm" onClick={openCreate} className="gap-1.5"><Plus className="w-4 h-4" /> Create Supplier</Button>
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
            {suppliers.length === 0 && (
              <tr><td colSpan={COLS.length} className="px-4 py-8 text-center text-muted-foreground">No suppliers yet</td></tr>
            )}
            {suppliers.map(s => {
              const m = supplierMetrics(leads, s.name);
              const campaignCount = parseArr(s.campaign_ids).length;
              return (
                <tr key={s.id} onClick={() => navigate(`/suppliers/${s.id}`)} className="hover:bg-accent/40 transition-colors cursor-pointer">
                  <td className="px-4 py-3">
                    <div className="font-medium text-foreground">{s.name}</div>
                    <Badge variant="outline" className={`text-[9px] mt-0.5 ${s.active ? 'status-sold bg-status-sold' : 'text-muted-foreground'}`}>{s.active ? 'Active' : 'Inactive'}</Badge>
                  </td>
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    <Switch checked={!!s.portal_enabled} onCheckedChange={() => {}} onClick={(e) => togglePortal(s, e)} />
                  </td>
                  <td className="px-4 py-3 font-mono text-[12px]">{m.total}</td>
                  <td className="px-4 py-3 font-mono text-[12px]">{campaignCount}</td>
                  <td className="px-4 py-3 font-mono text-[12px]">{m.accepted}</td>
                  <td className="px-4 py-3 font-mono text-[12px]">{pct(m.acceptedPct)}</td>
                  <td className="px-4 py-3 font-mono text-[12px]">{m.duplicate}</td>
                  <td className="px-4 py-3 font-mono text-[12px]">{m.dq}</td>
                  <td className="px-4 py-3 font-mono text-[12px]">{money(m.cost)}</td>
                  <td className="px-4 py-3 font-mono text-[12px] status-sold">{money(m.revenue)}</td>
                  <td className="px-4 py-3 font-mono text-[12px]">{money(m.profit)}</td>
                  <td className="px-4 py-3 font-mono text-[12px]">{money(m.cpl)}</td>
                  <td className="px-4 py-3 font-mono text-[12px]">{pct(m.convRate)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Dialog open={modal} onOpenChange={(v) => { if (!v && !newKey) setModal(false); }}>
        <DialogContent className="bg-popover border-border max-w-[440px]">
          <DialogHeader><DialogTitle>{newKey ? 'Supplier Created' : 'Create Supplier'}</DialogTitle></DialogHeader>
          {newKey ? (
            <div className="space-y-4">
              <div className="bg-background border border-primary/30 rounded-lg p-4">
                <div className="text-[12px] font-semibold text-primary mb-2">API Key Generated - Copy Now</div>
                <div className="font-mono text-[12px] text-foreground break-all bg-muted/50 rounded p-3">{newKey}</div>
                <p className="text-[11px] text-muted-foreground mt-2">This key will never be shown in full again.</p>
              </div>
              <Button className="w-full gap-2" onClick={() => { navigator.clipboard.writeText(newKey); toast.success('Copied!'); }}><Copy className="w-4 h-4" /> Copy Key</Button>
              <Button variant="ghost" className="w-full" onClick={() => setModal(false)}>Done</Button>
            </div>
          ) : (
            <>
              <div className="space-y-4">
                <div><Label className="text-[12px]">Source Name *</Label><Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} className="mt-1 bg-background" /></div>
                <div><Label className="text-[12px]">Email</Label><Input value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} className="mt-1 bg-background" /></div>
                <div><Label className="text-[12px]">Phone</Label><Input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} className="mt-1 bg-background" /></div>
                <p className="text-[11px] text-muted-foreground">An API key is auto-generated on create.</p>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setModal(false)}>Cancel</Button>
                <Button onClick={createSupplier} disabled={!form.name}>Create Supplier</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}