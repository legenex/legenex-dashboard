import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { sendGmail } from '@/functions/sendGmail';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Save, Mail, CheckCircle2, Plug, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const TIMEZONES = [
  'UTC', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Sao_Paulo', 'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Africa/Johannesburg',
  'Asia/Dubai', 'Asia/Kolkata', 'Asia/Singapore', 'Asia/Tokyo', 'Australia/Sydney',
];

export default function SettingsProfile() {
  const { user, checkUserAuth } = useAuth();
  const [form, setForm] = useState({ full_name: '', email: '', timezone: 'UTC' });
  const [saving, setSaving] = useState(false);

  const [gmailFrom, setGmailFrom] = useState('');
  const [gmailLoading, setGmailLoading] = useState(true);

  useEffect(() => {
    if (user) {
      setForm({
        full_name: user.full_name || '',
        email: user.email || '',
        timezone: user.timezone || 'UTC',
      });
    }
  }, [user]);

  useEffect(() => {
    let active = true;
    (async () => {
      setGmailLoading(true);
      try {
        const res = await sendGmail({});
        const d = res?.data || {};
        if (active && d.connected) setGmailFrom(d.from || '');
      } catch { /* not connected */ }
      if (active) setGmailLoading(false);
    })();
    return () => { active = false; };
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await base44.auth.updateMe({ full_name: form.full_name, timezone: form.timezone });
      await checkUserAuth();
      toast.success('Profile saved');
    } catch {
      toast.error('Failed to save profile');
    }
    setSaving(false);
  };

  const connectGmail = () => {
    window.location.href = '/settings?tab=integrations';
  };

  const disconnectGmail = () => {
    toast.message('Disconnect Gmail from Settings → Integrations, where the connection is managed.');
    window.location.href = '/settings?tab=integrations';
  };

  return (
    <div className="max-w-2xl">
      <div className="text-[15px] font-semibold text-foreground mb-1">Profile</div>
      <div className="text-[13px] text-muted-foreground mb-6">Manage your name, email, timezone and Gmail connection.</div>

      <div className="bg-card border border-border rounded-[12px] p-5 space-y-4">
        <div>
          <Label className="text-[12px]">Name</Label>
          <Input
            value={form.full_name}
            onChange={(e) => setForm((p) => ({ ...p, full_name: e.target.value }))}
            placeholder="Your name"
            className="mt-1 bg-background text-[13px]"
          />
        </div>

        <div>
          <Label className="text-[12px]">Email</Label>
          <Input
            value={form.email}
            onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
            placeholder="you@example.com"
            className="mt-1 bg-background text-[13px]"
          />
          <div className="text-[11px] text-muted-foreground mt-1">Your sign-in email is managed by your account.</div>
        </div>

        <div>
          <Label className="text-[12px]">Timezone</Label>
          <Select value={form.timezone} onValueChange={(v) => setForm((p) => ({ ...p, timezone: v }))}>
            <SelectTrigger className="mt-1 bg-background text-[13px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {TIMEZONES.map(tz => <SelectItem key={tz} value={tz} className="text-[13px]">{tz}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="flex justify-end pt-1">
          <Button size="sm" onClick={save} disabled={saving} className="gap-1.5">
            <Save className="w-3.5 h-3.5" /> {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </div>

      <div className="bg-card border border-border rounded-[12px] p-5 mt-5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Mail className="w-5 h-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-semibold text-foreground">Gmail Integration</div>
            <div className="text-[12px] text-muted-foreground mt-0.5">Send and receive email notifications from your Gmail account.</div>

            <div className="flex items-center justify-between mt-4">
              {gmailLoading ? (
                <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Checking…</span>
              ) : gmailFrom ? (
                <span className="text-[11px] status-sold inline-flex items-center gap-1 font-medium"><CheckCircle2 className="w-3.5 h-3.5" /> Connected · {gmailFrom}</span>
              ) : (
                <span className="text-[11px] text-muted-foreground">Not connected</span>
              )}
              {gmailFrom ? (
                <Button size="sm" variant="outline" onClick={disconnectGmail}>Disconnect</Button>
              ) : (
                <Button size="sm" onClick={connectGmail} className="gap-1.5"><Plug className="w-3.5 h-3.5" /> Connect Gmail</Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}