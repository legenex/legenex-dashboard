import React, { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import JsonViewer from '@/components/shared/JsonViewer';
import SectionHeader from '@/components/shared/SectionHeader';
import { Plus, Save, Trash2, Play, Copy, Loader2, Send, FlaskConical, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { sendPayloadTest } from '@/functions/sendPayloadTest';

const EMPTY = { id: null, name: '', target_url: '', payload_template: '', test_data: '' };

const SAMPLE_TEMPLATE = `{
    "firstName": "[firstname]",
    "lastName": "[lastname]",
    "email": "[email]",
    "phoneMobile": "[phone1]",
    "shippingState": "[shippingState]",
    "incidentDate": "[incident_date]",
    "synopsis": "[accident_details]",
    "caseType": "Automobile Accident",
    "MethodOfContact": "Web Form"
}`;

const SAMPLE_DATA = `firstname: John
lastname: Smith
email: john.smith@example.com
phone1: 5551234567
shippingState: CA
incident_date: 2024-06-15
accident_details: Rear-end collision at intersection`;

export default function PayloadTester() {
  const qc = useQueryClient();
  const { data: tests = [], isLoading } = useQuery({
    queryKey: ['payloadTests'],
    queryFn: () => base44.entities.PayloadTest.list('-updated_date', 100),
  });

  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState({ ...EMPTY, payload_template: SAMPLE_TEMPLATE, test_data: SAMPLE_DATA });
  const [generated, setGenerated] = useState('');
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState(null);

  const selectTest = (t) => {
    setSelectedId(t.id);
    setForm({
      id: t.id,
      name: t.name || '',
      target_url: t.target_url || '',
      payload_template: t.payload_template || '',
      test_data: t.test_data || '',
    });
    setGenerated('');
    setSendResult(null);
  };

  const newTest = () => {
    setSelectedId(null);
    setForm({ ...EMPTY, payload_template: SAMPLE_TEMPLATE, test_data: SAMPLE_DATA });
    setGenerated('');
    setSendResult(null);
  };

  useEffect(() => {
    if (!selectedId && tests.length && !form.id) selectTest(tests[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tests]);

  const generate = async () => {
    if (!form.payload_template) { toast.error('Paste a payload template first'); return; }
    if (!form.test_data) { toast.error('Add some test data first'); return; }
    setGenerating(true); setSendResult(null);
    try {
      const prompt = `You are a payload builder. Given a JSON payload template containing [token] placeholders and a block of test data, produce the final populated JSON payload.

Rules:
- Replace every [token] placeholder with the best-matching value from the test data.
- Match tokens to data keys intelligently (e.g. [firstname] matches "firstname", "first_name", "First Name").
- If no matching value exists, keep the [token] placeholder unchanged.
- Output ONLY a valid JSON string of the fully populated payload. No explanation, no markdown, no code fences.

Payload template:
"""${form.payload_template}"""

Test data:
"""${form.test_data}"""`;

      const res = await base44.integrations.Core.InvokeLLM({
        prompt,
        response_json_schema: {
          type: 'object',
          properties: {
            payload: { type: 'string', description: 'The populated JSON payload as a valid JSON string' },
          },
        },
      });

      const payloadStr = res?.payload || '';
      try { setGenerated(JSON.stringify(JSON.parse(payloadStr), null, 2)); }
      catch { setGenerated(payloadStr); }
      toast.success('Payload generated');
    } catch (e) {
      toast.error('Generation failed: ' + (e.message || 'error'));
    }
    setGenerating(false);
  };

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      if (form.id) return base44.entities.PayloadTest.update(form.id, data);
      return base44.entities.PayloadTest.create(data);
    },
    onSuccess: (rec) => {
      qc.invalidateQueries({ queryKey: ['payloadTests'] });
      toast.success('Saved');
      if (rec?.id && !form.id) { setForm(f => ({ ...f, id: rec.id })); setSelectedId(rec.id); }
    },
    onError: (e) => toast.error('Save failed: ' + (e.message || 'error')),
  });

  const save = () => {
    if (!form.name) { toast.error('Give the test a name'); return; }
    if (!form.payload_template) { toast.error('Paste a payload template'); return; }
    saveMutation.mutate({
      name: form.name,
      target_url: form.target_url,
      payload_template: form.payload_template,
      test_data: form.test_data,
    });
  };

  const remove = async () => {
    if (!form.id) { setForm({ ...EMPTY, payload_template: SAMPLE_TEMPLATE, test_data: SAMPLE_DATA }); setSelectedId(null); return; }
    try {
      await base44.entities.PayloadTest.delete(form.id);
      qc.invalidateQueries({ queryKey: ['payloadTests'] });
      setForm({ ...EMPTY, payload_template: SAMPLE_TEMPLATE, test_data: SAMPLE_DATA });
      setSelectedId(null);
      setGenerated('');
      setSendResult(null);
      toast.success('Deleted');
    } catch (e) { toast.error('Delete failed'); }
  };

  const send = async () => {
    if (!form.target_url) { toast.error('Enter a target URL'); return; }
    if (!generated) { toast.error('Generate a payload first'); return; }
    setSending(true); setSendResult(null);
    try {
      const resp = await sendPayloadTest({ target_url: form.target_url, payload: generated });
      setSendResult(resp.data);
      if (resp.data?.ok) toast.success(`Sent - ${resp.data.status} ${resp.data.statusText || ''}`);
      else toast.error(`Buyer responded ${resp.data?.status || ''} ${resp.data?.statusText || ''}`);
    } catch (e) {
      setSendResult({ error: e.message });
      toast.error('Send failed: ' + (e.message || 'error'));
    }
    setSending(false);
  };

  const copyGenerated = () => {
    navigator.clipboard.writeText(generated);
    toast.success('Payload copied');
  };

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      <SectionHeader title="Payload Tester" subtitle="Paste a template and sample data, let AI build the payload, then test it against buyer endpoints." />

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        {/* Saved tests list */}
        <Card className="bg-card border-border h-fit">
          <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
            <CardTitle className="text-[13px]">Saved Tests</CardTitle>
            <Button size="sm" variant="outline" className="h-7 px-2 gap-1 text-[12px]" onClick={newTest}>
              <Plus className="w-3.5 h-3.5" /> New
            </Button>
          </CardHeader>
          <CardContent className="pt-0">
            {isLoading ? (
              <div className="text-[12px] text-muted-foreground py-4 text-center">Loading…</div>
            ) : tests.length === 0 ? (
              <div className="text-[12px] text-muted-foreground py-6 text-center">
                <FlaskConical className="w-6 h-6 mx-auto mb-2 opacity-40" />
                No saved tests yet
              </div>
            ) : (
              <div className="space-y-1">
                {tests.map(t => (
                  <button
                    key={t.id}
                    onClick={() => selectTest(t)}
                    className={`w-full text-left px-3 py-2 rounded-md text-[12px] font-medium transition-colors
                      ${selectedId === t.id ? 'bg-primary/10 text-primary' : 'text-sidebar-foreground hover:text-foreground hover:bg-sidebar-accent'}`}
                  >
                    <div className="truncate">{t.name}</div>
                    {t.target_url ? (
                      <div className="truncate text-[10px] text-muted-foreground mt-0.5 font-mono">{t.target_url}</div>
                    ) : null}
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Editor */}
        <div className="space-y-6">
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-[13px]">Test Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-[12px]">Test Name</Label>
                  <Input
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. LF6"
                    className="mt-1 bg-background"
                  />
                </div>
                <div>
                  <Label className="text-[12px]">Target URL</Label>
                  <Input
                    value={form.target_url}
                    onChange={e => setForm(f => ({ ...f, target_url: e.target.value }))}
                    placeholder="https://buyer.example.com/api/intake"
                    className="mt-1 bg-background font-mono text-[12px]"
                  />
                </div>
              </div>

              <div>
                <Label className="text-[12px]">Test Data</Label>
                <p className="text-[11px] text-muted-foreground mt-0.5">Paste raw sample values (JSON, key=value, or free text). AI maps these to the template tokens.</p>
                <Textarea
                  value={form.test_data}
                  onChange={e => setForm(f => ({ ...f, test_data: e.target.value }))}
                  placeholder={SAMPLE_DATA}
                  className="bg-background font-mono text-[12px] min-h-[120px] leading-relaxed mt-1"
                />
              </div>

              <div>
                <Label className="text-[12px]">Payload Builder</Label>
                <p className="text-[11px] text-muted-foreground mt-0.5">The JSON template with <code className="text-primary">[token]</code> placeholders. Paste from LeadByte.</p>
                <Textarea
                  value={form.payload_template}
                  onChange={e => setForm(f => ({ ...f, payload_template: e.target.value }))}
                  placeholder={SAMPLE_TEMPLATE}
                  className="bg-background font-mono text-[12px] min-h-[220px] leading-relaxed mt-1"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <Button onClick={generate} disabled={generating} className="gap-1.5">
                  {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  Generate Payload
                </Button>
                <Button onClick={save} disabled={saveMutation.isPending} variant="secondary" className="gap-1.5">
                  {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save Test
                </Button>
                <Button onClick={remove} variant="ghost" className="gap-1.5 text-destructive hover:text-destructive ml-auto">
                  <Trash2 className="w-4 h-4" /> Delete
                </Button>
              </div>
            </CardContent>
          </Card>

          {generated ? (
            <Card className="bg-card border-border">
              <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
                <CardTitle className="text-[13px]">Generated Payload</CardTitle>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="ghost" className="h-7 px-2 gap-1 text-[12px]" onClick={copyGenerated}>
                    <Copy className="w-3.5 h-3.5" /> Copy
                  </Button>
                  <Button size="sm" onClick={send} disabled={sending} className="gap-1.5">
                    {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    Send Test
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={generated}
                  onChange={e => setGenerated(e.target.value)}
                  className="bg-background font-mono text-[12px] min-h-[180px] leading-relaxed"
                />
              </CardContent>
            </Card>
          ) : null}

          {sendResult ? (
            <Card className="bg-card border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-[13px] flex items-center gap-2">
                  Buyer Response
                  <Badge className={sendResult.ok ? 'bg-status-sold text-green-400' : 'bg-status-error text-red-400'}>
                    {sendResult.ok ? 'Success' : 'Failed'} {sendResult.status ? `· ${sendResult.status}` : ''}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <JsonViewer data={sendResult} title="Response" />
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}