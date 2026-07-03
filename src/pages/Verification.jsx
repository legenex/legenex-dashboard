import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import PageHeader from '@/components/shared/PageHeader';
import JsonViewer from '@/components/shared/JsonViewer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Loader2, Play, Save, Mail, Phone } from 'lucide-react';
import { testHlr } from '@/functions/testHlr';
import { testEmail } from '@/functions/testEmail';
import RouteSupplierFilters from '@/components/verification/RouteSupplierFilters';
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

const verdictStyles = {
  valid: 'bg-status-sold text-status-sold',
  invalid_format: 'bg-status-error text-status-error',
  disposable: 'bg-status-unsold text-status-unsold',
  no_dns_records: 'bg-status-error text-status-error',
  service_unavailable: 'bg-muted text-muted-foreground',
  unknown: 'bg-muted text-muted-foreground',
};

function parseJsonArray(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  try { const p = JSON.parse(val); return Array.isArray(p) ? p : []; } catch { return []; }
}

export default function Verification() {
  const qc = useQueryClient();
  const [testPhone, setTestPhone] = useState('');
  const [testFirstname, setTestFirstname] = useState('');
  const [testLastname, setTestLastname] = useState('');
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);

  const [testEmailInput, setTestEmailInput] = useState('');
  const [emailResult, setEmailResult] = useState(null);
  const [emailTesting, setEmailTesting] = useState(false);
  const [emailSaving, setEmailSaving] = useState(false);

  const { data: hlrArr = [] } = useQuery({
    queryKey: ['hlr-settings'],
    queryFn: () => base44.entities.HlrSettings.list(),
  });
  const { data: emailArr = [] } = useQuery({
    queryKey: ['email-settings'],
    queryFn: () => base44.entities.EmailValidationSettings.list(),
  });
  const { data: suppliers = [] } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => base44.entities.Supplier.filter({ active: true }),
  });
  const { data: customFields = [] } = useQuery({
    queryKey: ['custom-fields'],
    queryFn: () => base44.entities.CustomField.list(),
  });

  const settings = hlrArr[0] || {};
  const emailSettings = emailArr[0] || {};
  const [form, setForm] = useState(null);
  const [emailForm, setEmailForm] = useState(null);

  const emailValidField = customFields.find(f => f.system_role === 'email_valid');
  const phoneVerifiedField = customFields.find(f => f.system_role === 'phone_verified');

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
        filter_suppliers: parseJsonArray(settings.filter_suppliers),
        filter_supplier_types: parseJsonArray(settings.filter_supplier_types),
        filter_routes: parseJsonArray(settings.filter_routes),
      });
    }
  }, [hlrArr]);

  useEffect(() => {
    if (emailArr.length > 0 && !emailForm) {
      setEmailForm({
        enabled: emailSettings.enabled ?? true,
        filter_suppliers: parseJsonArray(emailSettings.filter_suppliers),
        filter_supplier_types: parseJsonArray(emailSettings.filter_supplier_types),
        filter_routes: parseJsonArray(emailSettings.filter_routes),
      });
    } else if (emailArr.length === 0 && !emailForm) {
      setEmailForm({ enabled: true, filter_suppliers: [], filter_supplier_types: [], filter_routes: [] });
    }
  }, [emailArr]);

  const handleSave = async () => {
    setSaving(true);
    const payload = {
      ...form,
      filter_suppliers: JSON.stringify(form.filter_suppliers || []),
      filter_supplier_types: JSON.stringify(form.filter_supplier_types || []),
      filter_routes: JSON.stringify(form.filter_routes || []),
    };
    try {
      if (settings.id) await base44.entities.HlrSettings.update(settings.id, payload);
      else await base44.entities.HlrSettings.create(payload);
      toast.success('HLR settings saved');
      qc.invalidateQueries({ queryKey: ['hlr-settings'] });
    } catch (e) {
      toast.error('Failed to save: ' + (e?.message || 'Unknown error'));
    }
    setSaving(false);
  };

  const handleEmailSave = async () => {
    setEmailSaving(true);
    const payload = {
      enabled: emailForm.enabled,
      filter_suppliers: JSON.stringify(emailForm.filter_suppliers || []),
      filter_supplier_types: JSON.stringify(emailForm.filter_supplier_types || []),
      filter_routes: JSON.stringify(emailForm.filter_routes || []),
    };
    try {
      if (emailSettings.id) await base44.entities.EmailValidationSettings.update(emailSettings.id, payload);
      else await base44.entities.EmailValidationSettings.create(payload);
      toast.success('Email validation settings saved');
      qc.invalidateQueries({ queryKey: ['email-settings'] });
    } catch (e) {
      toast.error('Failed to save: ' + (e?.message || 'Unknown error'));
    }
    setEmailSaving(false);
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    const resp = await testHlr({ phone: testPhone, firstname: testFirstname, lastname: testLastname });
    setTestResult(resp.data);
    setTesting(false);
  };

  const handleEmailTest = async () => {
    setEmailTesting(true);
    setEmailResult(null);
    try {
      const resp = await testEmail({ email: testEmailInput });
      setEmailResult(resp.data);
    } catch (e) {
      toast.error('Email validation failed');
    }
    setEmailTesting(false);
  };

  if (!form || !emailForm) return <div className="py-8 text-center text-muted-foreground">Loading...</div>;

  return (
    <div>
      <PageHeader title="Verification" subtitle="Phone and email verification services" />

      <Tabs defaultValue="phone" className="mt-2">
        <TabsList>
          <TabsTrigger value="phone" className="gap-1.5"><Phone className="w-3.5 h-3.5" /> Phone Verification</TabsTrigger>
          <TabsTrigger value="email" className="gap-1.5"><Mail className="w-3.5 h-3.5" /> Email Verification</TabsTrigger>
        </TabsList>

        {/* PHONE VERIFICATION (HLR) */}
        <TabsContent value="phone">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-4">
              {phoneVerifiedField && (
                <div className="flex items-center gap-2 px-3 py-2 bg-muted/40 border border-border rounded-lg">
                  <span className="text-[12px] text-muted-foreground">phone_verified field:</span>
                  <Badge variant="outline" className="font-mono text-[11px]">{`{{${phoneVerifiedField.field_name}}}`}</Badge>
                  <span className="text-[11px] text-muted-foreground ml-auto">Rename on the Custom Fields page</span>
                </div>
              )}
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
                <CardHeader><CardTitle className="text-[14px]">Scope - Suppliers & Routes</CardTitle></CardHeader>
                <CardContent>
                  <RouteSupplierFilters
                    suppliers={suppliers}
                    filter_suppliers={form.filter_suppliers}
                    filter_supplier_types={form.filter_supplier_types}
                    filter_routes={form.filter_routes}
                    onChange={partial => setForm(p => ({ ...p, ...partial }))}
                  />
                </CardContent>
              </Card>

              <Card className="bg-card border-border">
                <CardHeader><CardTitle className="text-[14px]">phone_verified Source</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <SearchableSelect
                    value={form.phone_verified_source}
                    onValueChange={v => setForm(p => ({ ...p, phone_verified_source: v }))}
                    className="bg-background"
                    options={[
                      { value: 'lh_hlr_response', label: 'lh_hlr_response (e.g. "Exact Match")' },
                      { value: 'summary_score', label: 'summary_score (numeric 0–100)' },
                      { value: 'boolean', label: 'boolean (true/false)' },
                    ]}
                  />
                  <p className="text-[12px] text-muted-foreground leading-relaxed">{phoneVerifiedSourceDescriptions[form.phone_verified_source]}</p>
                </CardContent>
              </Card>

              <Card className="bg-card border-border">
                <CardHeader><CardTitle className="text-[14px]">Fail Mode</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <SearchableSelect
                    value={form.fail_mode}
                    onValueChange={v => setForm(p => ({ ...p, fail_mode: v }))}
                    className="bg-background"
                    options={[
                      { value: 'fail_open', label: 'Fail Open' },
                      { value: 'fail_closed', label: 'Fail Closed' },
                      { value: 'forward_blank', label: 'Forward Blank' },
                    ]}
                  />
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
        </TabsContent>

        {/* EMAIL VERIFICATION */}
        <TabsContent value="email">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-4">
              {emailValidField && (
                <div className="flex items-center gap-2 px-3 py-2 bg-muted/40 border border-border rounded-lg">
                  <span className="text-[12px] text-muted-foreground">email_valid field:</span>
                  <Badge variant="outline" className="font-mono text-[11px]">{`{{${emailValidField.field_name}}}`}</Badge>
                  <span className="text-[11px] text-muted-foreground ml-auto">Rename on the Custom Fields page</span>
                </div>
              )}
              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="text-[14px]">Email Validation Settings</CardTitle>
                  <p className="text-[12px] text-muted-foreground">Enable per-route/per-supplier email validation. The result (Yes/No) is written to the email_valid system field and forwarded to destinations.</p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Switch checked={emailForm.enabled} onCheckedChange={v => setEmailForm(p => ({ ...p, enabled: v }))} />
                    <Label className="text-[12px]">Enabled</Label>
                  </div>
                  <RouteSupplierFilters
                    suppliers={suppliers}
                    filter_suppliers={emailForm.filter_suppliers}
                    filter_supplier_types={emailForm.filter_supplier_types}
                    filter_routes={emailForm.filter_routes}
                    onChange={partial => setEmailForm(p => ({ ...p, ...partial }))}
                  />
                  <Button onClick={handleEmailSave} disabled={emailSaving} className="gap-1.5 w-full">
                    <Save className="w-4 h-4" /> {emailSaving ? 'Saving...' : 'Save Settings'}
                  </Button>
                </CardContent>
              </Card>
            </div>

            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-[14px]">Email Validation Test</CardTitle>
                <p className="text-[12px] text-muted-foreground">Free validation service (Disify) - checks format, DNS/MX records, disposable domains and free providers. No API key required.</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="text-[12px]">Email Address</Label>
                  <Input
                    value={testEmailInput}
                    onChange={e => setTestEmailInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (testEmailInput && !emailTesting) handleEmailTest(); } }}
                    placeholder="name@example.com"
                    className="mt-1 bg-background font-mono"
                  />
                </div>
                <Button onClick={handleEmailTest} disabled={emailTesting || !testEmailInput} className="gap-1.5 w-full">
                  {emailTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                  {emailTesting ? 'Validating...' : 'Validate Email'}
                </Button>
                {emailResult && (
                  <div className="mt-2 rounded-lg border border-border bg-muted/30 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="text-[13px] text-muted-foreground">Verdict</div>
                      <Badge className={`${verdictStyles[emailResult.verdict] || verdictStyles.unknown} text-[11px]`}>
                        {emailResult.verdict?.replace(/_/g, ' ') || 'unknown'}
                      </Badge>
                    </div>
                    {emailResult.error ? (
                      <div className="text-status-error text-[13px]">{emailResult.error}</div>
                    ) : (
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3 text-[13px]">
                          <div><span className="text-muted-foreground">Email:</span> <span className="text-foreground font-mono">{emailResult.email}</span></div>
                          <div><span className="text-muted-foreground">Domain:</span> <span className="text-foreground font-mono">{emailResult.domain}</span></div>
                          <div><span className="text-muted-foreground">Format valid:</span> <span className="text-foreground">{String(emailResult.format)}</span></div>
                          <div><span className="text-muted-foreground">DNS valid:</span> <span className="text-foreground">{String(emailResult.dns)}</span></div>
                          <div><span className="text-muted-foreground">Disposable:</span> <span className="text-foreground">{String(emailResult.disposable)}</span></div>
                          <div><span className="text-muted-foreground">Free provider:</span> <span className="text-foreground">{String(emailResult.free)}</span></div>
                          <div><span className="text-muted-foreground">Role-based:</span> <span className="text-foreground">{String(emailResult.role)}</span></div>
                        </div>
                        {Array.isArray(emailResult.mx_records) && emailResult.mx_records.length > 0 && (
                          <div>
                            <div className="text-[12px] text-muted-foreground mb-1">MX Records</div>
                            <div className="space-y-1">
                              {emailResult.mx_records.map((mx, i) => (
                                <div key={i} className="font-mono text-[11px] text-foreground bg-muted rounded px-2 py-1">{mx}</div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}