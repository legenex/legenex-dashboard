import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { ChevronDown } from 'lucide-react';

function parseMap(v) {
  try {
    const p = JSON.parse(v || '{}');
    return (p && typeof p === 'object' && !Array.isArray(p)) ? p : {};
  } catch { return {}; }
}

// Standard Facebook CAPI custom_data fields for lead events. Each trigger gets
// its own collapsible dropdown so the values stay visible but the list stays compact.
const STANDARD_FIELDS = [
  { key: 'content_name', label: 'Content Name', placeholder: 'Check A Case Lead' },
  { key: 'content_category', label: 'Content Category', placeholder: 'Lead Generation' },
  { key: 'vertical', label: 'Vertical', placeholder: 'Legal' },
  { key: 'brand', label: 'Brand', placeholder: 'Check A Case' },
  { key: 'funnel_name', label: 'Funnel Name', placeholder: 'Check A Case Survey' },
  { key: 'qualification_status', label: 'Qualification Status', placeholder: 'Qualified Lead' },
  { key: 'event_category', label: 'Event Category', placeholder: 'Lead' },
  { key: 'lead_event_type', label: 'Lead Event Type', placeholder: 'Lead' },
  { key: 'value', label: 'Value', placeholder: '' },
];

// Hint shown in the Value field placeholder per trigger (only when empty).
const VALUE_HINT = {
  on_received: '{{conv_value}}',
  on_sold: '{{conv_value}}',
  on_dq: '0.00',
};

// Per-trigger custom_data overrides for a CAPI connector.
// value: JSON string of { trigger_key: { field_name: value, ... } }
// selectedTriggers: array of { value: 'on_received', label: 'Qualified' } — only these are shown.
export default function TriggerDataOverrides({ value, onChange, selectedTriggers }) {
  const map = parseMap(value);

  const setField = (trigger, key, val) => {
    const next = { ...map, [trigger]: { ...(map[trigger] || {}), [key]: val } };
    onChange(JSON.stringify(next));
  };

  if (!selectedTriggers || selectedTriggers.length === 0) {
    return <p className="text-[11px] text-muted-foreground">Select at least one trigger above to configure per-trigger custom_data values.</p>;
  }

  return (
    <div className="space-y-2">
      {selectedTriggers.map(({ value: trig, label }) => {
        const trigMap = map[trig] || {};
        const valueHint = VALUE_HINT[trig];
        return (
          <Collapsible key={trig} className="border border-border rounded-lg bg-background/40">
            <CollapsibleTrigger className="w-full flex items-center justify-between p-3 hover:bg-accent/40">
              <span className="text-[12px] font-semibold text-primary">{label}</span>
              <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform" />
            </CollapsibleTrigger>
            <CollapsibleContent className="p-3 pt-0">
              {valueHint && (
                <div className="text-[10px] text-muted-foreground mb-2">value hint: <code className="text-primary">{valueHint}</code></div>
              )}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-x-3 gap-y-2">
                {STANDARD_FIELDS.map(f => (
                  <div key={f.key}>
                    <Label className="text-[10px] text-muted-foreground">{f.label}</Label>
                    <Input
                      value={trigMap[f.key] ?? ''}
                      onChange={e => setField(trig, f.key, e.target.value)}
                      placeholder={f.key === 'value' ? (valueHint || f.placeholder) : f.placeholder}
                      className="bg-background font-mono text-[11px] h-8 mt-0.5"
                    />
                  </div>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        );
      })}
    </div>
  );
}