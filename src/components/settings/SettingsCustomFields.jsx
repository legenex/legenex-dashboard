import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, Copy, Trash2, Edit2, Wand2, GripVertical } from 'lucide-react';
import { toast } from 'sonner';

const BLANK_FIELD = {
  field_name: '', label: '', field_type: 'string',
  source: 'inbound', include_in_leadbyte: true,
  leadbyte_field_name: '', system_populated: false,
};

function guessType(value) {
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  return 'string';
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

  const { data: fields = [] } = useQuery({
    queryKey: ['custom-fields'],
    queryFn: () => base44.entities.CustomField.list(),
  });

  // Sort by sort_order, then created_date as fallback
  useEffect(() => {
    const sorted = [...fields].sort((a, b) => {
      const ao = a.sort_order ?? a.created_date ?? 0;
      const bo = b.sort_order ?? b.created_date ?? 0;
      return ao - bo;
    });
    setOrderedFields(sorted);
  }, [fields]);

  const openCreate = () => { setForm(BLANK_FIELD); setEditingId(null); setEditModal(true); };

  const openEdit = (f) => {
    setForm({
      field_name: f.field_name || '', label: f.label || '',
      field_type: f.field_type || 'string', source: f.source || 'inbound',
      include_in_leadbyte: f.include_in_leadbyte ?? true,
      leadbyte_field_name: f.leadbyte_field_name || '',
      system_populated: f.system_populated ?? false,
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
      system_populated: false,
    });
    setEditingId(null);
    setEditModal(true);
  };

  const saveField = async () => {
    const data = { ...form };
    if (!data.leadbyte_field_name) data.leadbyte_field_name = data.field_name;
    if (!data.label) data.label = data.field_name;
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

  const deleteField = async (id) => {
    await base44.entities.CustomField.delete(id);
    qc.invalidateQueries({ queryKey: ['custom-fields'] });
    toast.success('Field deleted');
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

    // Persist new sort_order for affected items
    const updates = reordered.map((f, i) => ({ id: f.id, sort_order: i }));
    // Only update the ones that changed (between from and to range)
    const lo = Math.min(from, to);
    const hi = Math.max(from, to);
    await Promise.all(
      updates.slice(lo, hi + 1).map(u =>
        base44.entities.CustomField.update(u.id, { sort_order: u.sort_order })
      )
    );
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="text-[13px] text-muted-foreground">{fields.length} fields defined</div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setDetectOpen(true)} className="gap-1.5">
            <Wand2 className="w-3.5 h-3.5" /> Detect from JSON
          </Button>
          <Button size="sm" onClick={openCreate} className="gap-1.5">
            <Plus className="w-4 h-4" /> Add Field
          </Button>
        </div>
      </div>

      <div className="bg-card border border-border rounded-[10px] overflow-hidden">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="w-8 px-2" />
              {['Token (field_name)', 'Label', 'Type', 'Send to LB', 'LB Field', 'Notes', ''].map(h => (
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
                  {orderedFields.length === 0 && (
                    <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">No fields yet. Add fields manually or detect from a sample payload.</td></tr>
                  )}
                  {orderedFields.map((f, index) => (
                    <Draggable key={f.id} draggableId={f.id} index={index}>
                      {(provided, snapshot) => (
                        <tr
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          className={`hover:bg-accent/40 transition-colors ${snapshot.isDragging ? 'bg-accent shadow-lg' : ''}`}
                        >
                          <td className="px-2 py-2.5 w-8">
                            <div {...provided.dragHandleProps} className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground">
                              <GripVertical className="w-4 h-4" />
                            </div>
                          </td>
                          <td className="px-4 py-2.5 font-mono text-[12px] text-primary">{'{{' + f.field_name + '}}'}</td>
                          <td className="px-4 py-2.5 text-foreground">{f.label || f.field_name}</td>
                          <td className="px-4 py-2.5"><Badge variant="outline" className="text-[10px]">{f.field_type}</Badge></td>
                          <td className="px-4 py-2.5">
                            <Switch checked={f.include_in_leadbyte} onCheckedChange={async v => {
                              await base44.entities.CustomField.update(f.id, { include_in_leadbyte: v });
                              qc.invalidateQueries({ queryKey: ['custom-fields'] });
                            }} />
                          </td>
                          <td className="px-4 py-2.5 font-mono text-[11px] text-muted-foreground">{f.leadbyte_field_name || f.field_name}</td>
                          <td className="px-4 py-2.5">
                            {f.system_populated && <Badge className="bg-primary/10 text-primary text-[10px]">HLR-filled</Badge>}
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-1">
                              <Button size="sm" variant="ghost" onClick={() => openEdit(f)} className="h-7 w-7 p-0"><Edit2 className="w-3 h-3" /></Button>
                              <Button size="sm" variant="ghost" onClick={() => openCopy(f)} className="h-7 w-7 p-0"><Copy className="w-3 h-3" /></Button>
                              <Button size="sm" variant="ghost" onClick={() => deleteField(f.id)} className="h-7 w-7 p-0 text-destructive"><Trash2 className="w-3 h-3" /></Button>
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
            <div><Label className="text-[12px]">Token / field_name *</Label><Input value={form.field_name} onChange={e => setForm(p => ({ ...p, field_name: e.target.value }))} placeholder="e.g. phone" className="mt-1 bg-background font-mono text-[12px]" disabled={!!editingId} /></div>
            <div><Label className="text-[12px]">Label</Label><Input value={form.label} onChange={e => setForm(p => ({ ...p, label: e.target.value }))} className="mt-1 bg-background" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[12px]">Type</Label>
                <Select value={form.field_type} onValueChange={v => setForm(p => ({ ...p, field_type: v }))}>
                  <SelectTrigger className="mt-1 bg-background"><SelectValue /></SelectTrigger>
                  <SelectContent>{['string', 'number', 'boolean', 'date'].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label className="text-[12px]">LB Field Name</Label><Input value={form.leadbyte_field_name} onChange={e => setForm(p => ({ ...p, leadbyte_field_name: e.target.value }))} placeholder="defaults to field_name" className="mt-1 bg-background font-mono text-[12px]" /></div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2"><Switch checked={form.include_in_leadbyte} onCheckedChange={v => setForm(p => ({ ...p, include_in_leadbyte: v }))} /><Label className="text-[12px]">Send to LeadByte</Label></div>
              <div className="flex items-center gap-2"><Switch checked={form.system_populated} onCheckedChange={v => setForm(p => ({ ...p, system_populated: v }))} /><Label className="text-[12px]">HLR-filled</Label></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditModal(false)}>Cancel</Button>
            <Button onClick={saveField} disabled={!form.field_name}>Save</Button>
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
    </div>
  );
}