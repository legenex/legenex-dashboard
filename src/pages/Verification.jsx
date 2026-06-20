import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import PageHeader from '@/components/shared/PageHeader';
import JsonViewer from '@/components/shared/JsonViewer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Play, Save } from 'lucide-react';
import { toast } from 'sonner';

const failModeDescriptions = {
  fail_open: 'Continue processing without HLR data. The lead proceeds to LeadByte with HLR fields absent and hlr_error flagged.',
  fail_closed: 'Stop processing immediately. The lead is marked as Error and the supplier receives an error response.',
  forward_blank: 'Continue processing but send empty strings for all HLR passthrough fields to LeadByte.',
};

export default function Verification() {
  const qc = useQueryClient();
  const [testMobile, setTestMobile] = useState('');
  const [testFirstName, setTestFirstName] = useState('');
  const [testLastName, setTestLastName] = useState('');
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);

  const { data: hlrArr = [] } = useQuery({
    queryKey: ['hlr-settings'],
    queryFn: () => base44.entities.HlrSettings.list(),
  });

  const settings = hlrArr[0] || {};
  const [form, setForm] = useState(null);

  React.useEffect(() => {
    if (hlrArr.length > 0 && !form) {
      setForm({
        provider_name: settings.provider_name || '',
        endpoint_url: settings.endpoint_url || '',
        enabled: settings.enabled ?? true,
        timeout_ms: settings.timeout_ms || 8000,
        fail_mode: settings.fail_mode || 'fail_open',
        request_field_map: settings.request_field_map || '{}',
        passthrough_fields: settings.passthrough_fields || '[]',
        min_summary_score: settings.min_summary_score || 0,
      });
    }
  }, [hlrArr]);

  const handleSave = async () => {
    setSaving(true);
    await base44.entities.HlrSettings.update(settings.id, form);
    toast.success('HLR settings saved');
    qc.invalidateQueries({ queryKey: ['hlr-settings'] });
    setSaving(false);
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const reqFieldMap = typeof form.request_field_map === 'string' ? JSON.parse(form.request_field_map) : form.request_field_map;
      const body = {
        [reqFieldMap.mobile || 'mobile']: testMobile,
        [reqFieldMap.first_name || 'first_name']: testFirstName,
        [reqFieldMap.last_name || 'last_name']: testLastName,
      };
      const resp = await fetch(form.endpoint_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await resp.json();
      setTestResult(data);
    } catch (err) {
      setTestResult({ error: err.message });
    }
    setTesting(false);
  };

  if (!form) return <div className="py-8 text-center text-muted-foreground">Loading...</div>;

  return (
    <div>
      <PageHeader title="Verification" subtitle="HLR phone lookup configuration and testing" />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Settings */}
        <div className="space-y-4">
          <Card className="bg-card border-border">
            <CardHeader><CardTitle className="text-[14px]">Provider Settings</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div><Label className="text-[12px]">Provider Name</Label><Input value={form.provider_name} onChange={e => setForm(p => ({ ...p, provider_name: e.target.value }))} className="mt-1 bg-background" /></div>
              <div><Label className="text-[12px]">Endpoint URL</Label><Input value={form.endpoint_url} onChange={e => setForm(p => ({ ...p, endpoint_url: e.target.value }))} className="mt-1 bg-background font-mono text-[12px]" /></div>
              <div className="flex items-center gap-2">
                <Switch checked={form.enabled} onCheckedChange={v => setForm(p => ({ ...p, enabled: v }))} />
                <Label className="text-[12px]">Enabled</Label>
              </div>
              <div><Label className="text-[12px]">Timeout (ms)</Label><Input type="number" value={form.timeout_ms} onChange={e => setForm(p => ({ ...p, timeout_ms: Number(e.target.value) }))} className="mt-1 bg-background" /></div>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader><CardTitle className="text-[14px]">Fail Mode</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Select value={form.fail_mode} onValueChange={v => setForm(p => ({ ...p, fail_mode: v }))}>
                <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="fail_open">Fail Open</SelectItem>
                  <SelectItem value="fail_closed">Fail Closed</SelectItem>
                  <SelectItem value="forward_blank">Forward Blank</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[12px] text-muted-foreground leading-relaxed">{failModeDescriptions[form.fail_mode]}</p>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader><CardTitle className="text-[14px]">Field Mapping & Passthrough</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div><Label className="text-[12px]">Request Field Map (JSON)</Label><Input value={form.request_field_map} onChange={e => setForm(p => ({ ...p, request_field_map: e.target.value }))} className="mt-1 bg-background font-mono text-[12px]" /></div>
              <div><Label className="text-[12px]">Passthrough Fields (JSON array)</Label><Input value={form.passthrough_fields} onChange={e => setForm(p => ({ ...p, passthrough_fields: e.target.value }))} className="mt-1 bg-background font-mono text-[12px]" /></div>
              <div><Label className="text-[12px]">Min Summary Score (flag threshold)</Label><Input type="number" value={form.min_summary_score} onChange={e => setForm(p => ({ ...p, min_summary_score: Number(e.target.value) }))} className="mt-1 bg-background" /></div>
            </CardContent>
          </Card>

          <Button onClick={handleSave} disabled={saving} className="gap-1.5 w-full">
            <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save Settings'}
          </Button>
        </div>

        {/* Test Tool */}
        <div>
          <Card className="bg-card border-border">
            <CardHeader><CardTitle className="text-[14px]">Live Test Lookup</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div><Label className="text-[12px]">Mobile Number</Label><Input value={testMobile} onChange={e => setTestMobile(e.target.value)} placeholder="5402231670" className="mt-1 bg-background font-mono" /></div>
              <div><Label className="text-[12px]">First Name</Label><Input value={testFirstName} onChange={e => setTestFirstName(e.target.value)} placeholder="Abigale" className="mt-1 bg-background" /></div>
              <div><Label className="text-[12px]">Last Name</Label><Input value={testLastName} onChange={e => setTestLastName(e.target.value)} placeholder="Hart" className="mt-1 bg-background" /></div>
              <Button onClick={handleTest} disabled={testing || !testMobile} className="gap-1.5 w-full">
                {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                {testing ? 'Running...' : 'Run Test Lookup'}
              </Button>
              {testResult && (
                <div className="mt-4">
                  <JsonViewer data={testResult} title="HLR Response" />
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}