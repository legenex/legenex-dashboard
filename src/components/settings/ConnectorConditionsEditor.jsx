import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Plus, Trash2 } from 'lucide-react';

const OPERATOR_OPTIONS = [
  { value: 'equals', label: 'equals' },
  { value: 'not_equals', label: 'not equals' },
  { value: 'contains', label: 'contains' },
  { value: 'not_contains', label: 'not contains' },
  { value: 'starts_with', label: 'starts with' },
  { value: 'ends_with', label: 'ends with' },
  { value: 'is_empty', label: 'is blank' },
  { value: 'is_not_empty', label: 'is not blank' },
  { value: 'gt', label: 'greater than' },
  { value: 'lt', label: 'less than' },
];

function parseJsonArray(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  try { const p = JSON.parse(val); return Array.isArray(p) ? p : []; } catch { return []; }
}

export default function ConnectorConditionsEditor({ value, onChange, fieldOptions = [] }) {
  const conditions = parseJsonArray(value);

  const update = (i, field, val) => {
    const next = conditions.map((c, idx) => idx === i ? { ...c, [field]: val } : c);
    onChange(JSON.stringify(next));
  };
  const add = () => onChange(JSON.stringify([...conditions, { field: '', operator: 'equals', value: '' }]));
  const remove = (i) => onChange(JSON.stringify(conditions.filter((_, idx) => idx !== i)));

  return (
    <div className="space-y-2">
      {conditions.map((cond, i) => (
        <div key={i} className="grid grid-cols-[1fr_130px_1fr_36px] gap-2 items-center">
          <Input
            list="condition-fields"
            value={cond.field || ''}
            onChange={e => update(i, 'field', e.target.value)}
            placeholder="field e.g. accident_date_2"
            className="bg-background font-mono text-[12px] h-9"
          />
          <select
            value={cond.operator || 'equals'}
            onChange={e => update(i, 'operator', e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-2 text-[12px]"
          >
            {OPERATOR_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <Input
            value={cond.value || ''}
            onChange={e => update(i, 'value', e.target.value)}
            placeholder="value e.g. 2_years"
            className="bg-background font-mono text-[12px] h-9"
            disabled={cond.operator === 'is_empty' || cond.operator === 'is_not_empty'}
          />
          <Button variant="ghost" size="sm" onClick={() => remove(i)} className="h-9 w-9 p-0 text-destructive">
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      ))}
      <datalist id="condition-fields">
        {fieldOptions.map(f => <option key={f} value={f} />)}
      </datalist>
      <Button size="sm" variant="outline" onClick={add} className="gap-1.5">
        <Plus className="w-3.5 h-3.5" /> Add Condition
      </Button>
    </div>
  );
}