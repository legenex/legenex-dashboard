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
  "sid": "{{sid}}",
  "firstname": "{{firstname}}",
  "lastname": "{{lastname}}",
  "email": "{{email}}",
  "phone": "{{phone}}",
  "phone_verified": "{{phone_verified}}",
  "address": "{{address}}",
  "city": "{{city}}",
  "state": "{{state}}",
  "zip": "{{zip}}",
  "ip_address": "{{ip_address}}",
  "trustedform_cert": "{{trustedform_cert}}",
  "jornaya_leadid": "{{jornaya_leadid}}",
  "landing_page": "{{landing_page}}"
}`;

const HLR_TOKENS = ['phone_verified', 'hlr_status', 'hlr_score', 'country_code'];

function parseHeaderRows(val) {
  if (!val) return [{ key: 'Content-Type', value: 'application/json' }];
  if (typeof val === 'string') {
    try {
      const parsed = JSON.parse(val);
      if (Array.isArray(parsed)) return parsed;
      // legacy object format
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

  const { data: connectors = [] } = useQuery({
    queryKey: ['lb-connectors-all'],
    queryFn: () => base44.entities.LeadByteConnector.list(),
  });

  const { data: customFields = [] } = useQuery({
    queryKey: ['custom-fields'],
    queryFn: () => base44.entities.CustomField.list(),
  });

  const openEdit = (conn) => {
    setEditing({ ...conn });
    setHeaderRows(parseHeaderRows(conn.headers));
    setTestResult(null);
  };

  const openCreate = () => {
    setEditing({
      api_name: '', target_url: '', http_method: 'POST',
      content_type: 'application/json', headers: '[]',
      payload_template: DEFAULT_TEMPLATE, enabled: true, is_default: false,
    });
    setHeaderRows([{ key: 'X_KEY', value: '' }, { key: 'Content-Type', value: 'application/json' }]);
    setTestResult(null);
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
      // Save connector temporarily to get ID if new, or use existing
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

  // Token reference
  const fieldTokens = customFields.map(f => f.field_name);

  if (editing) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: form */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-[15px] font-semibold text-foreground">{editing.id ? 'Edit Connector' : 'New Connector'}</h3>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
              <Button onClick={saveConnector} className="gap-1.5"><Save className="w-4 h-4" /> Save</Button>
            </div>
          </div>

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

          {/* Headers */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-2"><CardTitle className="text-[13px]">Headers</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {headerRows.map((row, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input value={row.key} onChange={e => updateHeaderRow(i, 'key', e.target.value)} placeholder="Header name" className="bg-background font-mono text-[12px]" />
                  <Input value={row.value} onChange={e => updateHeaderRow(i, 'value', e.target.value)} placeholder="Value" className="bg-background font-mono text-[12px] flex-1" />
                  <Button variant="ghost" size="sm" onClick={() => removeHeaderRow(i)} className="h-8 w-8 p-0 text-destructive"><Trash2 className="w-3.5 h-3.5" /></Button>
                </div>
              ))}
              <Button size="sm" variant="outline" onClick={addHeaderRow} className="gap-1.5 mt-1"><Plus className="w-3.5 h-3.5" /> Add Header</Button>
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
                className="bg-background font-mono text-[12px] min-h-[320px] leading-relaxed"
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
        </div>

        {/* Right: token reference */}
        <div>
          <Card className="bg-card border-border sticky top-4">
            <CardHeader className="pb-2"><CardTitle className="text-[13px]">Token Reference</CardTitle></CardHeader>
            <CardContent className="space-y-3">
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

  return (
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
  );
}