import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Save, Building2, Shield, Globe } from 'lucide-react';
import { toast } from 'sonner';

export default function SettingsGeneral() {
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);

  const { data: settingsArr = [] } = useQuery({
    queryKey: ['app-settings'],
    queryFn: () => base44.entities.AppSettings.list(),
  });

  const settings = settingsArr[0] || {};
  const [form, setForm] = useState(null);

  useEffect(() => {
    if (settingsArr.length > 0 && !form) {
      setForm({
        brand_name: settings.brand_name || '',
        brand_tagline: settings.brand_tagline || '',
        public_base_url: settings.public_base_url || '',
        default_fail_mode: settings.default_fail_mode || 'fail_open',
        require_trustedform_cert: settings.require_trustedform_cert ?? true,
        fb_api_version: settings.fb_api_version || 'v25.0',
        fb_api_version_auto: settings.fb_api_version_auto ?? true,
      });
    }
  }, [settingsArr]);

  const handleSave = async () => {
    setSaving(true);
    try {
      if (settings.id) {
        await base44.entities.AppSettings.update(settings.id, form);
      } else {
        await base44.entities.AppSettings.create(form);
      }
      toast.success('Settings saved');
      qc.invalidateQueries({ queryKey: ['app-settings'] });
    } catch (err) {
      toast.error(`Save failed: ${err.message || 'Unknown error'}`);
    }
    setSaving(false);
  };

  if (!form) return <div className="py-8 text-center text-muted-foreground">Loading...</div>;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-6">
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-[14px] flex items-center gap-2">
            <Building2 className="w-4 h-4 text-primary" /> Brand
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-[12px]">Brand Name</Label>
            <Input value={form.brand_name} onChange={e => setForm(p => ({ ...p, brand_name: e.target.value }))} className="mt-1 bg-background" placeholder="Legenex" />
          </div>
          <div>
            <Label className="text-[12px]">Brand Tagline</Label>
            <Input value={form.brand_tagline} onChange={e => setForm(p => ({ ...p, brand_tagline: e.target.value }))} className="mt-1 bg-background" placeholder="Lead Gateway" />
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-[14px] flex items-center gap-2">
            <Globe className="w-4 h-4 text-primary" /> Endpoint
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-[12px]">Public Base URL</Label>
            <Input value={form.public_base_url} onChange={e => setForm(p => ({ ...p, public_base_url: e.target.value }))} className="mt-1 bg-background font-mono text-[12px]" placeholder="https://api.legenex.com" />
            <p className="text-[11px] text-muted-foreground mt-1">The public URL suppliers send leads to.</p>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-[14px] flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" /> Pipeline Defaults
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-[12px]">Default Fail Mode</Label>
            <SearchableSelect
              value={form.default_fail_mode}
              onValueChange={v => setForm(p => ({ ...p, default_fail_mode: v }))}
              className="mt-1 w-full bg-background"
              options={[
                { value: 'fail_open', label: 'Fail Open - continue without data' },
                { value: 'fail_closed', label: 'Fail Closed - stop and error' },
                { value: 'forward_blank', label: 'Forward Blank - send empty fields' },
              ]}
            />
            <p className="text-[11px] text-muted-foreground mt-1">What happens when an external lookup (HLR, etc.) fails.</p>
          </div>
          <div className="flex items-center justify-between gap-3 pt-2 border-t border-border">
            <div>
              <Label className="text-[12px]">Require TrustedForm Cert</Label>
              <p className="text-[11px] text-muted-foreground mt-0.5">Leads without a valid cert are queued before delivery.</p>
            </div>
            <Switch checked={form.require_trustedform_cert} onCheckedChange={v => setForm(p => ({ ...p, require_trustedform_cert: v }))} />
          </div>
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={saving} className="gap-1.5">
        <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save Settings'}
      </Button>
      </div>

      <div>
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-[14px] flex items-center gap-2">
              <Shield className="w-4 h-4 text-primary" /> Lead Route Reference
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-[11px] text-muted-foreground">Set <code className="bg-muted px-1 rounded text-primary font-mono">lead_route</code> in the inbound payload to control routing. Matching uses a case-insensitive "contains" filter.</p>
            <div className="space-y-2">
              {[
                ['standard', 'Goes to Leadbyte (default)'],
                ['direct', 'Bypasses Leadbyte and allows all other delivery / event processing'],
                ['data', 'Allows leads to be sent to data partners'],
                ['event', 'Only allows leads to be sent to Conversion Events'],
                ['queue', 'Holds lead for manual processing'],
                ['test', 'Sends test lead to system and does nothing else - sits in system for testing'],
              ].map(([val, desc]) => (
                <div key={val} className="border border-border rounded-md p-2.5">
                  <div className="font-mono text-[12px] text-primary font-semibold">{val}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">{desc}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}