import React from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Plus, Trash2 } from 'lucide-react';

function parseMap(v) {
  try {
    const p = JSON.parse(v || '{}');
    return (p && typeof p === 'object' && !Array.isArray(p)) ? p : {};
  } catch { return {}; }
}

// Per-trigger custom_data overrides for a CAPI connector.
// value: JSON string of { trigger_key: { field_name: value, ... } }
// selectedTriggers: array of { value: 'on_received', label: 'Qualified' } — only these are shown.
export default function TriggerDataOverrides({ value, onChange, selectedTriggers }) {
  const map = parseMap(value);

  const setTriggerFields = (trigger, entries) => {
    const next = { ...map, [trigger]: Object.fromEntries(entries) };
    onChange(JSON.stringify(next));
  };

  const setField = (trigger, idx, key, val) => {
    const entries = Object.entries(map[trigger] || {});
    entries[idx] = [key, val];
    setTriggerFields(trigger, entries);
  };

  const addField = (trigger) => {
    const entries = Object.entries(map[trigger] || {});
    entries.push(['', '']);
    setTriggerFields(trigger, entries);
  };

  const removeField = (trigger, idx) => {
    const entries = Object.entries(map[trigger] || {});
    entries.splice(idx, 1);
    setTriggerFields(trigger, entries);
  };

  const clearTrigger = (trigger) => {
    const next = { ...map };
    delete next[trigger];
    onChange(JSON.stringify(next));
  };

  if (!selectedTriggers || selectedTriggers.length === 0) {
    return <p className="text-[11px] text-muted-foreground">Select at least one trigger above to configure per-trigger custom_data values.</p>;
  }

  return (
    <div className="space-y-3">
      {selectedTriggers.map(({ value: trig, label }) => {
        const entries = Object.entries(map[trig] || {});
        return (
          <div key={trig} className="border border-border rounded-lg p-3 bg-background/40">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[12px] font-semibold text-primary">{label}</span>
              {entries.length > 0 && (
                <Button size="sm" variant="ghost" onClick={() => clearTrigger(trig)} className="h-6 px-2 text-[10px] text-muted-foreground">Clear</Button>
              )}
            </div>
            {entries.length === 0 && <p className="text-[11px] text-muted-foreground mb-2">No overrides — uses the template's custom_data as-is.</p>}
            <div className="space-y-2">
              {entries.map(([k, v], idx) => (
                <div key={idx} className="grid grid-cols-[1fr_1.4fr_36px] gap-2 items-center">
                  <Input value={k} onChange={e => setField(trig, idx, e.target.value, v)} placeholder="field e.g. qualification_status" className="bg-background font-mono text-[11px] h-8" />
                  <Input value={v} onChange={e => setField(trig, idx, k, e.target.value)} placeholder="value e.g. Disqualified Lead (or {{conv_value}})" className="bg-background font-mono text-[11px] h-8" />
                  <Button variant="ghost" size="sm" onClick={() => removeField(trig, idx)} className="h-8 w-8 p-0 text-destructive"><Trash2 className="w-3 h-3" /></Button>
                </div>
              ))}
            </div>
            <Button size="sm" variant="outline" onClick={() => addField(trig)} className="gap-1.5 mt-2 h-7"><Plus className="w-3 h-3" /> Add field</Button>
          </div>
        );
      })}
    </div>
  );
}