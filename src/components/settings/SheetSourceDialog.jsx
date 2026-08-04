import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Loader2, Sparkles, Check, ArrowLeft, FileSpreadsheet } from 'lucide-react';
import { toast } from 'sonner';
import { CORE_LEAD_FIELDS, IGNORE } from '@/components/settings/leadSourceFields';
import { SHEET_PURPOSES, MATCH_FIELDS, purposeMeta } from '@/components/settings/dataSourcePurposes';
import MappingReviewTable from '@/components/settings/MappingReviewTable';

// Extract a spreadsheet ID from a full Google Sheets URL or return the raw ID.
function extractSheetId(input) {
  if (!input) return '';
  const m = String(input).match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return m ? m[1] : String(input).trim();
}

const SCHEDULES = [
  { value: '15m', label: 'Every 15 minutes' },
  { value: '1h', label: 'Hourly' },
  { value: '6h', label: 'Every 6 hours' },
  { value: 'daily', label: 'Daily' },
];

const NONE = '__none__';

const blankForm = {
  name: '', purpose: 'leads', sheetInput: '', sheet_id: '', spreadsheet_name: '', worksheet: '',
  link_type: 'none', supplier_name: '', buyer_code: '', campaign_id: '',
  sync_interval: '1h', dedupe_column: '', match_field: 'email', match_column: '',
  date_column: '', enabled: true,
};

// A labelled column picker that always offers "not set".
function ColumnSelect({ label, help, value, onChange, columns }) {
  return (
    <div>
      <Label className="text-[12px]">{label}</Label>
      <Select value={value || NONE} onValueChange={(v) => onChange(v === NONE ? '' : v)}>
        <SelectTrigger className="mt-1 bg-background text-[13px]"><SelectValue placeholder="Not set" /></SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>Not set</SelectItem>
          {columns.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
        </SelectContent>
      </Select>
      {help && <p className="text-[11px] text-muted-foreground mt-1">{help}</p>}
    </div>
  );
}

export default function SheetSourceDialog({ open, onOpenChange, source, onSaved }) {
  const editing = !!source;
  const [step, setStep] = useState('purpose'); // purpose | source | columns | mapping
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(blankForm);
  const [cfg, setCfg] = useState({});
  const [columns, setColumns] = useState([]);
  const [included, setIncluded] = useState([]);
  const [sample, setSample] = useState({});
  const [mapping, setMapping] = useState({});
  const [driveFiles, setDriveFiles] = useState(null); // null = not loaded, [] = none or no scope
  const [scopeMissing, setScopeMissing] = useState(false);
  const [worksheets, setWorksheets] = useState([]);

  const { data: suppliers = [] } = useQuery({ queryKey: ['suppliers'], queryFn: () => base44.entities.Supplier.list('-created_date', 200) });
  const { data: buyers = [] } = useQuery({ queryKey: ['buyers-for-sources'], queryFn: () => base44.entities.Buyer.list('company_name', 200) });
  const { data: campaigns = [] } = useQuery({ queryKey: ['campaigns'], queryFn: () => base44.entities.Campaign.list('-created_date', 200) });
  const { data: customFields = [] } = useQuery({ queryKey: ['custom-fields'], queryFn: () => base44.entities.CustomField.list('sort_order') });

  const meta = purposeMeta(SHEET_PURPOSES, form.purpose);
  const createsLeads = form.purpose === 'leads' || (form.purpose === 'inbound_calls' && cfg.create_leads === true);
  const targetFields = [...CORE_LEAD_FIELDS, 'disposition', 'buyer_conversion', 'buyer_returned',
    ...customFields.map((f) => f.field_name).filter((n) => n && !CORE_LEAD_FIELDS.includes(n))];

  useEffect(() => {
    if (!open) return;
    if (source) {
      setForm({
        name: source.name || '', purpose: source.purpose || 'leads',
        sheetInput: source.sheet_id || '', sheet_id: source.sheet_id || '',
        spreadsheet_name: source.spreadsheet_name || '', worksheet: source.worksheet || '',
        link_type: source.link_type || 'none', supplier_name: source.supplier_name || '',
        buyer_code: source.buyer_code || '', campaign_id: source.campaign_id || '',
        sync_interval: source.sync_interval || '1h', dedupe_column: source.dedupe_column || '',
        match_field: source.match_field || 'email', match_column: source.match_column || '',
        date_column: source.date_column || '', enabled: source.enabled ?? true,
      });
      let savedMapping = {};
      try { savedMapping = JSON.parse(source.mapping || '{}'); } catch { savedMapping = {}; }
      setMapping(savedMapping);
      setColumns(Object.keys(savedMapping));
      try { setCfg(JSON.parse(source.purpose_config || '{}')); } catch { setCfg({}); }
      try { setIncluded(JSON.parse(source.included_columns || '[]')); } catch { setIncluded([]); }
    } else {
      setForm(blankForm); setCfg({}); setMapping({}); setColumns([]); setIncluded([]); setSample({});
    }
    setWorksheets([]);
    setStep('purpose');
  }, [open, source]);

  // Load the operator's spreadsheets once, so the sheet is picked rather than pasted.
  useEffect(() => {
    if (!open || driveFiles !== null) return;
    (async () => {
      try {
        const res = await base44.functions.invoke('syncGoogleSheets', { list_spreadsheets: true });
        setDriveFiles(res.data?.files || []);
        setScopeMissing(!!res.data?.scope_missing);
      } catch {
        setDriveFiles([]); setScopeMissing(true);
      }
    })();
  }, [open, driveFiles]);

  const loadWorksheets = async (sheetId) => {
    if (!sheetId) return;
    setBusy(true);
    try {
      const res = await base44.functions.invoke('syncGoogleSheets', { list_worksheets: true, sheet_id: sheetId });
      if (res.data?.error) { toast.error(res.data.error); setBusy(false); return; }
      const tabs = res.data?.worksheets || [];
      setWorksheets(tabs);
      setForm((p) => ({
        ...p,
        spreadsheet_name: res.data?.title || p.spreadsheet_name,
        worksheet: p.worksheet && tabs.includes(p.worksheet) ? p.worksheet : (tabs[0] || 'Sheet1'),
        name: p.name || res.data?.title || '',
      }));
    } catch {
      toast.error('Could not open that spreadsheet, check it is shared with the connected Google account');
    }
    setBusy(false);
  };

  const pickSpreadsheet = async (fileId) => {
    const file = (driveFiles || []).find((f) => f.id === fileId);
    setForm((p) => ({ ...p, sheet_id: fileId, sheetInput: fileId, spreadsheet_name: file?.name || '' }));
    await loadWorksheets(fileId);
  };

  const usePastedLink = async () => {
    const id = extractSheetId(form.sheetInput);
    if (!id) { toast.error('Paste a Google Sheets link or ID'); return; }
    setForm((p) => ({ ...p, sheet_id: id }));
    await loadWorksheets(id);
  };

  const loadColumns = async () => {
    const sheetId = form.sheet_id || extractSheetId(form.sheetInput);
    if (!sheetId) { toast.error('Pick a spreadsheet first'); return; }
    setBusy(true);
    try {
      const res = await base44.functions.invoke('syncGoogleSheets', {
        preview: true, sheet_id: sheetId, worksheet: form.worksheet,
      });
      if (res.data?.error) { toast.error(res.data.error); setBusy(false); return; }
      const cols = res.data?.columns || [];
      if (!cols.length) { toast.error('No columns found in that tab'); setBusy(false); return; }
      setColumns(cols);
      setSample(res.data?.sample || {});
      if (!included.length) setIncluded(cols);

      // Guess the obvious ones so the operator confirms rather than types.
      const lower = (c) => String(c).toLowerCase();
      const find = (...needles) => cols.find((c) => needles.some((n) => lower(c).includes(n))) || '';
      setForm((p) => ({
        ...p,
        match_column: p.match_column || find(p.match_field === 'mobile' ? 'phone' : p.match_field, 'phone', 'email'),
        date_column: p.date_column || find('timestamp', 'date', 'time'),
      }));
      setCfg((p) => ({
        ...p,
        disposition_column: p.disposition_column || find('dispo', 'disposition', 'status'),
        converted_column: p.converted_column || find('converted', 'conversion'),
        returned_column: p.returned_column || find('returned', 'return'),
        revenue_column: p.revenue_column || find('revenue', 'payout', 'price'),
        notes_column: p.notes_column || find('note'),
        spend_column: p.spend_column || find('total cost', 'cost', 'spend'),
      }));
      setStep('columns');
    } catch {
      toast.error('Could not read the sheet, check sharing and the tab name');
    }
    setBusy(false);
  };

  const goFromColumns = async () => {
    if (meta.needsMatch && !form.match_column) { toast.error('Pick the column that identifies the lead'); return; }
    if (form.purpose === 'cost' && !cfg.spend_column) { toast.error('Pick the column holding the spend amount'); return; }
    if (form.purpose === 'cost' && !form.date_column) { toast.error('Pick the column holding the date'); return; }
    if (createsLeads) {
      // Auto-map the included columns before the review table is shown.
      if (Object.keys(mapping).length === 0) {
        setBusy(true);
        try {
          const ai = await base44.integrations.Core.InvokeLLM({
            prompt: `Map each Google Sheet column to the best matching target lead field. Columns: ${JSON.stringify(included)}. Target fields: ${JSON.stringify(targetFields)}. If a column has no good match, map it to "${IGNORE}". Return a JSON object of column -> target field.`,
            response_json_schema: { type: 'object', properties: { mapping: { type: 'object', additionalProperties: { type: 'string' } } } },
          });
          const auto = ai?.mapping || {};
          const finalMap = {};
          included.forEach((c) => { finalMap[c] = targetFields.includes(auto[c]) ? auto[c] : IGNORE; });
          setMapping(finalMap);
        } catch {
          const finalMap = {};
          included.forEach((c) => { finalMap[c] = IGNORE; });
          setMapping(finalMap);
        }
        setBusy(false);
      }
      setStep('mapping');
      return;
    }
    await save();
  };

  const save = async () => {
    if (!form.name.trim()) { toast.error('Give this source a name'); return; }
    if (form.purpose === 'cost' && !form.supplier_name) { toast.error('A cost sheet needs a supplier to attribute the spend to'); return; }
    if (form.purpose === 'leads' && !form.supplier_name) { toast.error('A lead sheet needs a supplier to attribute leads to'); return; }
    setBusy(true);
    try {
      const payload = {
        name: form.name.trim(), kind: 'google_sheets', enabled: form.enabled,
        purpose: form.purpose,
        sheet_id: form.sheet_id || extractSheetId(form.sheetInput),
        spreadsheet_name: form.spreadsheet_name,
        worksheet: form.worksheet || 'Sheet1',
        link_type: form.link_type,
        supplier_name: form.link_type === 'supplier' ? form.supplier_name : (form.purpose === 'leads' || form.purpose === 'cost' ? form.supplier_name : ''),
        buyer_code: form.link_type === 'buyer' ? form.buyer_code : '',
        campaign_id: form.campaign_id,
        sync_interval: form.sync_interval,
        dedupe_column: form.dedupe_column,
        match_field: form.match_field,
        match_column: form.match_column,
        date_column: form.date_column,
        included_columns: JSON.stringify(included),
        purpose_config: JSON.stringify(cfg),
        mapping: JSON.stringify(mapping),
      };
      let saved;
      if (editing) saved = await base44.entities.LeadSource.update(source.id, payload);
      else saved = await base44.entities.LeadSource.create(payload);

      // Only a sheet that reaches processLead needs an ingestion key.
      if (createsLeads) {
        await base44.functions.invoke('provisionLeadSource', { source_id: saved.id || source?.id });
      }
      toast.success(editing ? 'Source updated' : 'Sheet connected');
      onSaved?.();
      onOpenChange(false);
    } catch {
      toast.error('Could not save this source');
    }
    setBusy(false);
  };

  const toggleColumn = (col) => {
    setIncluded((prev) => (prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col]));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-popover border-border max-w-[680px] max-h-[86vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-primary" />
            {editing ? 'Edit' : 'Connect a'} Google Sheet
          </DialogTitle>
        </DialogHeader>

        {/* Step 1: what is this sheet for */}
        {step === 'purpose' && (
          <div className="space-y-4">
            <div>
              <Label className="text-[12px]">What is this sheet for? *</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                {SHEET_PURPOSES.map((p) => {
                  const active = form.purpose === p.value;
                  return (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, purpose: p.value }))}
                      className={`text-left rounded-lg border p-3 transition-colors ${active ? 'border-primary bg-primary/10' : 'border-border bg-card hover:bg-accent'}`}
                    >
                      <div className={`text-[13px] font-medium ${active ? 'text-primary' : 'text-foreground'}`}>{p.label}</div>
                      <div className="text-[11px] text-muted-foreground mt-1 leading-relaxed">{p.desc}</div>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="rounded-lg border border-border bg-card p-3">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Writes to</div>
              <div className="text-[13px] text-foreground mt-1">{meta.writesTo}</div>
            </div>
            <div>
              <Label className="text-[12px]">Name *</Label>
              <Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="e.g. AG1 Buyer Feedback" className="mt-1 bg-background" />
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={() => setStep('source')} disabled={!form.name.trim()}>Next</Button>
            </DialogFooter>
          </div>
        )}

        {/* Step 2: which spreadsheet, which tab, who it belongs to */}
        {step === 'source' && (
          <div className="space-y-4">
            <div>
              <Label className="text-[12px]">Spreadsheet *</Label>
              {driveFiles === null ? (
                <div className="mt-1 text-[12px] text-muted-foreground inline-flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Reading your Google Drive
                </div>
              ) : driveFiles.length > 0 ? (
                <SearchableSelect
                  value={form.sheet_id}
                  onValueChange={pickSpreadsheet}
                  className="mt-1 bg-background"
                  placeholder="Pick a spreadsheet"
                  options={driveFiles.map((f) => ({ value: f.id, label: f.name }))}
                />
              ) : (
                <div className="mt-1 space-y-2">
                  {scopeMissing && (
                    <p className="text-[11px] text-muted-foreground">
                      The connected Google account has spreadsheet access but not Drive listing access, so the picker is empty. Paste a link instead, or ask for the Drive scope to be added to the connector.
                    </p>
                  )}
                  <div className="flex gap-2">
                    <Input value={form.sheetInput} onChange={(e) => setForm((p) => ({ ...p, sheetInput: e.target.value }))} placeholder="https://docs.google.com/spreadsheets/d/..." className="bg-background font-mono text-[12px]" />
                    <Button size="sm" variant="outline" onClick={usePastedLink} disabled={busy}>Use link</Button>
                  </div>
                </div>
              )}
              {form.spreadsheet_name && (
                <p className="text-[11px] text-muted-foreground mt-1">Selected: {form.spreadsheet_name}</p>
              )}
            </div>

            {worksheets.length > 0 && (
              <div>
                <Label className="text-[12px]">Tab *</Label>
                <Select value={form.worksheet} onValueChange={(v) => setForm((p) => ({ ...p, worksheet: v }))}>
                  <SelectTrigger className="mt-1 bg-background text-[13px]"><SelectValue placeholder="Pick a tab" /></SelectTrigger>
                  <SelectContent>{worksheets.map((w) => <SelectItem key={w} value={w}>{w}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[12px]">This sheet belongs to</Label>
                <Select value={form.link_type} onValueChange={(v) => setForm((p) => ({ ...p, link_type: v }))}>
                  <SelectTrigger className="mt-1 bg-background text-[13px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nobody in particular</SelectItem>
                    <SelectItem value="buyer">A buyer</SelectItem>
                    <SelectItem value="supplier">A supplier</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[12px]">Sync schedule</Label>
                <Select value={form.sync_interval} onValueChange={(v) => setForm((p) => ({ ...p, sync_interval: v }))}>
                  <SelectTrigger className="mt-1 bg-background text-[13px]"><SelectValue /></SelectTrigger>
                  <SelectContent>{SCHEDULES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            {form.link_type === 'buyer' && (
              <div>
                <Label className="text-[12px]">Buyer</Label>
                <SearchableSelect
                  value={form.buyer_code}
                  onValueChange={(v) => setForm((p) => ({ ...p, buyer_code: v }))}
                  className="mt-1 bg-background"
                  placeholder="Select buyer"
                  options={buyers.filter((b) => b.buyer_code).map((b) => ({ value: b.buyer_code, label: `${b.company_name || b.name} (${b.buyer_code})` }))}
                />
              </div>
            )}

            {(form.link_type === 'supplier' || form.purpose === 'leads' || form.purpose === 'cost') && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-[12px]">Supplier {(form.purpose === 'leads' || form.purpose === 'cost') ? '*' : ''}</Label>
                  <SearchableSelect
                    value={form.supplier_name}
                    onValueChange={(v) => setForm((p) => ({ ...p, supplier_name: v }))}
                    className="mt-1 bg-background"
                    placeholder="Select supplier"
                    options={suppliers.map((s) => ({ value: s.name, label: s.name }))}
                  />
                </div>
                <div>
                  <Label className="text-[12px]">Campaign</Label>
                  <SearchableSelect
                    value={form.campaign_id}
                    onValueChange={(v) => setForm((p) => ({ ...p, campaign_id: v }))}
                    className="mt-1 bg-background"
                    placeholder="Optional"
                    options={[{ value: '', label: 'None' }, ...campaigns.map((c) => ({ value: c.id, label: c.name }))]}
                  />
                </div>
              </div>
            )}

            <DialogFooter>
              <Button variant="ghost" onClick={() => setStep('purpose')} className="gap-1.5"><ArrowLeft className="w-3.5 h-3.5" /> Back</Button>
              <Button onClick={loadColumns} disabled={busy || !(form.sheet_id || form.sheetInput)} className="gap-1.5">
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />} Read columns
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* Step 3: which columns, and what each key column means */}
        {step === 'columns' && (
          <div className="space-y-5">
            <div>
              <div className="flex items-center justify-between">
                <Label className="text-[12px]">Columns to read</Label>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => setIncluded(columns)}>All</Button>
                  <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => setIncluded([])}>None</Button>
                </div>
              </div>
              <div className="mt-2 rounded-lg border border-border bg-card p-3 max-h-[180px] overflow-y-auto">
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                  {columns.map((c) => (
                    <label key={c} className="flex items-center gap-2 text-[12px] text-foreground cursor-pointer">
                      <input
                        type="checkbox"
                        checked={included.includes(c)}
                        onChange={() => toggleColumn(c)}
                        className="accent-primary"
                      />
                      <span className="truncate" title={c}>{c}</span>
                    </label>
                  ))}
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">{included.length} of {columns.length} columns included.</p>
            </div>

            {meta.needsMatch && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-[12px]">Match leads on *</Label>
                  <Select value={form.match_field} onValueChange={(v) => setForm((p) => ({ ...p, match_field: v }))}>
                    <SelectTrigger className="mt-1 bg-background text-[13px]"><SelectValue /></SelectTrigger>
                    <SelectContent>{MATCH_FIELDS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <ColumnSelect
                  label="Column holding it *"
                  value={form.match_column}
                  onChange={(v) => setForm((p) => ({ ...p, match_column: v }))}
                  columns={columns}
                />
              </div>
            )}

            <ColumnSelect
              label={form.purpose === 'cost' ? 'Date column *' : 'Date column'}
              help="Used for bucketing and for reporting in America/Regina."
              value={form.date_column}
              onChange={(v) => setForm((p) => ({ ...p, date_column: v }))}
              columns={columns}
            />

            {form.purpose === 'inbound_calls' && (
              <div className="flex items-center justify-between rounded-lg border border-border bg-card p-3">
                <div className="min-w-0 pr-3">
                  <div className="text-[13px] text-foreground">Create leads from these rows</div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    On: every row is ingested as a new lead through the pipeline. Off: rows are recorded as call outcomes against leads that already exist.
                  </p>
                </div>
                <Switch checked={cfg.create_leads === true} onCheckedChange={(v) => setCfg((p) => ({ ...p, create_leads: v }))} />
              </div>
            )}

            {(form.purpose === 'buyer_feedback' || form.purpose === 'inbound_calls') && cfg.create_leads !== true && (
              <div className="grid grid-cols-2 gap-3">
                <ColumnSelect label="Disposition column" value={cfg.disposition_column} onChange={(v) => setCfg((p) => ({ ...p, disposition_column: v }))} columns={columns} />
                <ColumnSelect label="Converted column" value={cfg.converted_column} onChange={(v) => setCfg((p) => ({ ...p, converted_column: v }))} columns={columns} />
                <ColumnSelect label="Returned column" value={cfg.returned_column} onChange={(v) => setCfg((p) => ({ ...p, returned_column: v }))} columns={columns} />
                <ColumnSelect label="Revenue or payout column" value={cfg.revenue_column} onChange={(v) => setCfg((p) => ({ ...p, revenue_column: v }))} columns={columns} />
                <ColumnSelect label="Return reason column" value={cfg.return_reason_column} onChange={(v) => setCfg((p) => ({ ...p, return_reason_column: v }))} columns={columns} />
                <ColumnSelect label="Notes column" value={cfg.notes_column} onChange={(v) => setCfg((p) => ({ ...p, notes_column: v }))} columns={columns} />
              </div>
            )}

            {form.purpose === 'disqualified' && (
              <div className="space-y-3">
                <ColumnSelect label="Reason column" value={cfg.reason_column} onChange={(v) => setCfg((p) => ({ ...p, reason_column: v }))} columns={columns} />
                <div className="flex items-center justify-between rounded-lg border border-border bg-card p-3">
                  <div className="min-w-0 pr-3">
                    <div className="text-[13px] text-foreground">Also set the lead status to Disqualified</div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Off by default. The feedback record is always written; this rewrites the lead's own lifecycle status as well.
                    </p>
                  </div>
                  <Switch checked={cfg.set_status === true} onCheckedChange={(v) => setCfg((p) => ({ ...p, set_status: v }))} />
                </div>
              </div>
            )}

            {form.purpose === 'cost' && (
              <div className="grid grid-cols-2 gap-3">
                <ColumnSelect label="Spend column *" value={cfg.spend_column} onChange={(v) => setCfg((p) => ({ ...p, spend_column: v }))} columns={columns} />
                <ColumnSelect label="Leads column" value={cfg.leads_column} onChange={(v) => setCfg((p) => ({ ...p, leads_column: v }))} columns={columns} />
                <ColumnSelect label="Clicks column" value={cfg.clicks_column} onChange={(v) => setCfg((p) => ({ ...p, clicks_column: v }))} columns={columns} />
                <ColumnSelect label="Impressions column" value={cfg.impressions_column} onChange={(v) => setCfg((p) => ({ ...p, impressions_column: v }))} columns={columns} />
                <div>
                  <Label className="text-[12px]">Currency</Label>
                  <Input value={cfg.currency || 'USD'} onChange={(e) => setCfg((p) => ({ ...p, currency: e.target.value }))} className="mt-1 bg-background" />
                </div>
                <div>
                  <Label className="text-[12px]">Vertical</Label>
                  <Input value={cfg.vertical || ''} onChange={(e) => setCfg((p) => ({ ...p, vertical: e.target.value }))} placeholder="Optional, e.g. MVA" className="mt-1 bg-background" />
                </div>
              </div>
            )}

            <ColumnSelect
              label="De-dupe key column"
              help="A unique column such as email or a row ID stops the same row being processed twice. Without one, the whole row is hashed."
              value={form.dedupe_column}
              onChange={(v) => setForm((p) => ({ ...p, dedupe_column: v }))}
              columns={columns}
            />

            <DialogFooter>
              <Button variant="ghost" onClick={() => setStep('source')} className="gap-1.5"><ArrowLeft className="w-3.5 h-3.5" /> Back</Button>
              <Button onClick={goFromColumns} disabled={busy} className="gap-1.5">
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                {createsLeads ? 'Next, map fields' : (editing ? 'Save source' : 'Connect sheet')}
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* Step 4: field mapping, only when rows become leads */}
        {step === 'mapping' && (
          <div className="space-y-4">
            <div className="text-[13px] text-foreground font-medium">Review column mapping</div>
            <MappingReviewTable columns={included} sample={sample} mapping={mapping} setMapping={setMapping} targetFields={targetFields} />
            <DialogFooter>
              <Button variant="ghost" onClick={() => setStep('columns')} className="gap-1.5"><ArrowLeft className="w-3.5 h-3.5" /> Back</Button>
              <Button onClick={save} disabled={busy} className="gap-1.5">
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                {editing ? 'Save source' : 'Connect sheet'}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
