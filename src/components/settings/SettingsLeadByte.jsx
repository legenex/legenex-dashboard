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
import { Badge } from '@/components/ui/badge';
import JsonViewer from '@/components/shared/JsonViewer';
import { Plus, Save, Play, Loader2, Trash2 } from 'lucide-react';
import { testLeadByte } from '@/functions/testLeadByte';
import { toast } from 'sonner';

const DEFAULT_TEMPLATE = `{
  "campid": "LEGAL-MVA-USA",
  "email": "{{email}}",
  "firstname": "{{first_name}}",
  "lastname": "{{last_name}}",
  "geo_city": "{{_geoip_city}}",
  "geo_state": "{{_geoip_regionCode}}",
  "geo_zip": "{{_geoip_zip}}",
  "country": "{{_geoip_countryName}}",
  "zip": "{{zip}}",
  "ipaddress": "{{ip_address}}",
  "phone1": "{{mobile}}",
  "source": "{{source}}",
  "c1": "{{s1}}",
  "c2": "{{s2}}",
  "c3": "{{s3}}",
  "sid": "{{sid}}",
  "ssid": "{{ssid}}",
  "optinurl": "{{optin_url}}",
  "incident_date": "{{incident_date}}",
  "accident_state": "{{accident_state}}",
  "accident_state_2": "{{accident_state_2}}",
  "accident_type": "{{accident_type}}",
  "accident_details": "{{accident_details}}",
  "injured": "{{injured}}",
  "injury_type": "{{injury_type}}",
  "type_of_injury": "{{type_of_injury}}",
  "treatment": "{{treatment}}",
  "treatment_type": "{{treatment_type}}",
  "treatment_time": "{{treatment_time}}",
  "fault": "{{fault}}",
  "attorney": "No",
  "has_attorney": "{{has_attorney}}",
  "insurance": "{{insurance}}",
  "police_report": "{{police_report}}",
  "phone_verified": "{{phone_verified}}",
  "trustedform_url": "{{trustedform_url}}",
  "jornaya_token": "{{jornaya_token}}",
  "supplier_brand": "{{supplier_brand}}",
  "tier": "{{tier}}",
  "vertical": "MVA",
  "client_type": "{{client_type}}",
  "user_agent": "{{user_agent}}",
  "utm_source": "{{utm_source}}",
  "utm_campaign": "{{utm_campaign}}",
  "utm_medium": "{{utm_medium}}",
  "utm_content": "{{utm_content}}",
  "utm_terms": "{{utm_terms}}",
  "utm_ad_label": "{{ad_label}}",
  "timezone": "{{timezone}}",
  "tc_id": "{{tc_id}}",
  "event_time": "{{event_time}}",
  "event_id": "{{event_id}}",
  "email_hash": "{{email_hash}}",
  "phone_hash": "{{phone_hash}}",
  "first_name_hash": "{{first_name_hash}}",
  "last_name_hash": "{{last_name_hash}}",
  "city_hash": "{{city_hash}}",
  "state_hash": "{{state_hash}}",
  "zip_hash": "{{zip_hash}}",
  "country_hash": "{{country_hash}}",
  "external_id_hash": "{{external_id_hash}}",
  "fbc": "{{fbc}}",
  "fbp": "{{fbp}}",
  "content_name": "{{content_name}}"
}`;

const HLR_TOKENS = ['phone_verified', 'hlr_status', 'hlr_score', 'country_code'];

const FINAL_STATUSES = ['Sold', 'Unsold', 'Error'];

function parseHeaderRows(val) {
  if (!val) return [{ key: 'Content-Type', value: 'application/json' }];
  if (typeof val === 'string') {
    try {
      const parsed = JSON.parse(val);
      if (Array.isArray(parsed)) return parsed;
      return Object.entries(parsed).map(([key, value]) => ({ key, value }));
    } catch { return [{ key: 'Content-Type', value: 'application/json' }]; }
  }
  if (Array.isArray(val)) return val;
  return Object.entries(val).map(([key, value]) => ({ key, value }));
}

export default function SettingsLeadByte() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(null);
  const [headerRows, setHeaderRows] = useState([]);
  const [testResult, setTestResult] = useState(null);
  const [testingId, setTestingId] = useState(null);
  const [activeTab, setActiveTab] = useState('connector'); // 'connector' | 'responses'

  // Response mapping state
  const [editingMapping, setEditingMapping] = useState(null); // { id?, lb_status, response_label, final_status, sort_order, is_fallback }
  const [savingMapping, setSavingMapping] = useState(false);

  const { data: connectors = [] } = useQuery({
    queryKey: ['lb-connectors-all'],
    queryFn: () => base44.entities.LeadByteConnector.list(),
  });

  const { data: customFields = [] } = useQuery({
    queryKey: ['custom-fields'],
    queryFn: () => base44.entities.CustomField.list(),
  });

  const { data: responseMappings = [], refetch: refetchMappings } = useQuery({
    queryKey: ['response-mappings'],
    queryFn: () => base44.entities.ResponseMapping.list('sort_order', 50),
  });

  const openEdit = (conn) => {
    setEditing({ ...conn });
    setHeaderRows(parseHeaderRows(conn.headers));
    setTestResult(null);
    setActiveTab('connector');
  };

  const openCreate = () => {
    setEditing({
      api_name: '', target_url: '', http_method: 'POST',
      content_type: 'application/json', headers: '[]',
      payload_template: DEFAULT_TEMPLATE, enabled: true, is_default: false,
    });
    setHeaderRows([{ key: 'X_KEY', value: '' }, { key: 'Content-Type', value: 'application/json' }]);
    setTestResult(null);
    setActiveTab('connector');
  };

  const saveConnector = async () => {
    const data = { ...editing, headers: JSON.stringify(headerRows) };
    if (editing.id) {
      await base44.entities.LeadByteConnector.update(editing.id, data);
    } else {
      await base44.entities.LeadByteConnector.create(data);
    }
    toast.success('Connector saved');
    setEditing(null);
    qc.invalidateQueries({ queryKey: ['lb-connectors-all'] });
  };

  const sendTestLead = async (conn) => {
    setTestingId(conn.id || 'new');
    setTestResult(null);
    try {
      const testPayload = {
        firstname: 'Test', lastname: 'Lead', phone: '0000000000',
        email: 'test@legenex.com', sid: 'test', address: '123 Test St',
        city: 'Testville', state: 'TX', zip: '00000', ip_address: '127.0.0.1',
        trustedform_cert: '', jornaya_leadid: '', landing_page: 'https://test.com', user_agent: 'test',
      };
      const connToTest = editing ? { ...editing, headers: JSON.stringify(headerRows) } : conn;
      let connId = connToTest.id;
      if (!connId) {
        const created = await base44.entities.LeadByteConnector.create({ ...connToTest, enabled: false });
        connId = created.id;
      }
      const resp = await testLeadByte({ connector_id: connId, test_payload: testPayload });
      setTestResult(resp.data);
    } catch (err) {
      setTestResult({ error: err.message });
    }
    setTestingId(null);
  };

  const addHeaderRow = () => setHeaderRows(p => [...p, { key: '', value: '' }]);
  const removeHeaderRow = (i) => setHeaderRows(p => p.filter((_, idx) => idx !== i));
  const updateHeaderRow = (i, field, val) => setHeaderRows(p => p.map((r, idx) => idx === i ? { ...r, [field]: val } : r));

  const saveMapping = async () => {
    if (!editingMapping) return;
    setSavingMapping(true);
    try {
      const data = {
        lb_status: editingMapping.lb_status,
        response_label: editingMapping.response_label,
        final_status: editingMapping.final_status,
        sort_order: editingMapping.sort_order || 0,
        is_fallback: editingMapping.is_fallback || false,
      };
      if (editingMapping.id) {
        await base44.entities.ResponseMapping.update(editingMapping.id, data);
      } else {
        await base44.entities.ResponseMapping.create(data);
      }
      toast.success('Response mapping saved');
      setEditingMapping(null);
      refetchMappings();
    } catch (e) {
      toast.error('Failed to save');
    }
    setSavingMapping(false);
  };

  const deleteMapping = async (id) => {
    await base44.entities.ResponseMapping.delete(id);
    refetchMappings();
    toast.success('Deleted');
  };

  const fieldTokens = customFields.map(f => f.field_name);

  const statusColor = { Sold: 'text-green-400', Unsold: 'text-yellow-400', Error: 'text-red-400' };

  if (editing) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: tabs + form */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-[15px] font-semibold text-foreground">{editing.id ? 'Edit Connector' : 'New Connector'}</h3>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
              <Button onClick={saveConnector} className="gap-1.5"><Save className="w-4 h-4" /> Save</Button>
            </div>
          </div>

          {/* Sub-tabs */}
          <div className="flex gap-1 border-b border-border">
            {['connector', 'responses'].map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 text-[13px] font-medium transition-colors border-b-2 -mb-px
                  ${activeTab === tab ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
              >
                {tab === 'connector' ? 'Connector Config' : 'Response Builder'}
              </button>
            ))}
          </div>

          {activeTab === 'connector' && (
            <>
              <Card className="bg-card border-border">
                <CardContent className="p-4 space-y-4">
                  <div><Label className="text-[12px]">API Name</Label><Input value={editing.api_name || ''} onChange={e => setEditing(p => ({ ...p, api_name: e.target.value }))} className="mt-1 bg-background" /></div>
                  <div><Label className="text-[12px]">Endpoint URL</Label><Input value={editing.target_url || ''} onChange={e => setEditing(p => ({ ...p, target_url: e.target.value }))} className="mt-1 bg-background font-mono text-[12px]" /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-[12px]">HTTP Method</Label>
                      <Select value={editing.http_method || 'POST'} onValueChange={v => setEditing(p => ({ ...p, http_method: v }))}>
                        <SelectTrigger className="mt-1 bg-background"><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="POST">POST</SelectItem><SelectItem value="GET">GET</SelectItem></SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-[12px]">Content-Type</Label>
                      <Select value={editing.content_type || 'application/json'} onValueChange={v => setEditing(p => ({ ...p, content_type: v }))}>
                        <SelectTrigger className="mt-1 bg-background"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="application/json">application/json</SelectItem>
                          <SelectItem value="application/x-www-form-urlencoded">application/x-www-form-urlencoded</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2"><Switch checked={editing.enabled} onCheckedChange={v => setEditing(p => ({ ...p, enabled: v }))} /><Label className="text-[12px]">Enabled</Label></div>
                    <div className="flex items-center gap-2"><Switch checked={editing.is_default} onCheckedChange={v => setEditing(p => ({ ...p, is_default: v }))} /><Label className="text-[12px]">Default</Label></div>
                  </div>
                </CardContent>
              </Card>

              {/* Headers — taller, full editable rows */}
              <Card className="bg-card border-border">
                <CardHeader className="pb-2"><CardTitle className="text-[13px]">Headers</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-[1fr_1fr_36px] gap-2 text-[11px] text-muted-foreground font-medium px-1">
                    <span>Header Name</span><span>Value</span><span />
                  </div>
                  {headerRows.map((row, i) => (
                    <div key={i} className="grid grid-cols-[1fr_1fr_36px] gap-2 items-start">
                      <Input
                        value={row.key}
                        onChange={e => updateHeaderRow(i, 'key', e.target.value)}
                        placeholder="e.g. X-API-KEY"
                        className="bg-background font-mono text-[12px] h-10"
                      />
                      <Input
                        value={row.value}
                        onChange={e => updateHeaderRow(i, 'value', e.target.value)}
                        placeholder="Value"
                        className="bg-background font-mono text-[12px] h-10"
                      />
                      <Button variant="ghost" size="sm" onClick={() => removeHeaderRow(i)} className="h-10 w-9 p-0 text-destructive hover:text-destructive">
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ))}
                  <Button size="sm" variant="outline" onClick={addHeaderRow} className="gap-1.5 mt-1">
                    <Plus className="w-3.5 h-3.5" /> Add Header
                  </Button>
                </CardContent>
              </Card>

              {/* Payload Builder */}
              <Card className="bg-card border-border">
                <CardHeader className="pb-2"><CardTitle className="text-[13px]">Payload Builder</CardTitle></CardHeader>
                <CardContent>
                  <p className="text-[11px] text-muted-foreground mb-2">Use <code className="bg-muted px-1 rounded text-primary">{'{{token}}'}</code> placeholders. campid should be a hardcoded value.</p>
                  <Textarea
                    value={editing.payload_template || DEFAULT_TEMPLATE}
                    onChange={e => setEditing(p => ({ ...p, payload_template: e.target.value }))}
                    className="bg-background font-mono text-[12px] min-h-[400px] leading-relaxed"
                  />
                </CardContent>
              </Card>

              {/* Test */}
              <div className="flex items-center gap-3">
                <Button variant="outline" onClick={() => sendTestLead(editing)} disabled={testingId === (editing.id || 'new')} className="gap-1.5">
                  {testingId === (editing.id || 'new') ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                  Test (server-side)
                </Button>
              </div>
              {testResult && <JsonViewer data={testResult} title="LeadByte Response" />}
            </>
          )}

          {activeTab === 'responses' && (
            <div className="space-y-4">
              <div className="text-[13px] text-muted-foreground leading-relaxed bg-card border border-border rounded-lg p-4">
                <p className="font-medium text-foreground mb-1">How Response Mapping Works</p>
                <p>When LeadByte returns a result, the pipeline checks <code className="bg-muted px-1 rounded text-primary text-[11px]">records[0].status</code> against this table. The first matching row determines the <strong>final status</strong> (Sold / Unsold / Error) and the <strong>response label</strong> returned to your supplier. Add a fallback row with status <code className="bg-muted px-1 rounded text-primary text-[11px]">*</code> to catch anything unmatched.</p>
              </div>

              {/* Mapping table */}
              <div className="bg-card border border-border rounded-lg overflow-hidden">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-border bg-muted/40">
                      <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">LB Status</th>
                      <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Supplier Response</th>
                      <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Final Status</th>
                      <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Fallback</th>
                      <th className="px-4 py-2.5 w-20" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {responseMappings.length === 0 && (
                      <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No response mappings yet. Add one below.</td></tr>
                    )}
                    {responseMappings.map(m => (
                      <tr key={m.id} className="hover:bg-accent/30 transition-colors">
                        <td className="px-4 py-3 font-mono text-[12px] text-primary">{m.lb_status}</td>
                        <td className="px-4 py-3 text-foreground">{m.response_label}</td>
                        <td className="px-4 py-3">
                          <span className={`font-medium ${statusColor[m.final_status] || ''}`}>{m.final_status}</span>
                        </td>
                        <td className="px-4 py-3">
                          {m.is_fallback && <Badge className="bg-primary/10 text-primary text-[10px]">Fallback</Badge>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditingMapping({ ...m })}>
                              <Save className="w-3 h-3" />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => deleteMapping(m.id)}>
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Add / Edit mapping form */}
              {editingMapping ? (
                <Card className="bg-card border-border">
                  <CardHeader className="pb-2"><CardTitle className="text-[13px]">{editingMapping.id ? 'Edit Mapping' : 'New Mapping'}</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-[12px]">LB Status <span className="text-muted-foreground">(or * for fallback)</span></Label>
                        <Input value={editingMapping.lb_status} onChange={e => setEditingMapping(p => ({ ...p, lb_status: e.target.value }))} placeholder="e.g. Approved" className="mt-1 bg-background font-mono text-[12px]" />
                      </div>
                      <div>
                        <Label className="text-[12px]">Supplier Response Label</Label>
                        <Input value={editingMapping.response_label} onChange={e => setEditingMapping(p => ({ ...p, response_label: e.target.value }))} placeholder="e.g. Sold" className="mt-1 bg-background" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 items-end">
                      <div>
                        <Label className="text-[12px]">Final Status</Label>
                        <Select value={editingMapping.final_status} onValueChange={v => setEditingMapping(p => ({ ...p, final_status: v }))}>
                          <SelectTrigger className="mt-1 bg-background"><SelectValue /></SelectTrigger>
                          <SelectContent>{FINAL_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-[12px]">Sort Order</Label>
                        <Input type="number" value={editingMapping.sort_order || 0} onChange={e => setEditingMapping(p => ({ ...p, sort_order: Number(e.target.value) }))} className="mt-1 bg-background" />
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch checked={!!editingMapping.is_fallback} onCheckedChange={v => setEditingMapping(p => ({ ...p, is_fallback: v }))} />
                      <Label className="text-[12px]">This is the fallback row (matches anything unmatched)</Label>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <Button size="sm" variant="ghost" onClick={() => setEditingMapping(null)}>Cancel</Button>
                      <Button size="sm" onClick={saveMapping} disabled={savingMapping || !editingMapping.lb_status || !editingMapping.response_label}>
                        {savingMapping ? 'Saving…' : 'Save Mapping'}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setEditingMapping({ lb_status: '', response_label: '', final_status: 'Sold', sort_order: responseMappings.length, is_fallback: false })}>
                  <Plus className="w-3.5 h-3.5" /> Add Mapping
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Right: token reference */}
        <div>
          <Card className="bg-card border-border sticky top-4">
            <CardHeader className="pb-2"><CardTitle className="text-[13px]">Token Reference</CardTitle></CardHeader>
            <CardContent className="space-y-3 max-h-[70vh] overflow-y-auto">
              <div>
                <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Lead Fields</div>
                <div className="space-y-1">
                  {fieldTokens.length === 0 && <div className="text-[11px] text-muted-foreground">No custom fields defined</div>}
                  {fieldTokens.map(t => (
                    <div key={t} className="flex items-center gap-2">
                      <code className="text-[11px] font-mono text-primary bg-primary/10 px-1.5 py-0.5 rounded cursor-pointer hover:bg-primary/20"
                        onClick={() => { navigator.clipboard.writeText('{{' + t + '}}'); toast.success('Copied'); }}>
                        {'{{' + t + '}}'}
                      </code>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">HLR Tokens</div>
                <div className="space-y-1">
                  {HLR_TOKENS.map(t => (
                    <div key={t} className="flex items-center gap-2">
                      <code className="text-[11px] font-mono text-primary bg-primary/10 px-1.5 py-0.5 rounded cursor-pointer hover:bg-primary/20"
                        onClick={() => { navigator.clipboard.writeText('{{' + t + '}}'); toast.success('Copied'); }}>
                        {'{{' + t + '}}'}
                      </code>
                      {t === 'phone_verified' && <Badge className="bg-primary/10 text-primary text-[9px]">HLR-filled</Badge>}
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // List view — also show Response Builder tab
  return (
    <div>
      {/* Top-level tabs */}
      <div className="flex gap-1 border-b border-border mb-5">
        {['connectors', 'responses'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-[13px] font-medium transition-colors border-b-2 -mb-px
              ${activeTab === tab ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >
            {tab === 'connectors' ? 'Connectors' : 'Response Builder'}
          </button>
        ))}
      </div>

      {activeTab === 'connectors' && (
        <div>
          <div className="flex justify-end mb-4">
            <Button size="sm" onClick={openCreate} className="gap-1.5"><Plus className="w-4 h-4" /> Add Connector</Button>
          </div>
          <div className="space-y-4">
            {connectors.map(conn => (
              <Card key={conn.id} className="bg-card border-border">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-[14px] font-medium text-foreground">{conn.api_name}</div>
                      <div className="font-mono text-[11px] text-muted-foreground mt-1">{conn.target_url}</div>
                      <div className="text-[11px] text-muted-foreground mt-1">{conn.content_type || 'application/json'} · {conn.http_method || 'POST'}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {conn.is_default && <Badge className="bg-primary/20 text-primary text-[10px]">Default</Badge>}
                      <Badge variant="outline" className={conn.enabled ? 'status-sold bg-status-sold' : 'text-muted-foreground'}>
                        {conn.enabled ? 'Active' : 'Disabled'}
                      </Badge>
                      <Button size="sm" variant="ghost" onClick={() => openEdit(conn)}>Edit</Button>
                      <Button size="sm" variant="outline" onClick={() => sendTestLead(conn)} disabled={testingId === conn.id} className="gap-1.5">
                        {testingId === conn.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                        Test
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
            {connectors.length === 0 && <div className="text-center py-8 text-muted-foreground text-[13px]">No connectors configured</div>}
          </div>
          {testResult && <div className="mt-4"><JsonViewer data={testResult} title="Test Response" /></div>}
        </div>
      )}

      {activeTab === 'responses' && (
        <div className="space-y-4">
          <div className="text-[13px] text-muted-foreground leading-relaxed bg-card border border-border rounded-lg p-4">
            <p className="font-medium text-foreground mb-1">How Response Mapping Works</p>
            <p>When LeadByte returns a result, the pipeline checks <code className="bg-muted px-1 rounded text-primary text-[11px]">records[0].status</code> against this table. The first matching row determines the <strong>final status</strong> (Sold / Unsold / Error) and the <strong>response label</strong> returned to your supplier. Add a fallback row with LB Status <code className="bg-muted px-1 rounded text-primary text-[11px]">*</code> to catch anything unmatched.</p>
          </div>

          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">LB Status</th>
                  <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Supplier Response</th>
                  <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Final Status</th>
                  <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Fallback</th>
                  <th className="px-4 py-2.5 w-20" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {responseMappings.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No response mappings. Add one below.</td></tr>
                )}
                {responseMappings.map(m => (
                  <tr key={m.id} className="hover:bg-accent/30 transition-colors">
                    <td className="px-4 py-3 font-mono text-[12px] text-primary">{m.lb_status}</td>
                    <td className="px-4 py-3 text-foreground">{m.response_label}</td>
                    <td className="px-4 py-3">
                      <span className={`font-medium ${statusColor[m.final_status] || ''}`}>{m.final_status}</span>
                    </td>
                    <td className="px-4 py-3">
                      {m.is_fallback && <Badge className="bg-primary/10 text-primary text-[10px]">Fallback</Badge>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={() => setEditingMapping({ ...m })}>Edit</Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => deleteMapping(m.id)}><Trash2 className="w-3 h-3" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {editingMapping ? (
            <Card className="bg-card border-border">
              <CardHeader className="pb-2"><CardTitle className="text-[13px]">{editingMapping.id ? 'Edit Mapping' : 'New Mapping'}</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-[12px]">LB Status <span className="text-muted-foreground">(or * for fallback)</span></Label>
                    <Input value={editingMapping.lb_status} onChange={e => setEditingMapping(p => ({ ...p, lb_status: e.target.value }))} placeholder="e.g. Approved" className="mt-1 bg-background font-mono text-[12px]" />
                  </div>
                  <div>
                    <Label className="text-[12px]">Supplier Response Label</Label>
                    <Input value={editingMapping.response_label} onChange={e => setEditingMapping(p => ({ ...p, response_label: e.target.value }))} placeholder="e.g. Sold" className="mt-1 bg-background" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 items-end">
                  <div>
                    <Label className="text-[12px]">Final Status</Label>
                    <Select value={editingMapping.final_status} onValueChange={v => setEditingMapping(p => ({ ...p, final_status: v }))}>
                      <SelectTrigger className="mt-1 bg-background"><SelectValue /></SelectTrigger>
                      <SelectContent>{FINAL_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[12px]">Sort Order</Label>
                    <Input type="number" value={editingMapping.sort_order || 0} onChange={e => setEditingMapping(p => ({ ...p, sort_order: Number(e.target.value) }))} className="mt-1 bg-background" />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={!!editingMapping.is_fallback} onCheckedChange={v => setEditingMapping(p => ({ ...p, is_fallback: v }))} />
                  <Label className="text-[12px]">This is the fallback row (matches anything unmatched)</Label>
                </div>
                <div className="flex gap-2 pt-1">
                  <Button size="sm" variant="ghost" onClick={() => setEditingMapping(null)}>Cancel</Button>
                  <Button size="sm" onClick={saveMapping} disabled={savingMapping || !editingMapping.lb_status || !editingMapping.response_label}>
                    {savingMapping ? 'Saving…' : 'Save Mapping'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setEditingMapping({ lb_status: '', response_label: '', final_status: 'Sold', sort_order: responseMappings.length, is_fallback: false })}>
              <Plus className="w-3.5 h-3.5" /> Add Mapping
            </Button>
          )}
        </div>
      )}
    </div>
  );
}