import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, Copy, Trash2, Edit2, Wand2, GripVertical, Sparkles, CheckCheck, Ban, ArrowDownUp, Search } from 'lucide-react';
import { toast } from 'sonner';
import ImportExportFieldsDialog from '@/components/settings/ImportExportFieldsDialog';

const BLANK_FIELD = {
  field_name: '', label: '', field_type: 'string',
  source: 'inbound', include_in_leadbyte: true,
  leadbyte_field_name: '', system_populated: false, required: false,
  options: [],
};

function guessType(value) {
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  return 'string';
}

function parseJsonArray(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  try { const p = JSON.parse(val); return Array.isArray(p) ? p : []; } catch { return []; }
}

export default function SettingsCustomFields() {
  const qc = useQueryClient();
  const [editModal, setEditModal] = useState(false);
  const [form, setForm] = useState(BLANK_FIELD);
  const [editingId, setEditingId] = useState(null);
  const [sampleJson, setSampleJson] = useState('');
  const [detectOpen, setDetectOpen] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [orderedFields, setOrderedFields] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [importExportOpen, setImportExportOpen] = useState(false);
  const [search, setSearch] = useState('');

  const { data: fields = [] } = useQuery({
    queryKey: ['custom-fields'],
    queryFn: () => base44.entities.CustomField.list(),
  });

  const { data: appSettings } = useQuery({
    queryKey: ['app-settings'],
    queryFn: async () => {
      const list = await base44.entities.AppSettings.list();
      return list[0] || null;
    },
  });

  const { data: lbConnectors = [] } = useQuery({
    queryKey: ['lb-connectors-default'],
    queryFn: () => base44.entities.LeadByteConnector.filter({ is_default: true }),
  });

  useEffect(() => {
    const sorted = [...fields].sort((a, b) => {
      const ao = a.sort_order ?? a.created_date ?? 0;
      const bo = b.sort_order ?? b.created_date ?? 0;
      return ao - bo;
    });
    setOrderedFields(sorted);
  }, [fields]);

  const autoCount = fields.filter(f => f.auto_created).length;

  const q = search.trim().toLowerCase();
  const visibleFields = q
    ? orderedFields.filter(f =>
        (f.label || '').toLowerCase().includes(q) ||
        (f.field_name || '').toLowerCase().includes(q) ||
        (f.leadbyte_field_name || '').toLowerCase().includes(q)
      )
    : orderedFields;

  const openCreate = () => { setForm(BLANK_FIELD); setEditingId(null); setEditModal(true); };

  const openEdit = (f) => {
    let opts = [];
    if (Array.isArray(f.options)) opts = f.options;
    else if (typeof f.options === 'string') { try { const p = JSON.parse(f.options); if (Array.isArray(p)) opts = p; } catch {} }
    setForm({
      field_name: f.field_name || '', label: f.label || '',
      field_type: f.field_type || 'string', source: f.source || 'inbound',
      include_in_leadbyte: f.include_in_leadbyte ?? true,
      leadbyte_field_name: f.leadbyte_field_name || '',
      system_populated: f.system_populated ?? false,
      required: f.required ?? false,
      options: opts,
    });
    setEditingId(f.id);
    setEditModal(true);
  };

  const openCopy = (f) => {
    setForm({
      field_name: f.field_name + '_copy', label: f.label ? f.label + ' (copy)' : '',
      field_type: f.field_type || 'string', source: f.source || 'inbound',
      include_in_leadbyte: f.include_in_leadbyte ?? true,
      leadbyte_field_name: f.leadbyte_field_name ? f.leadbyte_field_name + '_copy' : '',
      system_populated: false, required: f.required ?? false,
      options: [],
    });
    setEditingId(null);
    setEditModal(true);
  };

  const saveField = async () => {
    const data = { ...form };
    if (!data.leadbyte_field_name) data.leadbyte_field_name = data.field_name;
    if (!data.label) data.label = data.field_name;
    // Only system/dropdown fields carry options; serialize to JSON string for storage.
    data.options = Array.isArray(form.options) && form.options.length > 0
      ? JSON.stringify(form.options.filter(o => String(o).trim() !== ''))
      : '';
    if (editingId) {
      await base44.entities.CustomField.update(editingId, data);
      toast.success('Field updated');
    } else {
      data.sort_order = orderedFields.length;
      await base44.entities.CustomField.create(data);
      toast.success('Field created');
    }
    qc.invalidateQueries({ queryKey: ['custom-fields'] });
    setEditModal(false);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const field = deleteTarget;

    await base44.entities.CustomField.delete(field.id);

    // Add to ignore list so it never regenerates
    const currentIgnore = parseJsonArray(appSettings?.adaptive_fields_ignore_list);
    const normName = field.field_name.toLowerCase();
    if (!currentIgnore.map(s => String(s).toLowerCase()).includes(normName)) {
      currentIgnore.push(field.field_name);
      if (appSettings) {
        await base44.entities.AppSettings.update(appSettings.id, {
          adaptive_fields_ignore_list: JSON.stringify(currentIgnore),
        });
        qc.invalidateQueries({ queryKey: ['app-settings'] });
      }
    }

    // Strip from LeadByte payload_template (template mode)
    const lbConn = lbConnectors[0];
    if (lbConn && lbConn.forwarding_mode === 'template' && lbConn.payload_template) {
      try {
        const parsed = JSON.parse(lbConn.payload_template);
        if (field.field_name in parsed) {
          delete parsed[field.field_name];
          await base44.entities.LeadByteConnector.update(lbConn.id, {
            payload_template: JSON.stringify(parsed, null, 2),
          });
          qc.invalidateQueries({ queryKey: ['lb-connectors-default'] });
        }
      } catch {}
    }

    qc.invalidateQueries({ queryKey: ['custom-fields'] });
    setDeleteTarget(null);
    toast.success('Field deleted and added to ignore list');
  };

  const handleDetect = async () => {
    setDetecting(true);
    try {
      const payload = JSON.parse(sampleJson);
      let created = 0;
      const existing = new Set(fields.map(f => f.field_name));
      for (const [key, value] of Object.entries(payload)) {
        if (!existing.has(key)) {
          await base44.entities.CustomField.create({
            field_name: key,
            label: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
            field_type: guessType(value),
            source: 'inbound',
            include_in_leadbyte: true,
            leadbyte_field_name: key,
            sort_order: orderedFields.length + created,
          });
          created++;
        }
      }
      toast.success(`Created ${created} new fields`);
      qc.invalidateQueries({ queryKey: ['custom-fields'] });
      setDetectOpen(false);
      setSampleJson('');
    } catch {
      toast.error('Invalid JSON');
    }
    setDetecting(false);
  };

  const onDragEnd = async (result) => {
    if (!result.destination) return;
    const from = result.source.index;
    const to = result.destination.index;
    if (from === to) return;

    const reordered = [...orderedFields];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    setOrderedFields(reordered);

    const updates = reordered.map((f, i) => ({ id: f.id, sort_order: i }));
    const lo = Math.min(from, to);
    const hi = Math.max(from, to);
    await Promise.all(
      updates.slice(lo, hi + 1).map(u =>
        base44.entities.CustomField.update(u.id, { sort_order: u.sort_order })
      )
    );
  };

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === orderedFields.length && orderedFields.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(orderedFields.map(f => f.id)));
    }
  };

  const bulkSetRequired = async (required) => {
    const ids = [...selectedIds];
    await Promise.all(ids.map(id =>
      base44.entities.CustomField.update(id, { required })
    ));
    setSelectedIds(new Set());
    qc.invalidateQueries({ queryKey: ['custom-fields'] });
    toast.success(`${ids.length} field${ids.length !== 1 ? 's' : ''} ${required ? 'marked required' : 'unmarked'}`);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="text-[13px] text-muted-foreground">{fields.length} fields defined</div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setImportExportOpen(true)} className="gap-1.5">
            <ArrowDownUp className="w-3.5 h-3.5" /> Import / Export Fields
          </Button>
          <Button size="sm" variant="outline" onClick={() => setDetectOpen(true)} className="gap-1.5">
            <Wand2 className="w-3.5 h-3.5" /> Detect from JSON
          </Button>
          <Button size="sm" onClick={openCreate} className="gap-1.5">
            <Plus className="w-4 h-4" /> Add Field
          </Button>
        </div>
      </div>

      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search fields by label, name or token..."
          className="pl-9 bg-background"
        />
      </div>

      {autoCount > 0 && (
        <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-primary/10 border border-primary/30 rounded-lg">
          <Sparkles className="w-4 h-4 text-primary shrink-0" />
          <span className="text-[13px] text-primary">{autoCount} field{autoCount !== 1 ? 's' : ''} auto-detected from inbound leads</span>
        </div>
      )}

      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 mb-3 px-3 py-2 bg-muted border border-border rounded-lg">
          <span className="text-[13px] text-foreground font-medium">{selectedIds.size} selected</span>
          <Button size="sm" variant="outline" onClick={() => bulkSetRequired(true)} className="gap-1.5 h-7 text-[11px]"><CheckCheck className="w-3 h-3" /> Require All</Button>
          <Button size="sm" variant="outline" onClick={() => bulkSetRequired(false)} className="gap-1.5 h-7 text-[11px]"><Ban className="w-3 h-3" /> Unrequire All</Button>
          <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())} className="h-7 text-[11px] ml-auto">Clear</Button>
        </div>
      )}

      <div className="bg-card border border-border rounded-[10px] overflow-hidden">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="w-8 px-2">
                <Checkbox checked={selectedIds.size > 0 && selectedIds.size === orderedFields.length} onCheckedChange={toggleSelectAll} />
              </th>
              <th className="w-8 px-2" />
              {['Field Label', 'Token', 'Type', 'Required', 'Field Name', 'Tags', ''].map(h => (
                <th key={h} className="text-left px-4 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <DragDropContext onDragEnd={onDragEnd}>
            <Droppable droppableId="fields-list">
              {(provided) => (
                <tbody
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className="divide-y divide-border"
                >
                  {visibleFields.length === 0 && (
                    <tr><td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">
                      {q ? `No fields match "${search.trim()}".` : 'No fields yet. Add fields manually or detect from a sample payload.'}
                    </td></tr>
                  )}
                  {visibleFields.map((f, index) => (
                    <Draggable key={f.id} draggableId={f.id} index={index} isDragDisabled={!!q}>
                      {(provided, snapshot) => (
                        <tr
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          className={`hover:bg-accent/40 transition-colors ${snapshot.isDragging ? 'bg-accent shadow-lg' : ''}`}
                        >
                          <td className="px-2 py-2.5 w-8">
                            <Checkbox checked={selectedIds.has(f.id)} onCheckedChange={() => toggleSelect(f.id)} />
                          </td>
                          <td className="px-2 py-2.5 w-8">
                            <div {...provided.dragHandleProps} className={`text-muted-foreground hover:text-foreground ${q ? 'opacity-30 cursor-not-allowed' : 'cursor-grab active:cursor-grabbing'}`}>
                              <GripVertical className="w-4 h-4" />
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-foreground">{f.label || f.field_name}</td>
                          <td className="px-4 py-2.5 font-mono text-[12px] text-primary">{'{{' + f.field_name + '}}'}</td>
                          <td className="px-4 py-2.5"><Badge variant="outline" className="text-[10px]">{f.field_type}</Badge></td>
                          <td className="px-4 py-2.5">
                            <Switch checked={f.required} onCheckedChange={async v => {
                              await base44.entities.CustomField.update(f.id, { required: v });
                              qc.invalidateQueries({ queryKey: ['custom-fields'] });
                            }} />
                          </td>
                          <td className="px-4 py-2.5 font-mono text-[11px] text-muted-foreground">{f.leadbyte_field_name || f.field_name}</td>
                          <td className="px-4 py-2.5">
                            <div className="flex flex-wrap gap-1">
                              {f.auto_created && <Badge className="bg-primary/10 text-primary text-[10px] gap-1"><Sparkles className="w-2.5 h-2.5" /> Auto</Badge>}
                              {f.auto_created && f.sample_value && (
                                <span className="text-[10px] text-muted-foreground font-mono max-w-[120px] truncate" title={f.sample_value}>= {f.sample_value}</span>
                              )}
                              {f.system_populated && <Badge className="bg-primary/10 text-primary text-[10px]">HLR-filled</Badge>}
                              {f.field_type === 'system' && <Badge className="bg-chart-5/15 text-chart-5 text-[10px]">{f.system_role === 'email_valid' ? 'Email Valid' : f.system_role === 'phone_verified' ? 'Phone Verified' : 'System'}</Badge>}
                              {f.required && <Badge className="bg-status-queued status-queued text-[10px]">Required</Badge>}
                            </div>
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-1">
                              <Button size="sm" variant="ghost" onClick={() => openEdit(f)} className="h-7 w-7 p-0"><Edit2 className="w-3 h-3" /></Button>
                              <Button size="sm" variant="ghost" onClick={() => openCopy(f)} className="h-7 w-7 p-0"><Copy className="w-3 h-3" /></Button>
                              {f.field_type !== 'system' && (
                                <Button size="sm" variant="ghost" onClick={() => setDeleteTarget(f)} className="h-7 w-7 p-0 text-destructive"><Trash2 className="w-3.5 h-3.5" /></Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </tbody>
              )}
            </Droppable>
          </DragDropContext>
        </table>
      </div>

      {/* Edit/Create Modal */}
      <Dialog open={editModal} onOpenChange={setEditModal}>
        <DialogContent className="bg-popover border-border max-w-[420px]">
          <DialogHeader><DialogTitle>{editingId ? 'Edit Field' : 'New Field'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-[12px]">Token / field_name *</Label><Input value={form.field_name} onChange={e => setForm(p => ({ ...p, field_name: e.target.value }))} placeholder="e.g. phone" className="mt-1 bg-background font-mono text-[12px]" /></div>
            <div><Label className="text-[12px]">Label</Label><Input value={form.label} onChange={e => setForm(p => ({ ...p, label: e.target.value }))} className="mt-1 bg-background" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[12px]">Type</Label>
                <SearchableSelect
                  value={form.field_type}
                  onValueChange={v => setForm(p => ({ ...p, field_type: v }))}
                  className="mt-1 bg-background"
                  options={[
                    ...(form.field_type === 'system' ? [{ value: 'system', label: 'system' }] : []),
                    ...['string', 'number', 'boolean', 'date', 'Calculated'].map(t => ({ value: t, label: t })),
                  ]}
                />
              </div>
              <div><Label className="text-[12px]">LB Key</Label><Input value={form.leadbyte_field_name} onChange={e => setForm(p => ({ ...p, leadbyte_field_name: e.target.value }))} placeholder="defaults to field_name" className="mt-1 bg-background font-mono text-[12px]" /></div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2"><Switch checked={form.include_in_leadbyte} onCheckedChange={v => setForm(p => ({ ...p, include_in_leadbyte: v }))} /><Label className="text-[12px]">Send to LeadByte</Label></div>
              <div className="flex items-center gap-2"><Switch checked={form.system_populated} onCheckedChange={v => setForm(p => ({ ...p, system_populated: v }))} /><Label className="text-[12px]">HLR-filled</Label></div>
              <div className="flex items-center gap-2"><Switch checked={form.required} onCheckedChange={v => setForm(p => ({ ...p, required: v }))} /><Label className="text-[12px]">Required (gate)</Label></div>
            </div>
            {form.field_type === 'system' && (
              <div className="space-y-2 pt-2 border-t border-border">
                <Label className="text-[12px]">Dropdown Values <span className="text-muted-foreground text-[11px]">(also used as Triggers on Destinations & Conversion Events)</span></Label>
                {Array.isArray(form.options) && form.options.map((opt, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      value={opt}
                      onChange={e => setForm(p => {
                        const next = [...p.options];
                        next[i] = e.target.value;
                        return { ...p, options: next };
                      })}
                      placeholder="e.g. Qualified"
                      className="bg-background font-mono text-[12px]"
                    />
                    <Button size="icon" variant="ghost" className="h-8 w-8 p-0 text-destructive shrink-0" onClick={() => setForm(p => ({ ...p, options: p.options.filter((_, idx) => idx !== i) }))}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
                <Button size="sm" variant="outline" onClick={() => setForm(p => ({ ...p, options: [...(p.options || []), ''] }))} className="gap-1.5">
                  <Plus className="w-3.5 h-3.5" /> Add Value
                </Button>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditModal(false)}>Cancel</Button>
            <Button onClick={saveField} disabled={!form.field_name}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={open => { if (!open) setDeleteTarget(null); }}>
        <DialogContent className="bg-popover border-border max-w-[400px]">
          <DialogHeader><DialogTitle>Delete field?</DialogTitle></DialogHeader>
          <p className="text-[13px] text-muted-foreground">
            Deleting <span className="font-mono text-foreground">{deleteTarget?.field_name}</span> will also add it to the ignore list and strip it from the LeadByte payload template, so it will never auto-regenerate or forward again.
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={confirmDelete} className="gap-1.5"><Trash2 className="w-3.5 h-3.5" /> Delete & Ignore</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detect from JSON Modal */}
      <Dialog open={detectOpen} onOpenChange={setDetectOpen}>
        <DialogContent className="bg-popover border-border max-w-[480px]">
          <DialogHeader><DialogTitle>Detect Fields from JSON</DialogTitle></DialogHeader>
          <div>
            <Label className="text-[12px]">Paste a sample inbound lead payload</Label>
            <Textarea value={sampleJson} onChange={e => setSampleJson(e.target.value)} className="mt-1 bg-background font-mono text-[12px] min-h-[180px]" placeholder='{"firstname":"John","phone":"5551234567",...}' />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDetectOpen(false)}>Cancel</Button>
            <Button onClick={handleDetect} disabled={detecting || !sampleJson}>{detecting ? 'Detecting...' : 'Create Fields'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ImportExportFieldsDialog
        open={importExportOpen}
        onOpenChange={setImportExportOpen}
        fields={orderedFields}
      />
    </div>
  );
}