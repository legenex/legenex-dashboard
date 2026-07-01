import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
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
import { Textarea } from '@/components/ui/textarea';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Plus, Pencil, Trash2, Calculator, GripVertical } from 'lucide-react';
import { toast } from 'sonner';
import { OutputFieldPicker } from '@/components/calculations/OutputFieldPicker';
import ReferenceKeyPanel from '@/components/calculations/ReferenceKeyPanel';

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
  } else if (form.transform_type === 'clone') {
    config = {};
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
      // Sync output_token as a Calculated CustomField so it appears in payload builder
      try {
        const existing = customFields.find(f => f.field_name === form.output_token);
        if (!existing) {
          await base44.entities.CustomField.create({
            field_name: form.output_token,
            label: form.output_label || form.output_token,
            field_type: 'Calculated',
            source: 'inbound',
            include_in_leadbyte: true,
            leadbyte_field_name: form.output_token,
            auto_created: true,
          });
        } else if (existing.field_type !== 'Calculated') {
          await base44.entities.CustomField.update(existing.id, { field_type: 'Calculated' });
        }
      } catch (e) { /* field may already exist (e.g. created inline) — ignore */ }
      qc.invalidateQueries({ queryKey: ['custom-calculations'] });
      qc.invalidateQueries({ queryKey: ['custom-fields'] });
      setOpen(false);
      toast.success(editId ? 'Calculated field updated' : 'Calculated field created');
    },
    onError: (err) => {
      toast.error('Failed to save: ' + (err?.message || 'Unknown error'));
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

  const reorderMutation = useMutation({
    mutationFn: async (orderedIds) => {
      const updates = orderedIds.map((id, idx) => ({ id, sort_order: idx }));
      return base44.entities.CustomCalculation.bulkUpdate(updates);
    },
    onError: () => qc.invalidateQueries({ queryKey: ['custom-calculations'] }),
  });

  function onDragEnd(result) {
    if (!result.destination || result.destination.index === result.source.index) return;
    const from = result.source.index;
    const to = result.destination.index;
    const ordered = [...calcs];
    const [moved] = ordered.splice(from, 1);
    ordered.splice(to, 0, moved);
    qc.setQueryData(['custom-calculations'], ordered);
    reorderMutation.mutate(ordered.map(c => c.id));
  }

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

  const typeLabels = { date_age_bucket: 'Date Transformer', value_map: 'Value Map', clone: 'Clone', script: 'Script' };

  return (
    <div className="p-6">
      <PageHeader title="Calculated Fields" subtitle="Define computed fields derived from inbound lead data. Drag to reorder.">
        <Button onClick={openNew} size="sm" className="gap-2">
          <Plus className="w-4 h-4" /> New Calculated Field
        </Button>
      </PageHeader>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
      {calcs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground">
          <Calculator className="w-10 h-10 mb-3 opacity-30" />
          <p className="text-sm">No calculations yet. Create one to transform inbound fields.</p>
        </div>
      ) : (
        <DragDropContext onDragEnd={onDragEnd}>
          <Droppable droppableId="calcs">
            {(provided) => (
              <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-2">
                {calcs.map((rec, index) => (
                  <Draggable key={rec.id} draggableId={rec.id} index={index}>
                    {(prov) => (
                      <div
                        ref={prov.innerRef}
                        {...prov.draggableProps}
                        className="flex items-center justify-between px-4 py-3 rounded-lg bg-card border border-border"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div {...prov.dragHandleProps} className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground shrink-0">
                            <GripVertical className="w-4 h-4" />
                          </div>
                          <Switch
                            checked={rec.enabled !== false}
                            onCheckedChange={(v) => toggleMutation.mutate({ id: rec.id, enabled: v })}
                          />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <div className="text-sm font-medium text-foreground font-mono truncate">{`{{${rec.output_token}}}`}</div>
                              <Badge variant="outline" className="text-xs shrink-0">{typeLabels[rec.transform_type] || rec.transform_type}</Badge>
                            </div>
                            <div className="text-xs text-muted-foreground mt-0.5 font-mono truncate">
                              {rec.input_field}<span className="mx-1.5">→</span>{rec.output_token}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Button size="icon" variant="ghost" onClick={() => openEdit(rec)}><Pencil className="w-4 h-4" /></Button>
                          <Button size="icon" variant="ghost" className="text-destructive" onClick={() => setDeleteId(rec.id)}><Trash2 className="w-4 h-4" /></Button>
                        </div>
                      </div>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      )}
        </div>
        <div className="lg:col-span-1">
          <div className="rounded-lg bg-card border border-border p-3 sticky top-4">
            <div className="text-[13px] font-semibold text-foreground mb-2">Reference Key</div>
            <ReferenceKeyPanel />
          </div>
        </div>
      </div>

      {/* Edit/Create Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? 'Edit Calculated Field' : 'New Calculated Field'}</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 py-2">
            <div className="lg:col-span-2 space-y-4">
            {/* Input Field — at the TOP */}
            <div className="space-y-1.5">
              <Label>Input Field</Label>
              <SearchableSelect
                value={form.input_field}
                onValueChange={v => setF('input_field', v)}
                options={inboundFields.map(f => ({ value: f.field_name, label: f.label || f.field_name }))}
                placeholder="Select field…"
              />
            </div>

            {/* Output Field + Output Label on the same line */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Output Field <span className="text-muted-foreground text-xs">(used as {'{{token}}'})</span></Label>
                <OutputFieldPicker
                  value={form.output_token}
                  onValueChange={({ field_name, label }) => setForm(f => ({ ...f, output_token: field_name, output_label: label }))}
                  fields={customFields}
                  placeholder="Select or create output field…"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Output Label</Label>
                <Input value={form.output_label} onChange={e => setF('output_label', e.target.value)} placeholder={form.output_token || 'Calculated Field Label'} />
              </div>
            </div>

            {/* Transform Type */}
            <div className="space-y-1.5">
              <Label>Transform Type</Label>
              <SearchableSelect
                value={form.transform_type}
                onValueChange={v => setF('transform_type', v)}
                options={[
                  { value: 'date_age_bucket', label: 'Date Transformer' },
                  { value: 'value_map', label: 'Value Map' },
                  { value: 'clone', label: 'Clone' },
                  { value: 'script', label: 'Script' },
                ]}
              />
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

            {/* CLONE */}
            {form.transform_type === 'clone' && (
              <div className="rounded-lg border border-border bg-muted/30 p-4">
                <p className="text-[13px] text-muted-foreground leading-relaxed">
                  Clones the value of <span className="font-mono text-foreground">{form.input_field || 'the input field'}</span> into <span className="font-mono text-foreground">{`{{${form.output_token || 'output_field'}}}`}</span>. No additional configuration needed.
                </p>
              </div>
            )}
          </div>
          <div className="lg:col-span-1">
            <div className="rounded-lg bg-card border border-border p-3">
              <div className="text-[13px] font-semibold text-foreground mb-2">Reference Key</div>
              <ReferenceKeyPanel />
            </div>
          </div>
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