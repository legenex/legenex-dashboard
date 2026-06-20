import React, { useState, useEffect } from 'react';
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
import { testHlr } from '@/functions/testHlr';
import { toast } from 'sonner';

const failModeDescriptions = {
  fail_open: 'Continue processing without HLR data. Lead proceeds to LeadByte with HLR fields absent.',
  fail_closed: 'Stop processing immediately. Lead is marked as Error and supplier receives error response.',
  forward_blank: 'Continue but send empty strings for all HLR passthrough fields to LeadByte.',
};

const phoneVerifiedSourceDescriptions = {
  lh_hlr_response: 'Sends the raw lh_hlr_response value (e.g. "Exact Match") as phone_verified.',
  summary_score: 'Sends the numeric summary_score (0–100) as phone_verified.',
  boolean: 'Sends "true" if Exact Match, "false" otherwise.',
};

export default function Verification() {
  const qc = useQueryClient();
  const [testPhone, setTestPhone] = useState('');
  const [testFirstname, setTestFirstname] = useState('');
  const [testLastname, setTestLastname] = useState('');
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);

  const { data: hlrArr = [] } = useQuery({
    queryKey: ['hlr-settings'],
    queryFn: () => base44.entities.HlrSettings.list(),
  });

  const settings = hlrArr[0] || {};
  const [form, setForm] = useState(null);

  useEffect(() => {
    if (hlrArr.length > 0 && !form) {
      setForm({
        provider_name: settings.provider_name || '',
        endpoint_url: settings.endpoint_url || '',
        enabled: settings.enabled ?? true,
        timeout_ms: settings.timeout_ms || 8000,
        fail_mode: settings.fail_mode || 'fail_open',
        request_field_map: settings.request_field_map || '{"mobile":"phone","first_name":"firstname","last_name":"lastname"}',
        passthrough_fields: settings.passthrough_fields || '["lh_hlr_response","summary_score","first_name_match","last_name_match","country_code"]',
        min_summary_score: settings.min_summary_score || 0,
        phone_verified_source: settings.phone_verified_source || 'lh_hlr_response',
      });
    }
  }, [hlrArr]);

  const handleSave = async () => {
    setSaving(true);
    if (settings.id) {
      await base44.entities.HlrSettings.update(settings.id, form);
    } else {
      await base44.entities.HlrSettings.create(form);
    }
    toast.success('HLR settings saved');
    qc.invalidateQueries({ queryKey: ['hlr-settings'] });
    setSaving(false);
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    const resp = await testHlr({ phone: testPhone, firstname: testFirstname, lastname: testLastname });
    setTestResult(resp.data);
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
            <CardHeader><CardTitle className="text-[14px]">phone_verified Source</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Select value={form.phone_verified_source} onValueChange={v => setForm(p => ({ ...p, phone_verified_source: v }))}>
                <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="lh_hlr_response">lh_hlr_response (e.g. "Exact Match")</SelectItem>
                  <SelectItem value="summary_score">summary_score (numeric 0–100)</SelectItem>
                  <SelectItem value="boolean">boolean (true/false)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[12px] text-muted-foreground leading-relaxed">{phoneVerifiedSourceDescriptions[form.phone_verified_source]}</p>
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
            <CardHeader><CardTitle className="text-[14px]">Field Mapping</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-[12px]">Request Field Map (JSON)</Label>
                <p className="text-[11px] text-muted-foreground mb-1">Maps HLR request fields ← inbound payload fields. e.g. mobile from "phone"</p>
                <Input value={form.request_field_map} onChange={e => setForm(p => ({ ...p, request_field_map: e.target.value }))} className="mt-1 bg-background font-mono text-[12px]" />
              </div>
              <div>
                <Label className="text-[12px]">Passthrough Fields (JSON array)</Label>
                <p className="text-[11px] text-muted-foreground mb-1">HLR response fields to make available as {'{{tokens}}'}</p>
                <Input value={form.passthrough_fields} onChange={e => setForm(p => ({ ...p, passthrough_fields: e.target.value }))} className="mt-1 bg-background font-mono text-[12px]" />
              </div>
              <div><Label className="text-[12px]">Min Summary Score</Label><Input type="number" value={form.min_summary_score} onChange={e => setForm(p => ({ ...p, min_summary_score: Number(e.target.value) }))} className="mt-1 bg-background" /></div>
            </CardContent>
          </Card>

          <Button onClick={handleSave} disabled={saving} className="gap-1.5 w-full">
            <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save Settings'}
          </Button>
        </div>

        {/* Test Tool — server-side */}
        <div>
          <Card className="bg-card border-border">
            <CardHeader><CardTitle className="text-[14px]">Live Test Lookup (server-side)</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div><Label className="text-[12px]">Phone</Label><Input value={testPhone} onChange={e => setTestPhone(e.target.value)} placeholder="5402231670" className="mt-1 bg-background font-mono" /></div>
              <div><Label className="text-[12px]">First Name (firstname)</Label><Input value={testFirstname} onChange={e => setTestFirstname(e.target.value)} placeholder="Abigale" className="mt-1 bg-background" /></div>
              <div><Label className="text-[12px]">Last Name (lastname)</Label><Input value={testLastname} onChange={e => setTestLastname(e.target.value)} placeholder="Hart" className="mt-1 bg-background" /></div>
              <Button onClick={handleTest} disabled={testing || !testPhone} className="gap-1.5 w-full">
                {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                {testing ? 'Running...' : 'Run Test Lookup'}
              </Button>
              {testResult && <div className="mt-4"><JsonViewer data={testResult} title="HLR Response" /></div>}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}