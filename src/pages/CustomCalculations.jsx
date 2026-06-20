import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import PageHeader from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Pencil, Trash2, Calculator } from 'lucide-react';

const DEFAULT_DATE_BUCKETS = [
  { label: 'Within 7 Days', max_days: 7 },
  { label: 'Within 14 Days', max_days: 14 },
  { label: 'Within 30 Days', max_days: 30 },
  { label: 'Within 3 Months', max_days: 90 },
  { label: 'Within 6 Months', max_days: 180 },
  { label: 'Within 12 Months', max_days: 365 },
  { label: 'Within 18 Months', max_days: 545 },
  { label: 'Within 24 Months', max_days: 730 },
];

const BLANK_FORM = {
  output_token: '',
  output_label: '',
  transform_type: 'date_age_bucket',
  input_field: '',
  enabled: true,
  sort_order: 0,
  // date_age_bucket config
  buckets: DEFAULT_DATE_BUCKETS.map(b => ({ ...b })),
  fallback: 'Over 24 Months',
  date_format: 'MM/DD/YYYY',
  // value_map config
  value_map: [{ from: '', to: '' }],
  // script config
  script: `// Available variables:\n// value - the raw input field value\n// lead - the full lead payload object\n// Return the computed output value.\n\nreturn value;`,
};

function formToRecord(form) {
  let config = {};
  if (form.transform_type === 'date_age_bucket') {
    config = { buckets: form.buckets, fallback: form.fallback, date_format: form.date_format };
  } else if (form.transform_type === 'value_map') {
    const map = {};
    form.value_map.forEach(r => { if (r.from) map[r.from] = r.to; });
    config = { map };
  } else {
    config = { script: form.script };
  }
  return {
    output_token: form.output_token,
    output_label: form.output_label || form.output_token,
    transform_type: form.transform_type,
    input_field: form.input_field,
    enabled: form.enabled,
    sort_order: form.sort_order,
    config: JSON.stringify(config),
  };
}

function recordToForm(rec) {
  let cfg = {};
  try { cfg = JSON.parse(rec.config || '{}'); } catch {}
  return {
    output_token: rec.output_token || '',
    output_label: rec.output_label || '',
    transform_type: rec.transform_type || 'date_age_bucket',
    input_field: rec.input_field || '',
    enabled: rec.enabled !== false,
    sort_order: rec.sort_order || 0,
    buckets: cfg.buckets || DEFAULT_DATE_BUCKETS.map(b => ({ ...b })),
    fallback: cfg.fallback || 'Over 24 Months',
    date_format: cfg.date_format || 'MM/DD/YYYY',
    value_map: cfg.map ? Object.entries(cfg.map).map(([from, to]) => ({ from, to })) : [{ from: '', to: '' }],
    script: cfg.script || BLANK_FORM.script,
  };
}

export default function CustomCalculations() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ ...BLANK_FORM });
  const [deleteId, setDeleteId] = useState(null);

  const { data: calcs = [] } = useQuery({
    queryKey: ['custom-calculations'],
    queryFn: () => base44.entities.CustomCalculation.list('sort_order', 50),
  });

  const { data: customFields = [] } = useQuery({
    queryKey: ['custom-fields'],
    queryFn: () => base44.entities.CustomField.list(),
  });

  const inboundFields = customFields.filter(f => f.source === 'inbound' || !f.source);

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      if (editId) return base44.entities.CustomCalculation.update(editId, data);
      return base44.entities.CustomCalculation.create(data);
    },
    onSuccess: async (saved) => {
      // Sync output_token as a CustomField so it appears in payload builder
      const existing = customFields.find(f => f.field_name === form.output_token);
      if (!existing) {
        await base44.entities.CustomField.create({
          field_name: form.output_token,
          label: form.output_label || form.output_token,
          field_type: 'string',
          source: 'inbound',
          include_in_leadbyte: true,
          leadbyte_field_name: form.output_token,
          auto_created: true,
        });
      }
      qc.invalidateQueries(['custom-calculations']);
      qc.invalidateQueries(['custom-fields']);
      setOpen(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.CustomCalculation.delete(id),
    onSuccess: () => { qc.invalidateQueries(['custom-calculations']); setDeleteId(null); },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }) => base44.entities.CustomCalculation.update(id, { enabled }),
    onSuccess: () => qc.invalidateQueries(['custom-calculations']),
  });

  function openNew() {
    setEditId(null);
    setForm({ ...BLANK_FORM, buckets: DEFAULT_DATE_BUCKETS.map(b => ({ ...b })) });
    setOpen(true);
  }

  function openEdit(rec) {
    setEditId(rec.id);
    setForm(recordToForm(rec));
    setOpen(true);
  }

  function setF(key, val) { setForm(f => ({ ...f, [key]: val })); }

  function updateBucket(i, key, val) {
    setForm(f => {
      const buckets = [...f.buckets];
      buckets[i] = { ...buckets[i], [key]: key === 'max_days' ? Number(val) : val };
      return { ...f, buckets };
    });
  }

  function addBucket() {
    setForm(f => ({ ...f, buckets: [...f.buckets, { label: '', max_days: 0 }] }));
  }

  function removeBucket(i) {
    setForm(f => ({ ...f, buckets: f.buckets.filter((_, idx) => idx !== i) }));
  }

  function updateMapRow(i, key, val) {
    setForm(f => {
      const value_map = [...f.value_map];
      value_map[i] = { ...value_map[i], [key]: val };
      return { ...f, value_map };
    });
  }

  function addMapRow() { setForm(f => ({ ...f, value_map: [...f.value_map, { from: '', to: '' }] })); }
  function removeMapRow(i) { setForm(f => ({ ...f, value_map: f.value_map.filter((_, idx) => idx !== i) })); }

  const typeLabels = { date_age_bucket: 'Date Age Bucket', value_map: 'Value Map', script: 'Script' };

  return (
    <div className="p-6">
      <PageHeader title="Custom Calculations" subtitle="Define computed fields derived from inbound lead data">
        <Button onClick={openNew} size="sm" className="gap-2">
          <Plus className="w-4 h-4" /> New Calculation
        </Button>
      </PageHeader>

      {calcs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground">
          <Calculator className="w-10 h-10 mb-3 opacity-30" />
          <p className="text-sm">No calculations yet. Create one to transform inbound fields.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {calcs.map(rec => (
            <div key={rec.id} className="flex items-center justify-between px-4 py-3 rounded-lg bg-card border border-border">
              <div className="flex items-center gap-4">
                <Switch
                  checked={rec.enabled !== false}
                  onCheckedChange={(v) => toggleMutation.mutate({ id: rec.id, enabled: v })}
                />
                <div>
                  <div className="text-sm font-medium text-foreground font-mono">{`{{${rec.output_token}}}`}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{rec.output_label || rec.output_token} ← <span className="font-mono">{rec.input_field}</span></div>
                </div>
                <Badge variant="outline" className="text-xs">{typeLabels[rec.transform_type] || rec.transform_type}</Badge>
              </div>
              <div className="flex items-center gap-2">
                <Button size="icon" variant="ghost" onClick={() => openEdit(rec)}><Pencil className="w-4 h-4" /></Button>
                <Button size="icon" variant="ghost" className="text-destructive" onClick={() => setDeleteId(rec.id)}><Trash2 className="w-4 h-4" /></Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit/Create Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? 'Edit Calculation' : 'New Calculation'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Output Token <span className="text-muted-foreground text-xs">(used as {'{{token}}'})</span></Label>
                <Input value={form.output_token} onChange={e => setF('output_token', e.target.value.replace(/\s/g, '_'))} placeholder="accident_date" />
              </div>
              <div className="space-y-1.5">
                <Label>Output Label</Label>
                <Input value={form.output_label} onChange={e => setF('output_label', e.target.value)} placeholder="Accident Date Bucket" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Input Field</Label>
                <Select value={form.input_field} onValueChange={v => setF('input_field', v)}>
                  <SelectTrigger><SelectValue placeholder="Select field…" /></SelectTrigger>
                  <SelectContent>
                    {inboundFields.map(f => (
                      <SelectItem key={f.field_name} value={f.field_name}>{f.label || f.field_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Transform Type</Label>
                <Select value={form.transform_type} onValueChange={v => setF('transform_type', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="date_age_bucket">Date Age Bucket</SelectItem>
                    <SelectItem value="value_map">Value Map</SelectItem>
                    <SelectItem value="script">Script</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* DATE AGE BUCKET */}
            {form.transform_type === 'date_age_bucket' && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Date Format</Label>
                  <Input value={form.date_format} onChange={e => setF('date_format', e.target.value)} placeholder="MM/DD/YYYY" />
                </div>
                <div>
                  <Label className="mb-2 block">Age Buckets <span className="text-muted-foreground text-xs">(checked in order, first match wins)</span></Label>
                  <div className="space-y-2">
                    {form.buckets.map((b, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <Input className="flex-1" value={b.label} onChange={e => updateBucket(i, 'label', e.target.value)} placeholder="Label" />
                        <Input className="w-28" type="number" value={b.max_days} onChange={e => updateBucket(i, 'max_days', e.target.value)} placeholder="Max days" />
                        <span className="text-xs text-muted-foreground whitespace-nowrap">days</span>
                        <Button size="icon" variant="ghost" className="text-destructive shrink-0" onClick={() => removeBucket(i)}><Trash2 className="w-3.5 h-3.5" /></Button>
                      </div>
                    ))}
                    <Button size="sm" variant="outline" onClick={addBucket} className="gap-1"><Plus className="w-3.5 h-3.5" />Add Bucket</Button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Fallback Value <span className="text-muted-foreground text-xs">(when no bucket matches)</span></Label>
                  <Input value={form.fallback} onChange={e => setF('fallback', e.target.value)} placeholder="Over 24 Months" />
                </div>
              </div>
            )}

            {/* VALUE MAP */}
            {form.transform_type === 'value_map' && (
              <div className="space-y-2">
                <Label className="block mb-1">Value Mappings</Label>
                {form.value_map.map((row, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input className="flex-1" value={row.from} onChange={e => updateMapRow(i, 'from', e.target.value)} placeholder="From value" />
                    <span className="text-muted-foreground">→</span>
                    <Input className="flex-1" value={row.to} onChange={e => updateMapRow(i, 'to', e.target.value)} placeholder="To value" />
                    <Button size="icon" variant="ghost" className="text-destructive shrink-0" onClick={() => removeMapRow(i)}><Trash2 className="w-3.5 h-3.5" /></Button>
                  </div>
                ))}
                <Button size="sm" variant="outline" onClick={addMapRow} className="gap-1"><Plus className="w-3.5 h-3.5" />Add Row</Button>
              </div>
            )}

            {/* SCRIPT */}
            {form.transform_type === 'script' && (
              <div className="space-y-1.5">
                <Label>JavaScript Transform Script</Label>
                <Textarea
                  className="font-mono text-xs h-48"
                  value={form.script}
                  onChange={e => setF('script', e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Available: <code className="bg-muted px-1 rounded">value</code> (input field value), <code className="bg-muted px-1 rounded">lead</code> (full payload). Must return the output value.
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate(formToRecord(form))} disabled={!form.output_token || !form.input_field || saveMutation.isPending}>
              {saveMutation.isPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Delete Calculation?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">This cannot be undone. The corresponding custom field will remain.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteMutation.mutate(deleteId)} disabled={deleteMutation.isPending}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}