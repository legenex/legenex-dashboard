import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, Copy, RefreshCw, Eye, EyeOff } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

function generateKey() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let key = 'lgnx_sk_';
  for (let i = 0; i < 32; i++) key += chars[Math.floor(Math.random() * chars.length)];
  return key;
}

const DEFAULT_FORM = {
  name: '', sid: '', payout_type: 'Flat CPL', email: '',
  landing_page_url: '', brand: '', active: true,
};

export default function SettingsSuppliers() {
  const qc = useQueryClient();
  const [supplierModal, setSupplierModal] = useState(false);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [editingSupplierId, setEditingSupplierId] = useState(null);
  const [newKeyFull, setNewKeyFull] = useState(null);
  const [showKeys, setShowKeys] = useState({});
  const [baseUrl, setBaseUrl] = useState('');
  const [baseUrlSaved, setBaseUrlSaved] = useState(false);

  const { data: suppliers = [] } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => base44.entities.Supplier.list('-created_date'),
  });

  const { data: apiKeys = [] } = useQuery({
    queryKey: ['api-keys'],
    queryFn: () => base44.entities.ApiKey.list(),
  });

  const { data: appSettingsArr = [] } = useQuery({
    queryKey: ['app-settings'],
    queryFn: () => base44.entities.AppSettings.list(),
  });

  const appSettings = appSettingsArr[0] || {};
  const savedBaseUrl = appSettings.public_base_url || 'https://api.legenex.com';

  React.useEffect(() => {
    if (appSettingsArr.length > 0 && !baseUrl) {
      setBaseUrl(appSettings.public_base_url || 'https://api.legenex.com');
    }
  }, [appSettingsArr]);

  const endpointUrl = `${savedBaseUrl}/functions/leads`;

  const saveBaseUrl = async () => {
    if (appSettings.id) {
      await base44.entities.AppSettings.update(appSettings.id, { public_base_url: baseUrl });
    } else {
      await base44.entities.AppSettings.create({ public_base_url: baseUrl });
    }
    setBaseUrlSaved(true);
    setTimeout(() => setBaseUrlSaved(false), 2000);
    qc.invalidateQueries({ queryKey: ['app-settings'] });
    toast.success('Base URL saved');
  };

  const getKeyForSupplier = (supplierId) =>
    apiKeys.find(k => k.supplier_id === supplierId || k.supplier_name === suppliers.find(s => s.id === supplierId)?.name);

  const openCreate = () => {
    setForm(DEFAULT_FORM);
    setEditingSupplierId(null);
    setNewKeyFull(null);
    setSupplierModal(true);
  };

  const openEdit = (supplier) => {
    setForm({
      name: supplier.name || '',
      sid: supplier.sid || '',
      payout_type: supplier.payout_type || 'Flat CPL',
      email: supplier.email || '',
      landing_page_url: supplier.landing_page_url || '',
      brand: supplier.brand || '',
      active: supplier.active ?? true,
    });
    setEditingSupplierId(supplier.id);
    setNewKeyFull(null);
    setSupplierModal(true);
  };

  const saveSupplier = async () => {
    let supplierId = editingSupplierId;
    if (editingSupplierId) {
      await base44.entities.Supplier.update(editingSupplierId, form);
      const existingKey = getKeyForSupplier(editingSupplierId);
      if (existingKey) {
        await base44.entities.ApiKey.update(existingKey.id, {
          supplier_name: form.name,
          active: form.active,
        });
      }
      toast.success('Supplier updated');
    } else {
      const supplier = await base44.entities.Supplier.create(form);
      supplierId = supplier.id;
      const key = generateKey();
      setNewKeyFull(key);
      await base44.entities.ApiKey.create({
        name: form.name,
        type: 'supplier',
        supplier_name: form.name,
        supplier_id: supplierId,
        key,
        key_prefix: key.substring(0, 16),
        active: form.active,
        request_count: 0,
      });
      toast.success('Supplier created — copy the key now!');
    }
    qc.invalidateQueries({ queryKey: ['suppliers'] });
    qc.invalidateQueries({ queryKey: ['api-keys'] });
    if (editingSupplierId) setSupplierModal(false);
  };

  const regenerateKey = async (supplier) => {
    const existingKey = getKeyForSupplier(supplier.id);
    const key = generateKey();
    if (existingKey) {
      await base44.entities.ApiKey.update(existingKey.id, {
        key,
        key_prefix: key.substring(0, 16),
        request_count: 0,
        last_used_at: null,
      });
    } else {
      await base44.entities.ApiKey.create({
        name: supplier.name,
        type: 'supplier',
        supplier_name: supplier.name,
        supplier_id: supplier.id,
        key,
        key_prefix: key.substring(0, 16),
        active: true,
        request_count: 0,
      });
    }
    navigator.clipboard.writeText(key);
    toast.success('New key generated and copied!');
    qc.invalidateQueries({ queryKey: ['api-keys'] });
  };

  const copyKey = (supplier) => {
    const k = getKeyForSupplier(supplier.id);
    if (!k) return toast.error('No key found');
    if (showKeys[supplier.id]) {
      navigator.clipboard.writeText(k.key);
      toast.success('Key copied');
    } else {
      toast.info('Reveal the key first');
    }
  };

  const copyEndpoint = (supplier) => {
    const k = getKeyForSupplier(supplier.id);
    const url = k ? `${endpointUrl}?key=${k.key}` : endpointUrl;
    navigator.clipboard.writeText(url);
    toast.success('Endpoint copied');
  };

  const toggleActive = async (supplier) => {
    await base44.entities.Supplier.update(supplier.id, { active: !supplier.active });
    const k = getKeyForSupplier(supplier.id);
    if (k) await base44.entities.ApiKey.update(k.id, { active: !supplier.active });
    qc.invalidateQueries({ queryKey: ['suppliers'] });
    qc.invalidateQueries({ queryKey: ['api-keys'] });
  };

  return (
    <div>
      {/* Endpoint Config */}
      <div className="bg-card border border-primary/30 rounded-[10px] p-4 mb-6">
        <div className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">Supplier Endpoint</div>
        <div className="flex items-center gap-2 mb-3">
          <code className="flex-1 bg-background rounded-lg px-3 py-2 font-mono text-[12px] text-primary border border-border">{endpointUrl}</code>
          <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(endpointUrl); toast.success('Copied'); }}>
            <Copy className="w-3.5 h-3.5" />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-[12px] whitespace-nowrap">Base URL</Label>
          <Input value={baseUrl} onChange={e => setBaseUrl(e.target.value)} className="bg-background font-mono text-[12px]" />
          <Button size="sm" onClick={saveBaseUrl}>{baseUrlSaved ? 'Saved' : 'Save'}</Button>
        </div>
      </div>

      <div className="flex justify-end mb-4">
        <Button size="sm" onClick={openCreate} className="gap-1.5"><Plus className="w-4 h-4" /> Add Supplier</Button>
      </div>

      {/* Suppliers Table */}
      <div className="bg-card border border-border rounded-[10px] overflow-hidden">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              {['Supplier', 'SID', 'Brand', 'Type', 'Key', 'Last Used', 'Requests', 'Actions'].map(h => (
                <th key={h} className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {suppliers.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">No suppliers yet</td></tr>
            )}
            {suppliers.map(s => {
              const k = getKeyForSupplier(s.id);
              return (
                <tr key={s.id} className="hover:bg-accent/40 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium text-foreground">{s.name}</div>
                    <Badge variant="outline" className={`text-[9px] mt-0.5 ${s.active ? 'status-sold bg-status-sold' : 'text-muted-foreground'}`}>
                      {s.active ? 'Active' : 'Inactive'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground">{s.sid || '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground">{s.brand || '—'}</td>
                  <td className="px-4 py-3"><Badge variant="outline" className="text-[10px]">{s.payout_type}</Badge></td>
                  <td className="px-4 py-3">
                    {k ? (
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-[11px] text-muted-foreground">
                          {showKeys[s.id] ? k.key : `${k.key_prefix}...`}
                        </span>
                        <button onClick={() => setShowKeys(p => ({ ...p, [s.id]: !p[s.id] }))} className="text-muted-foreground hover:text-foreground">
                          {showKeys[s.id] ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                        </button>
                      </div>
                    ) : <span className="text-muted-foreground text-[11px]">—</span>}
                  </td>
                  <td className="px-4 py-3 text-[11px] text-muted-foreground font-mono">
                    {k?.last_used_at ? format(new Date(k.last_used_at), 'MMM dd HH:mm') : '—'}
                  </td>
                  <td className="px-4 py-3 font-mono text-[11px]">{k?.request_count || 0}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="ghost" onClick={() => openEdit(s)} className="h-7 text-[11px] px-2">Edit</Button>
                      <Button size="sm" variant="ghost" onClick={() => copyKey(s)} className="h-7 w-7 p-0" title="Copy Key"><Copy className="w-3 h-3" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => regenerateKey(s)} className="h-7 w-7 p-0" title="Regenerate Key"><RefreshCw className="w-3 h-3" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => copyEndpoint(s)} className="h-7 text-[11px] px-2">Endpoint</Button>
                      <Button size="sm" variant="ghost" onClick={() => toggleActive(s)} className="h-7 text-[11px] px-2 text-muted-foreground">
                        {s.active ? 'Deactivate' : 'Activate'}
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Supplier Modal */}
      <Dialog open={supplierModal} onOpenChange={(v) => { if (!v && !newKeyFull) setSupplierModal(false); }}>
        <DialogContent className="bg-popover border-border max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{editingSupplierId ? 'Edit Supplier' : 'New Supplier'}</DialogTitle>
          </DialogHeader>

          {newKeyFull ? (
            <div className="space-y-4">
              <div className="bg-background border border-primary/30 rounded-lg p-4">
                <div className="text-[12px] font-semibold text-primary mb-2">API Key Generated — Copy Now</div>
                <div className="font-mono text-[12px] text-foreground break-all bg-muted/50 rounded p-3">{newKeyFull}</div>
                <p className="text-[11px] text-muted-foreground mt-2">This key will never be shown in full again. Store it securely.</p>
              </div>
              <Button className="w-full" onClick={() => { navigator.clipboard.writeText(newKeyFull); toast.success('Copied!'); }}>
                <Copy className="w-4 h-4 mr-2" /> Copy Key
              </Button>
              <Button variant="ghost" className="w-full" onClick={() => setSupplierModal(false)}>Done</Button>
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
                    <Label className="text-[12px]">Payout Type</Label>
                    <Select value={form.payout_type} onValueChange={v => setForm(p => ({ ...p, payout_type: v }))}>
                      <SelectTrigger className="mt-1 bg-background"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Ping-Post">Ping-Post</SelectItem>
                        <SelectItem value="Inbound Call">Inbound Call</SelectItem>
                        <SelectItem value="Flat CPL">Flat CPL</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label className="text-[12px]">Brand</Label><Input value={form.brand} onChange={e => setForm(p => ({ ...p, brand: e.target.value }))} className="mt-1 bg-background" /></div>
                </div>
                <div><Label className="text-[12px]">Email</Label><Input value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} className="mt-1 bg-background" /></div>
                <div><Label className="text-[12px]">Landing Page URL</Label><Input value={form.landing_page_url} onChange={e => setForm(p => ({ ...p, landing_page_url: e.target.value }))} className="mt-1 bg-background font-mono text-[12px]" /></div>
                <div className="flex items-center gap-2"><Switch checked={form.active} onCheckedChange={v => setForm(p => ({ ...p, active: v }))} /><Label className="text-[12px]">Active</Label></div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setSupplierModal(false)}>Cancel</Button>
                <Button onClick={saveSupplier} disabled={!form.name}>{editingSupplierId ? 'Save Changes' : 'Create Supplier'}</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}