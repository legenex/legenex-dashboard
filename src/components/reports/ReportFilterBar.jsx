import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Plus, X, Filter } from 'lucide-react';

const OPTIONAL_FILTERS = [
  { key: 'utm_source', label: 'UTM Source' },
  { key: 'accident_date', label: 'Accident Date' },
  { key: 'state', label: 'State' },
];

// Report-level filter bar. value = { date_from, date_to, campaign, vertical, supplier, buyer, brand, state, utm_source, accident_date, ...custom }
export default function ReportFilterBar({ value, onChange, options }) {
  const { campaigns = [], verticals = [], suppliers = [], buyers = [], brands = [] } = options || {};
  const [extra, setExtra] = useState(
    Object.keys(value || {}).filter(k => OPTIONAL_FILTERS.some(f => f.key === k) && value[k])
  );

  const set = (k, v) => onChange({ ...value, [k]: v === 'all' ? '' : v });
  const addExtra = (k) => { if (!extra.includes(k)) setExtra([...extra, k]); };
  const removeExtra = (k) => { setExtra(extra.filter(x => x !== k)); set(k, ''); };

  const Sel = ({ k, ph, items }) => (
    <Select value={value[k] || 'all'} onValueChange={(v) => set(k, v)}>
      <SelectTrigger className="h-8 w-[140px] bg-background text-[12px]"><SelectValue placeholder={ph} /></SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{ph}: All</SelectItem>
        {items.map(it => <SelectItem key={it.value} value={it.value}>{it.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );

  return (
    <div className="flex flex-wrap items-center gap-2 mb-5 px-4 py-3 rounded-xl border border-border bg-card shadow-[0_12px_32px_-16px_rgba(0,0,0,0.4)]">
      <Filter className="w-4 h-4 text-muted-foreground/70" />
      <Input type="date" value={value.date_from || ''} onChange={e => set('date_from', e.target.value)} className="h-8 w-[140px] bg-background text-[12px]" />
      <span className="text-muted-foreground text-[12px]">to</span>
      <Input type="date" value={value.date_to || ''} onChange={e => set('date_to', e.target.value)} className="h-8 w-[140px] bg-background text-[12px]" />

      <Sel k="campaign" ph="Campaign" items={campaigns.map(c => ({ value: c.name, label: c.name }))} />
      <Sel k="vertical" ph="Vertical" items={verticals.map(v => ({ value: v.code, label: v.name }))} />
      <Sel k="supplier_name" ph="Supplier" items={suppliers.map(s => ({ value: s.name, label: s.name }))} />
      <Sel k="buyer_id" ph="Buyer" items={buyers.map(b => ({ value: b.company_name, label: b.company_name }))} />
      <Sel k="brand" ph="Brand" items={brands.map(b => ({ value: b.brand_code, label: b.brand_name }))} />

      {extra.map(k => {
        const f = OPTIONAL_FILTERS.find(x => x.key === k);
        return (
          <div key={k} className="flex items-center gap-1 bg-background border border-border rounded-md pl-2 h-8">
            <span className="text-[11px] text-muted-foreground">{f.label}</span>
            <Input value={value[k] || ''} onChange={e => set(k, e.target.value)} className="h-6 w-[110px] border-0 bg-transparent text-[12px] px-1" placeholder="value" />
            <button onClick={() => removeExtra(k)} className="pr-1.5 text-muted-foreground hover:text-destructive"><X className="w-3 h-3" /></button>
          </div>
        );
      })}

      <Popover>
        <PopoverTrigger asChild>
          <Button size="sm" variant="ghost" className="h-8 gap-1 text-[12px] text-primary hover:text-primary"><Plus className="w-3.5 h-3.5" /> Add Filter</Button>
        </PopoverTrigger>
        <PopoverContent className="w-48 p-1 bg-popover border-border" align="end">
          {OPTIONAL_FILTERS.filter(f => !extra.includes(f.key)).map(f => (
            <button key={f.key} onClick={() => addExtra(f.key)} className="w-full text-left px-2 py-1.5 rounded text-[13px] text-foreground hover:bg-accent/50">{f.label}</button>
          ))}
          {OPTIONAL_FILTERS.every(f => extra.includes(f.key)) && <div className="px-2 py-1.5 text-[12px] text-muted-foreground">All added</div>}
        </PopoverContent>
      </Popover>
    </div>
  );
}