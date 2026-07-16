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
import { MultiSelect } from '@/components/ui/multi-select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Plus, Copy, ArrowDownUp, Pencil, Files, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { supplierMetrics, money, pct } from '@/lib/partnerMetrics';
import ImportExportDialog from '@/components/shared/ImportExportDialog';
import { TableShell, Row, Tag, EmptyRow } from '@/components/campaigns/campaignTable';

const SUP_TEMPLATE = '1.5fr 0.85fr 0.65fr 0.85fr 0.75fr 0.85fr 0.85fr 0.65fr 0.85fr 0.85fr 0.85fr 0.75fr 0.85fr 0.9fr';

function generateKey(supplierType = '') {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let prefix = 'lgnx_ext_';
  if (supplierType === 'Internal') prefix = 'lgnx_int_';
  else if (supplierType === 'Calls') prefix = 'lgnx_cls_';
  let key = prefix;
  for (let i = 0; i < 32; i++) key += chars[Math.floor(Math.random() * chars.length)];
  return key;
}

function parseArr(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try { const p = JSON.parse(raw); return Array.isArray(p) ? p : []; } catch { return []; }
}

const BLANK = {
  name: '', sid: '', supplier_type: '', vertical: '', payout_type: '', payout_value: null,
  email: '', landing_page_url: '', brand: [], active: true,
};

export default function CampaignSuppliers() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(BLANK);
  const [editId, setEditId] = useState(null);
  const [newKey, setNewKey] = useState(null);
  const [ioOpen, setIoOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const { data: suppliers = [] } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => base44.entities.Supplier.list('-created_date'),
  });
  const { data: leads = [] } = useQuery({
    queryKey: ['leads-metrics'],
    queryFn: () => base44.entities.Lead.list('-created_date', 1000),
  });
  const { data: brands = [] } = useQuery({
    queryKey: ['brands'],
    queryFn: () => base44.entities.Brand.list(),
  });
  const { data: verticalList = [] } = useQuery({
    queryKey: ['verticals'],
    queryFn: () => base44.entities.Vertical.list(),
  });
  const verticalOptions = verticalList.map(v => ({ value: v.code, label: v.name }));

  const openCreate = () => { setForm(BLANK); setEditId(null); setNewKey(null); setModal(true); };

  const openEdit = (s, e) => {
    e.stopPropagation();
    setForm({
      name: s.name || '',
      sid: s.sid || '',
      supplier_type: s.supplier_type || '',
      vertical: s.vertical || '',
      payout_type: s.payout_type || '',
      payout_value: s.payout_value ?? null,
      email: s.email || '',
      landing_page_url: s.landing_page_url || '',
      brand: s.brand ? String(s.brand).split(',').map(b => b.trim()).filter(Boolean) : [],
      active: !!s.active,
    });
    setEditId(s.id);
    setNewKey(null);
    setModal(true);
  };

  const cloneSupplier = async (s, e) => {
    e.stopPropagation();
    const supplier = await base44.entities.Supplier.create({
      name: `${s.name} (Copy)`,
      sid: s.sid,
      supplier_type: s.supplier_type || 'External',
      vertical: s.vertical,
      payout_type: s.payout_type,
      payout_value: s.payout_value,
      email: s.email,
      landing_page_url: s.landing_page_url,
      brand: s.brand || '',
      portal_enabled: false,
      active: s.active,
    });
    const key = generateKey(s.supplier_type);
    await base44.entities.ApiKey.create({
      name: supplier.name,
      type: 'supplier',
      supplier_name: supplier.name,
      supplier_id: supplier.id,
      vertical: s.vertical,
      key,
      key_prefix: key.substring(0, 16),
      active: s.active,
      request_count: 0,
    });
    setNewKey(key);
    setEditId(null);
    setModal(true);
    qc.invalidateQueries({ queryKey: ['suppliers'] });
    qc.invalidateQueries({ queryKey: ['api-keys'] });
    toast.success('Supplier cloned - copy the new API key now!');
  };

  const deleteSupplier = async () => {
    if (!deleteTarget) return;
    await base44.entities.Supplier.delete(deleteTarget.id);
    setDeleteTarget(null);
    qc.invalidateQueries({ queryKey: ['suppliers'] });
    toast.success('Supplier deleted');
  };

  const saveEdit = async () => {
    await base44.entities.Supplier.update(editId, {
      name: form.name,
      sid: form.sid,
      supplier_type: form.supplier_type || 'External',
      vertical: form.vertical,
      payout_type: form.payout_type,
      payout_value: form.payout_value,
      email: form.email,
      landing_page_url: form.landing_page_url,
      brand: Array.isArray(form.brand) ? form.brand.join(', ') : (form.brand || ''),
      active: form.active,
    });
    setModal(false);
    setEditId(null);
    qc.invalidateQueries({ queryKey: ['suppliers'] });
    toast.success('Supplier updated');
  };

  const createSupplier = async () => {
    const supplier = await base44.entities.Supplier.create({
      name: form.name,
      sid: form.sid,
      supplier_type: form.supplier_type || 'External',
      vertical: form.vertical,
      payout_type: form.payout_type,
      payout_value: form.payout_value,
      email: form.email,
      landing_page_url: form.landing_page_url,
      brand: Array.isArray(form.brand) ? form.brand.join(', ') : (form.brand || ''),
      portal_enabled: false,
      active: form.active,
    });
    const key = generateKey(form.supplier_type);
    await base44.entities.ApiKey.create({
      name: form.name,
      type: 'supplier',
      supplier_name: form.name,
      supplier_id: supplier.id,
      vertical: form.vertical,
      key,
      key_prefix: key.substring(0, 16),
      active: form.active,
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

  const COLS = ['Name', 'Source Portal', 'Leads', 'Campaigns', 'Accepted', 'Accepted %', 'Duplicate', 'DQ', 'Cost', 'Revenue', 'Profit', 'CPL', 'Conv Rate', 'Actions'];

  return (
    <div>
      <div className="flex justify-end gap-2 mb-4">
        <Button size="sm" variant="outline" onClick={() => setIoOpen(true)} className="gap-1.5"><ArrowDownUp className="w-4 h-4" /> Import / Export Fields</Button>
        <Button size="sm" onClick={openCreate} className="gap-1.5"><Plus className="w-4 h-4" /> Create Supplier</Button>
      </div>

      <ImportExportDialog
        open={ioOpen}
        onOpenChange={setIoOpen}
        entityName="Supplier"
        records={suppliers}
        matchKey="name"
        labelKey="name"
        exportPrefix="suppliers"
        queryKeys={[['suppliers']]}
        title="Import / Export Suppliers"
      />

      <TableShell head={COLS} template={SUP_TEMPLATE} minWidth="1000px">
        {suppliers.length === 0 && <EmptyRow>No suppliers yet</EmptyRow>}
        {suppliers.map((s, i) => {
          const m = supplierMetrics(leads, s.name);
          const campaignCount = parseArr(s.campaign_ids).length;
          return (
            <Row key={s.id} template={SUP_TEMPLATE} i={i} onClick={() => navigate(`/suppliers/${s.id}`)}>
              <span className="min-w-0">
                <span className="block font-medium text-foreground truncate">{s.name}</span>
                <Tag tone={s.active ? 'green' : 'slate'}>{s.active ? 'Active' : 'Inactive'}</Tag>
              </span>
              <span onClick={e => e.stopPropagation()}>
                <Switch checked={!!s.portal_enabled} onCheckedChange={() => {}} onClick={(e) => togglePortal(s, e)} />
              </span>
              <span className="text-right font-mono text-[12px] text-foreground">{m.total}</span>
              <span className="text-right font-mono text-[12px] text-foreground">{campaignCount}</span>
              <span className="text-right font-mono text-[12px] text-foreground">{m.accepted}</span>
              <span className="text-right font-mono text-[12px] text-foreground">{pct(m.acceptedPct)}</span>
              <span className="text-right font-mono text-[12px] text-foreground">{m.duplicate}</span>
              <span className="text-right font-mono text-[12px] text-foreground">{m.dq}</span>
              <span className="text-right font-mono text-[12px] text-foreground">{money(m.cost)}</span>
              <span className="text-right font-mono text-[12px] status-sold">{money(m.revenue)}</span>
              <span className="text-right font-mono text-[12px] text-foreground">{money(m.profit)}</span>
              <span className="text-right font-mono text-[12px] text-foreground">{money(m.cpl)}</span>
              <span className="text-right font-mono text-[12px] text-foreground">{pct(m.convRate)}</span>
              <span className="flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
                <Button size="icon" variant="ghost" className="h-7 w-7" title="Edit" onClick={(e) => openEdit(s, e)}>
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" title="Clone" onClick={(e) => cloneSupplier(s, e)}>
                  <Files className="w-3.5 h-3.5" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" title="Delete" onClick={(e) => { e.stopPropagation(); setDeleteTarget(s); }}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </span>
            </Row>
          );
        })}
      </TableShell>

      <Dialog open={modal} onOpenChange={(v) => { if (!v && !newKey) setModal(false); }}>
        <DialogContent className="bg-popover border-border max-w-[500px]">
          <DialogHeader><DialogTitle>{newKey ? 'Supplier Created' : editId ? 'Edit Supplier' : 'New Supplier'}</DialogTitle></DialogHeader>
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
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="text-[12px]">Name *</Label><Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} className="mt-1 bg-background" /></div>
                  <div><Label className="text-[12px]">SID</Label><Input value={form.sid} onChange={e => setForm(p => ({ ...p, sid: e.target.value }))} placeholder="e.g. mysup" className="mt-1 bg-background" /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-[12px]">Supplier Type *</Label>
                    <SearchableSelect
                      value={form.supplier_type}
                      onValueChange={v => setForm(p => ({ ...p, supplier_type: v }))}
                      className="mt-1 bg-background"
                      placeholder="Select…"
                      options={[
                        { value: 'Internal', label: 'Internal' },
                        { value: 'External', label: 'External' },
                        { value: 'Calls', label: 'Calls' },
                      ]}
                    />
                  </div>
                  <div>
                    <Label className="text-[12px]">Payout Type</Label>
                    <SearchableSelect
                      value={form.payout_type}
                      onValueChange={v => setForm(p => ({ ...p, payout_type: v, payout_value: (v === 'Flat CPL' || v === 'Revenue %' || v === 'Profit %') ? (p.payout_value ?? '') : null }))}
                      className="mt-1 bg-background"
                      placeholder="None"
                      options={[
                        { value: '', label: 'None' },
                        { value: 'Flat CPL', label: 'Flat CPL' },
                        { value: 'Revenue %', label: 'Revenue %' },
                        { value: 'Profit %', label: 'Profit %' },
                        { value: 'Inbound Call', label: 'Inbound Call' },
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
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-[12px]">Brand(s)</Label>
                    <MultiSelect
                      value={form.brand}
                      onValueChange={v => setForm(p => ({ ...p, brand: v }))}
                      className="mt-1 bg-background"
                      placeholder="Select brands…"
                      options={brands.map(b => ({ value: b.brand_name, label: b.brand_name }))}
                    />
                  </div>
                  <div><Label className="text-[12px]">Email</Label><Input value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} className="mt-1 bg-background" /></div>
                </div>
                {(form.payout_type === 'Flat CPL' || form.payout_type === 'Revenue %' || form.payout_type === 'Profit %') && (
                  <div>
                    <Label className="text-[12px]">{form.payout_type === 'Flat CPL' ? 'Price ($)' : 'Percentage (%)'}</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={form.payout_value ?? ''}
                      onChange={e => setForm(p => ({ ...p, payout_value: e.target.value === '' ? null : Number(e.target.value) }))}
                      placeholder={form.payout_type === 'Flat CPL' ? 'e.g. 25.00' : 'e.g. 15'}
                      className="mt-1 bg-background font-mono text-[12px]"
                    />
                  </div>
                )}
                <div><Label className="text-[12px]">Landing Page URL</Label><Input value={form.landing_page_url} onChange={e => setForm(p => ({ ...p, landing_page_url: e.target.value }))} className="mt-1 bg-background font-mono text-[12px]" /></div>
                <div className="flex items-center gap-2"><Switch checked={form.active} onCheckedChange={v => setForm(p => ({ ...p, active: v }))} /><Label className="text-[12px]">Active</Label></div>
                {!editId && <p className="text-[11px] text-muted-foreground">An API key is auto-generated on create.</p>}
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => { setModal(false); setEditId(null); }}>Cancel</Button>
                {editId ? (
                  <Button onClick={saveEdit} disabled={!form.name || !form.supplier_type}>Save Changes</Button>
                ) : (
                  <Button onClick={createSupplier} disabled={!form.name || !form.supplier_type}>Create Supplier</Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}>
        <AlertDialogContent className="bg-popover border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete supplier?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{deleteTarget?.name}". This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={deleteSupplier} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}