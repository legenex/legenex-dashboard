import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import JsonViewer from '@/components/shared/JsonViewer';
import { testCapiConnector } from '@/functions/testCapiConnector';
import TokenReferencePanel from '@/components/settings/TokenReferencePanel';
import { HighlightedPayloadEditor } from '@/components/settings/HighlightedPayloadEditor';
import { Plus, Save, Trash2, Play, Loader2, Eye, EyeOff, Zap, Globe } from 'lucide-react';
import { toast } from 'sonner';

const TRIGGER_OPTIONS = [
  { value: 'on_received', label: 'On Received' },
  { value: 'on_sold', label: 'On Sold' },
  { value: 'on_unsold', label: 'On Unsold' },
  { value: 'on_dq', label: 'On DQ' },
  { value: 'on_queued', label: 'On Queued' },
];

const KIND_OPTIONS = [
  { value: 'facebook_capi', label: 'Facebook CAPI' },
  { value: 'webhook', label: 'Webhook' },
  { value: 'generic_http', label: 'Generic HTTP' },
];

function parseJsonArray(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  try { const p = JSON.parse(val); return Array.isArray(p) ? p : []; } catch { return []; }
}

const DEFAULT_TEST_PAYLOAD = {
  email: 'test@example.com',
  firstname: 'John',
  lastname: 'Doe',
  phone1: '4249449001',
  ipaddress: '10.10.10.10',
  optinurl: 'https://example.com/landing',
  supplier_brand: 'TestBrand',
  city: 'Los Angeles',
  state: 'CA',
  zip: '90210',
  country: 'USA',
};

const DEFAULT_CAPI_TEMPLATE = JSON.stringify({
  data: [{
    event_name: "Lead",
    event_time: "{{event_time}}",
    action_source: "website",
    event_id: "{{event_id}}",
    event_source_url: "{{optin_url}}",
    user_data: {
      client_user_agent: "{{user_agent}}",
      client_ip_address: "{{ip_address}}",
      fbc: "{{fbc}}",
      fbp: "{{fbp}}",
      em: "{{email}}",
      ph: "{{mobile}}",
      fn: "{{first_name}}",
      ln: "{{last_name}}",
      ct: "{{geoip_city}}",
      st: "{{geoip_state}}",
      zp: "{{zip}}",
      country: "{{geoip_country}}",
      external_id: "{{lead_id}}"
    },
    custom_data: {
      content_name: "Check A Case Lead",
      content_category: "Lead Generation",
      vertical: "Legal",
      brand: "Check A Case",
      funnel_name: "Check A Case Survey",
      qualification_status: "Qualified Lead",
      event_category: "Lead",
      lead_event_type: "Lead",
      value: "{{conv_value}}",
      currency: "USD"
    }
  }]
}, null, 2);

export default function SettingsApiConnectors() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(null);
  const [headerRows, setHeaderRows] = useState([]);
  const [showToken, setShowToken] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [sendingTest, setSendingTest] = useState(false);
  const [testPayloadStr, setTestPayloadStr] = useState(JSON.stringify(DEFAULT_TEST_PAYLOAD, null, 2));

  const { data: connectors = [] } = useQuery({
    queryKey: ['api-connectors'],
    queryFn: () => base44.entities.ApiConnector.list('sort_order'),
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => base44.entities.Supplier.list(),
  });

  const { data: customFields = [] } = useQuery({
    queryKey: ['custom-fields'],
    queryFn: () => base44.entities.CustomField.list(),
  });

  const brandOptions = [...new Set(suppliers.map(s => s.brand).filter(Boolean))];
  const supplierOptions = suppliers.map(s => ({ value: s.name, label: s.name }));
  const supplierTypeOptions = [
    { value: 'Internal', label: 'Internal' },
    { value: 'External', label: 'External' },
    { value: 'Calls', label: 'Calls' },
  ];

  const openCreate = () => {
    setEditing({
      name: '', kind: 'facebook_capi', enabled: true, sort_order: 0,
      filter_brands: '[]', filter_suppliers: '[]', filter_supplier_types: '[]',
      fb_pixel_id: '', fb_access_token: '', fb_test_event_code: '', fb_api_version: 'v21.0',
      lead_event_name: 'Lead', sold_event_name: 'SubmittedApplication', action_source: 'website',
      auto_hash_capi: true,
      target_url: '', http_method: 'POST', content_type: 'application/json',
      headers: '[]', payload_template: DEFAULT_CAPI_TEMPLATE, triggers: '["on_received"]',
    });
    setHeaderRows([]);
    setShowToken(false);
    setTestResult(null);
    setTestPayloadStr(DEFAULT_CAPI_TEMPLATE);
  };

  const openEdit = (conn) => {
    setEditing({ ...conn });
    setHeaderRows(parseJsonArray(conn.headers));
    setShowToken(false);
    setTestResult(null);
    if (conn.kind === 'facebook_capi') {
      const tmpl = (conn.payload_template && conn.payload_template.trim() && conn.payload_template.trim() !== '{}')
        ? conn.payload_template
        : DEFAULT_CAPI_TEMPLATE;
      setTestPayloadStr(tmpl);
    } else {
      setTestPayloadStr(JSON.stringify(DEFAULT_TEST_PAYLOAD, null, 2));
    }
  };

  const saveConnector = async () => {
    const data = { ...editing, headers: JSON.stringify(headerRows) };
    if (editing.id) {
      await base44.entities.ApiConnector.update(editing.id, data);
    } else {
      await base44.entities.ApiConnector.create(data);
    }
    toast.success('Connector saved');
    setEditing(null);
    qc.invalidateQueries({ queryKey: ['api-connectors'] });
  };

  const deleteConnector = async (id) => {
    await base44.entities.ApiConnector.delete(id);
    toast.success('Connector deleted');
    qc.invalidateQueries({ queryKey: ['api-connectors'] });
  };

  const toggleEnabled = async (conn) => {
    await base44.entities.ApiConnector.update(conn.id, { enabled: !conn.enabled });
    qc.invalidateQueries({ queryKey: ['api-connectors'] });
  };

  const sendTestEvent = async () => {
    setSendingTest(true);
    setTestResult(null);
    let parsed;
    try { parsed = JSON.parse(testPayloadStr); } catch {
      toast.error('Invalid JSON in test payload');
      setSendingTest(false);
      return;
    }
    try {
      const resp = await testCapiConnector({ connector_id: editing.id, test_payload: parsed });
      setTestResult(resp.data);
      if (resp.data?.error) toast.error(resp.data.error);
      else toast.success('Test event sent');
    } catch (err) {
      toast.error('Test failed: ' + (err.message || 'unknown error'));
    }
    setSendingTest(false);
  };

  const addHeaderRow = () => setHeaderRows(p => [...p, { key: '', value: '' }]);
  const removeHeaderRow = (i) => setHeaderRows(p => p.filter((_, idx) => idx !== i));
  const updateHeaderRow = (i, field, val) => setHeaderRows(p => p.map((r, idx) => idx === i ? { ...r, [field]: val } : r));

  const setF = (key, val) => setEditing(p => ({ ...p, [key]: val }));

  const toggleArrayValue = (field, value) => {
    const arr = parseJsonArray(editing[field]);
    const next = arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value];
    setF(field, JSON.stringify(next));
  };

  // ── Edit view ──────────────────────────────────────────────────────────
  if (editing) {
    const isCapi = editing.kind === 'facebook_capi';
    const isHttp = editing.kind === 'webhook' || editing.kind === 'generic_http';

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-[15px] font-semibold text-foreground">{editing.id ? 'Edit Connector' : 'New Connector'}</h3>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={saveConnector} disabled={!editing.name} className="gap-1.5"><Save className="w-4 h-4" /> Save</Button>
          </div>
        </div>

        <Card className="bg-card border-border">
          <CardContent className="p-4 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-[12px]">Name *</Label><Input value={editing.name || ''} onChange={e => setF('name', e.target.value)} className="mt-1 bg-background" /></div>
              <div>
                <Label className="text-[12px]">Kind</Label>
                <SearchableSelect
                  value={editing.kind || 'facebook_capi'}
                  onValueChange={v => setF('kind', v)}
                  className="mt-1 bg-background"
                  options={KIND_OPTIONS}
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><Label className="text-[12px]">Sort Order</Label><Input type="number" value={editing.sort_order || 0} onChange={e => setF('sort_order', Number(e.target.value))} className="mt-1 bg-background" /></div>
              <div className="flex items-end pb-2">
                <div className="flex items-center gap-2"><Switch checked={editing.enabled} onCheckedChange={v => setF('enabled', v)} /><Label className="text-[12px]">Enabled</Label></div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Filters */}
        <Card className="bg-card border-border">
          <CardContent className="p-4 space-y-3">
            <div className="text-[13px] font-semibold text-foreground">Filters</div>
            <p className="text-[11px] text-muted-foreground">Empty = match all. A connector fires only when every non-empty filter matches.</p>
            <div>
              <Label className="text-[12px]">Brands</Label>
              <div className="flex flex-wrap gap-2 mt-1">
                {brandOptions.length === 0 && <span className="text-[11px] text-muted-foreground">No brands configured</span>}
                {brandOptions.map(b => {
                  const active = parseJsonArray(editing.filter_brands).includes(b);
                  return (
                    <button key={b} onClick={() => toggleArrayValue('filter_brands', b)}
                      className={`px-2 py-1 rounded-md text-[11px] border transition-colors ${active ? 'bg-primary/20 text-primary border-primary/40' : 'bg-background text-muted-foreground border-border hover:text-foreground'}`}>
                      {b}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <Label className="text-[12px]">Suppliers</Label>
              <div className="flex flex-wrap gap-2 mt-1">
                {supplierOptions.length === 0 && <span className="text-[11px] text-muted-foreground">No suppliers configured</span>}
                {supplierOptions.map(s => {
                  const active = parseJsonArray(editing.filter_suppliers).includes(s.value);
                  return (
                    <button key={s.value} onClick={() => toggleArrayValue('filter_suppliers', s.value)}
                      className={`px-2 py-1 rounded-md text-[11px] border transition-colors ${active ? 'bg-primary/20 text-primary border-primary/40' : 'bg-background text-muted-foreground border-border hover:text-foreground'}`}>
                      {s.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <Label className="text-[12px]">Supplier Types</Label>
              <div className="flex flex-wrap gap-2 mt-1">
                {supplierTypeOptions.map(t => {
                  const active = parseJsonArray(editing.filter_supplier_types).includes(t.value);
                  return (
                    <button key={t.value} onClick={() => toggleArrayValue('filter_supplier_types', t.value)}
                      className={`px-2 py-1 rounded-md text-[11px] border transition-colors ${active ? 'bg-primary/20 text-primary border-primary/40' : 'bg-background text-muted-foreground border-border hover:text-foreground'}`}>
                      {t.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Triggers */}
        <Card className="bg-card border-border">
          <CardContent className="p-4 space-y-3">
            <div className="text-[13px] font-semibold text-foreground">Triggers</div>
            <p className="text-[11px] text-muted-foreground">When should this connector fire?</p>
            <div className="flex flex-wrap gap-2">
              {TRIGGER_OPTIONS.map(t => {
                const active = parseJsonArray(editing.triggers).includes(t.value);
                return (
                  <button key={t.value} onClick={() => toggleArrayValue('triggers', t.value)}
                    className={`px-3 py-1.5 rounded-md text-[12px] border transition-colors ${active ? 'bg-primary/20 text-primary border-primary/40' : 'bg-background text-muted-foreground border-border hover:text-foreground'}`}>
                    {t.label}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Facebook CAPI fields */}
        {isCapi && (
          <Card className="bg-card border-border">
            <CardContent className="p-4 space-y-4">
              <div className="text-[13px] font-semibold text-foreground flex items-center gap-2"><Zap className="w-4 h-4 text-primary" /> Facebook CAPI</div>
              <div><Label className="text-[12px]">Pixel ID</Label><Input value={editing.fb_pixel_id || ''} onChange={e => setF('fb_pixel_id', e.target.value)} className="mt-1 bg-background font-mono text-[12px]" /></div>
              <div>
                <Label className="text-[12px]">Access Token</Label>
                <div className="flex items-center gap-2 mt-1">
                  <Input
                    type={showToken ? 'text' : 'password'}
                    value={editing.fb_access_token || ''}
                    onChange={e => setF('fb_access_token', e.target.value)}
                    className="bg-background font-mono text-[12px] flex-1"
                  />
                  <Button size="sm" variant="ghost" onClick={() => setShowToken(!showToken)} className="h-9 w-9 p-0">
                    {showToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-[12px]">Test Event Code (optional)</Label><Input value={editing.fb_test_event_code || ''} onChange={e => setF('fb_test_event_code', e.target.value)} className="mt-1 bg-background font-mono text-[12px]" /></div>
                <div><Label className="text-[12px]">API Version</Label><Input value={editing.fb_api_version || 'v21.0'} onChange={e => setF('fb_api_version', e.target.value)} className="mt-1 bg-background font-mono text-[12px]" /></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><Label className="text-[12px]">Lead Event Name</Label><Input value={editing.lead_event_name || 'Lead'} onChange={e => setF('lead_event_name', e.target.value)} className="mt-1 bg-background" /></div>
                <div><Label className="text-[12px]">Sold Event Name</Label><Input value={editing.sold_event_name || 'SubmittedApplication'} onChange={e => setF('sold_event_name', e.target.value)} className="mt-1 bg-background" /></div>
                <div><Label className="text-[12px]">Action Source</Label><Input value={editing.action_source || 'website'} onChange={e => setF('action_source', e.target.value)} className="mt-1 bg-background" /></div>
              </div>
              <div className="flex items-center gap-2 pt-1 border-t border-border">
                <Switch checked={editing.auto_hash_capi !== false} onCheckedChange={v => setF('auto_hash_capi', v)} />
                <Label className="text-[12px]">Auto Hash Facebook CAPI Fields</Label>
                <p className="text-[10px] text-muted-foreground ml-2">When ON, user_data PII fields (em, ph, fn, ln, ct, st, zp, country, external_id) are automatically SHA-256 hashed after normalization. Manual <code className="text-primary">|sha256</code> tokens are respected and not double-hashed.</p>
              </div>

              {/* Send Test Event */}
              <div className="pt-2 border-t border-border space-y-3">
                <div className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider">CAPI Payload Template (test resolves tokens with sample data)</div>
                <div className="grid grid-cols-1 lg:grid-cols-[1fr_200px] gap-3">
                  <HighlightedPayloadEditor value={testPayloadStr} onChange={setTestPayloadStr} minHeight={340} />
                  <Card className="bg-card border-border max-h-[340px] overflow-y-auto">
                    <CardContent className="p-3">
                      <TokenReferencePanel customFields={customFields} />
                    </CardContent>
                  </Card>
                </div>
                <Button onClick={sendTestEvent} disabled={sendingTest || !editing.id} className="gap-1.5">
                  {sendingTest ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                  Send Test Event {editing.fb_test_event_code ? '(uses test code)' : ''}
                </Button>
                {!editing.id && <p className="text-[11px] text-muted-foreground ml-2 inline">Save the connector first to enable testing.</p>}
                {testResult && (
                  <div className="space-y-2">
                    {testResult.http_status && (
                      <Badge className={testResult.http_status < 300 ? 'bg-status-sold status-sold' : 'bg-status-error status-error'}>
                        HTTP {testResult.http_status}
                      </Badge>
                    )}
                    {testResult.fb_response && <JsonViewer data={testResult.fb_response} title="Facebook Response" />}
                    {testResult.request_body && <JsonViewer data={testResult.request_body} title="Request Sent" />}
                    {testResult.error && <JsonViewer data={{ error: testResult.error }} title="Error" />}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Webhook / Generic HTTP fields */}
        {isHttp && (
          <Card className="bg-card border-border">
            <CardContent className="p-4 space-y-4">
              <div className="text-[13px] font-semibold text-foreground flex items-center gap-2"><Globe className="w-4 h-4 text-primary" /> {editing.kind === 'webhook' ? 'Webhook' : 'Generic HTTP'}</div>
              <div><Label className="text-[12px]">Target URL</Label><Input value={editing.target_url || ''} onChange={e => setF('target_url', e.target.value)} className="mt-1 bg-background font-mono text-[12px]" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-[12px]">HTTP Method</Label>
                  <SearchableSelect value={editing.http_method || 'POST'} onValueChange={v => setF('http_method', v)} className="mt-1 bg-background"
                    options={[{ value: 'POST', label: 'POST' }, { value: 'GET', label: 'GET' }]} />
                </div>
                <div>
                  <Label className="text-[12px]">Content-Type</Label>
                  <SearchableSelect value={editing.content_type || 'application/json'} onValueChange={v => setF('content_type', v)} className="mt-1 bg-background"
                    options={[{ value: 'application/json', label: 'application/json' }, { value: 'application/x-www-form-urlencoded', label: 'application/x-www-form-urlencoded' }]} />
                </div>
              </div>
              {/* Headers */}
              <div>
                <Label className="text-[12px] mb-1 block">Headers</Label>
                <div className="grid grid-cols-[1fr_1fr_36px] gap-2">
                  {headerRows.map((row, i) => (
                    <React.Fragment key={i}>
                      <Input value={row.key} onChange={e => updateHeaderRow(i, 'key', e.target.value)} placeholder="Header" className="bg-background font-mono text-[12px] h-9" />
                      <Input value={row.value} onChange={e => updateHeaderRow(i, 'value', e.target.value)} placeholder="Value" className="bg-background font-mono text-[12px] h-9" />
                      <Button variant="ghost" size="sm" onClick={() => removeHeaderRow(i)} className="h-9 w-9 p-0 text-destructive"><Trash2 className="w-3.5 h-3.5" /></Button>
                    </React.Fragment>
                  ))}
                </div>
                <Button size="sm" variant="outline" onClick={addHeaderRow} className="gap-1.5 mt-2"><Plus className="w-3.5 h-3.5" /> Add Header</Button>
              </div>
              {/* Payload Template */}
              <div className="space-y-2">
                <Label className="text-[12px] block">Payload Template (JSON with {'{{token}}'} placeholders)</Label>
                <div className="grid grid-cols-1 lg:grid-cols-[1fr_200px] gap-3">
                  <HighlightedPayloadEditor value={editing.payload_template || '{}'} onChange={v => setF('payload_template', v)} minHeight={200} />
                  <Card className="bg-card border-border max-h-[200px] overflow-y-auto">
                    <CardContent className="p-3">
                      <TokenReferencePanel customFields={customFields} />
                    </CardContent>
                  </Card>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  // ── List view ──────────────────────────────────────────────────────────
  return (
    <div>
      <div className="flex justify-end mb-4">
        <Button size="sm" onClick={openCreate} className="gap-1.5"><Plus className="w-4 h-4" /> Add Connector</Button>
      </div>
      <div className="space-y-3">
        {connectors.length === 0 && <div className="text-center py-8 text-muted-foreground text-[13px]">No API connectors configured</div>}
        {connectors.map(conn => {
          const triggers = parseJsonArray(conn.triggers);
          const brands = parseJsonArray(conn.filter_brands);
          const suppliersFiltered = parseJsonArray(conn.filter_suppliers);
          const types = parseJsonArray(conn.filter_supplier_types);
          const isCapi = conn.kind === 'facebook_capi';
          return (
            <Card key={conn.id} className="bg-card border-border">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[14px] font-medium text-foreground">{conn.name}</span>
                      {isCapi ? <Zap className="w-3.5 h-3.5 text-primary" /> : <Globe className="w-3.5 h-3.5 text-muted-foreground" />}
                      <Badge variant="outline" className="text-[10px]">{KIND_OPTIONS.find(k => k.value === conn.kind)?.label || conn.kind}</Badge>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {triggers.map(t => <Badge key={t} className="bg-primary/10 text-primary text-[9px]">{TRIGGER_OPTIONS.find(o => o.value === t)?.label || t}</Badge>)}
                      {brands.length > 0 && <Badge variant="outline" className="text-[9px] text-muted-foreground">Brands: {brands.join(', ')}</Badge>}
                      {suppliersFiltered.length > 0 && <Badge variant="outline" className="text-[9px] text-muted-foreground">Suppliers: {suppliersFiltered.length}</Badge>}
                      {types.length > 0 && <Badge variant="outline" className="text-[9px] text-muted-foreground">Types: {types.join(', ')}</Badge>}
                      {brands.length === 0 && suppliersFiltered.length === 0 && types.length === 0 && <Badge variant="outline" className="text-[9px] text-muted-foreground">All leads</Badge>}
                    </div>
                    {isCapi && <div className="font-mono text-[11px] text-muted-foreground mt-1">Pixel: {conn.fb_pixel_id || 'not set'}</div>}
                    {!isCapi && <div className="font-mono text-[11px] text-muted-foreground mt-1 truncate max-w-[400px]">{conn.target_url || 'not set'}</div>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={conn.enabled ? 'status-sold bg-status-sold' : 'text-muted-foreground'}>
                      {conn.enabled ? 'Active' : 'Disabled'}
                    </Badge>
                    <Button size="sm" variant="ghost" onClick={() => openEdit(conn)}>Edit</Button>
                    <Button size="sm" variant="ghost" onClick={() => toggleEnabled(conn)} className="text-[11px]">
                      {conn.enabled ? 'Disable' : 'Enable'}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => deleteConnector(conn.id)} className="h-7 w-7 p-0 text-destructive"><Trash2 className="w-3.5 h-3.5" /></Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}