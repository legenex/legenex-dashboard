import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Wand2, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

function guessType(value) {
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'string' && !isNaN(Date.parse(value)) && value.length > 8) return 'date';
  return 'string';
}

export default function SettingsCustomFields() {
  const qc = useQueryClient();
  const [sampleJson, setSampleJson] = useState('');
  const [detecting, setDetecting] = useState(false);

  const { data: fields = [] } = useQuery({
    queryKey: ['custom-fields'],
    queryFn: () => base44.entities.CustomField.list(),
  });

  const handleDetect = async () => {
    setDetecting(true);
    try {
      const payload = JSON.parse(sampleJson);
      const entries = Object.entries(payload);
      const created = [];
      for (const [key, value] of entries) {
        const exists = fields.find(f => f.field_name === key);
        if (!exists) {
          await base44.entities.CustomField.create({
            field_name: key,
            label: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
            field_type: guessType(value),
            source: 'inbound',
            sample_value: String(value),
            include_in_leadbyte: true,
            leadbyte_field_name: key,
            auto_created: true,
          });
          created.push(key);
        }
      }
      toast.success(`Detected ${created.length} new fields`);
      qc.invalidateQueries({ queryKey: ['custom-fields'] });
    } catch (err) {
      toast.error('Invalid JSON');
    }
    setDetecting(false);
  };

  const updateField = async (id, data) => {
    await base44.entities.CustomField.update(id, data);
    qc.invalidateQueries({ queryKey: ['custom-fields'] });
    toast.success('Field updated');
  };

  const deleteField = async (id) => {
    await base44.entities.CustomField.delete(id);
    qc.invalidateQueries({ queryKey: ['custom-fields'] });
    toast.success('Field deleted');
  };

  return (
    <div>
      {/* Detect from Payload */}
      <Card className="bg-card border-border mb-6">
        <CardHeader><CardTitle className="text-[14px]">Detect Fields from Payload</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={sampleJson}
            onChange={e => setSampleJson(e.target.value)}
            placeholder='Paste a sample inbound lead JSON here...'
            className="bg-background font-mono text-[12px] min-h-[120px]"
          />
          <Button size="sm" onClick={handleDetect} disabled={detecting || !sampleJson} className="gap-1.5">
            <Wand2 className="w-4 h-4" /> {detecting ? 'Detecting...' : 'Detect Fields'}
          </Button>
        </CardContent>
      </Card>

      {/* Fields List */}
      <div className="space-y-3">
        {fields.length === 0 && <div className="text-center py-8 text-muted-foreground text-[13px]">No custom fields. Use the detector above to create them from a sample payload.</div>}
        {fields.map(field => (
          <div key={field.id} className="bg-card border border-border rounded-[10px] p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <span className="font-mono text-[13px] text-foreground">{field.field_name}</span>
                {field.auto_created && <span className="text-[10px] text-muted-foreground ml-2">(auto-detected)</span>}
              </div>
              <Button variant="ghost" size="sm" onClick={() => deleteField(field.id)} className="text-destructive h-7 w-7 p-0">
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <Label className="text-[11px]">Label</Label>
                <Input value={field.label || ''} onChange={e => updateField(field.id, { label: e.target.value })} className="mt-1 bg-background text-[12px] h-8" />
              </div>
              <div>
                <Label className="text-[11px]">Type</Label>
                <Select value={field.field_type || 'string'} onValueChange={v => updateField(field.id, { field_type: v })}>
                  <SelectTrigger className="mt-1 bg-background h-8 text-[12px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['string', 'number', 'boolean', 'date'].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[11px]">LeadByte Field</Label>
                <Input value={field.leadbyte_field_name || ''} onChange={e => updateField(field.id, { leadbyte_field_name: e.target.value })} className="mt-1 bg-background text-[12px] h-8" />
              </div>
              <div className="flex items-end gap-2 pb-0.5">
                <Switch checked={field.include_in_leadbyte} onCheckedChange={v => updateField(field.id, { include_in_leadbyte: v })} />
                <Label className="text-[11px]">Send to LB</Label>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}