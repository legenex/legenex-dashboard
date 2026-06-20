import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import JsonViewer from '@/components/shared/JsonViewer';
import { Plus, Save, Play, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function SettingsLeadByte() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(null);
  const [testResult, setTestResult] = useState(null);
  const [testingId, setTestingId] = useState(null);

  const { data: connectors = [] } = useQuery({
    queryKey: ['lb-connectors-all'],
    queryFn: () => base44.entities.LeadByteConnector.list(),
  });

  const saveConnector = async () => {
    if (editing.id) {
      await base44.entities.LeadByteConnector.update(editing.id, editing);
    } else {
      await base44.entities.LeadByteConnector.create(editing);
    }
    toast.success('Connector saved');
    setEditing(null);
    qc.invalidateQueries({ queryKey: ['lb-connectors-all'] });
  };

  const sendTestLead = async (conn) => {
    setTestingId(conn.id);
    setTestResult(null);
    try {
      const headers = typeof conn.headers === 'string' ? JSON.parse(conn.headers) : (conn.headers || {});
      const testPayload = { first_name: 'Test', last_name: 'Lead', mobile: '0000000000', email: 'test@legenex.com', source: 'legenex_test' };
      const resp = await fetch(conn.target_url, {
        method: 'POST',
        headers,
        body: JSON.stringify(testPayload),
      });
      const data = await resp.json();
      setTestResult(data);
    } catch (err) {
      setTestResult({ error: err.message });
    }
    setTestingId(null);
  };

  return (
    <div>
      <div className="flex justify-end mb-4">
        <Button size="sm" onClick={() => setEditing({ api_name: '', target_url: '', headers: '{}', enabled: true, is_default: false })} className="gap-1.5">
          <Plus className="w-4 h-4" /> Add Connector
        </Button>
      </div>

      <div className="space-y-4">
        {connectors.map(conn => (
          <Card key={conn.id} className="bg-card border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-[14px] font-medium text-foreground">{conn.api_name}</div>
                  <div className="font-mono text-[11px] text-muted-foreground mt-1">{conn.target_url}</div>
                </div>
                <div className="flex items-center gap-2">
                  {conn.is_default && <Badge className="bg-primary/20 text-primary text-[10px]">Default</Badge>}
                  <Badge variant="outline" className={conn.enabled ? 'status-sold bg-status-sold' : 'text-muted-foreground'}>
                    {conn.enabled ? 'Active' : 'Disabled'}
                  </Badge>
                  <Button size="sm" variant="ghost" onClick={() => setEditing({ ...conn })}>Edit</Button>
                  <Button size="sm" variant="outline" onClick={() => sendTestLead(conn)} disabled={testingId === conn.id} className="gap-1.5">
                    {testingId === conn.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                    Test
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {testResult && (
        <div className="mt-4">
          <JsonViewer data={testResult} title="Test Response" />
        </div>
      )}

      {/* Edit Modal */}
      {editing && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setEditing(null)}>
          <div className="bg-popover border border-border rounded-[10px] p-6 max-w-[500px] w-full" onClick={e => e.stopPropagation()}>
            <h3 className="text-[16px] font-semibold text-foreground mb-4">{editing.id ? 'Edit Connector' : 'New Connector'}</h3>
            <div className="space-y-4">
              <div><Label className="text-[12px]">API Name</Label><Input value={editing.api_name || ''} onChange={e => setEditing(p => ({ ...p, api_name: e.target.value }))} className="mt-1 bg-background" /></div>
              <div><Label className="text-[12px]">Target URL</Label><Input value={editing.target_url || ''} onChange={e => setEditing(p => ({ ...p, target_url: e.target.value }))} className="mt-1 bg-background font-mono text-[12px]" /></div>
              <div><Label className="text-[12px]">Headers (JSON)</Label><Input value={editing.headers || '{}'} onChange={e => setEditing(p => ({ ...p, headers: e.target.value }))} className="mt-1 bg-background font-mono text-[12px]" /></div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2"><Switch checked={editing.enabled} onCheckedChange={v => setEditing(p => ({ ...p, enabled: v }))} /><Label className="text-[12px]">Enabled</Label></div>
                <div className="flex items-center gap-2"><Switch checked={editing.is_default} onCheckedChange={v => setEditing(p => ({ ...p, is_default: v }))} /><Label className="text-[12px]">Default</Label></div>
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                <Button onClick={saveConnector} className="gap-1.5"><Save className="w-4 h-4" /> Save</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}