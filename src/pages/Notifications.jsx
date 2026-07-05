import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import SectionHeader from '@/components/shared/SectionHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, CheckCircle, XCircle } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

const conditionLabels = {
  errors_same_stage: 'N errors of the same stage within M minutes',
  hlr_unreachable: 'HLR provider unreachable',
  leadbyte_non_success: 'LeadByte returning non success',
  sold_rate_below: 'Sold rate drops below X percent over last N leads',
  api_error: 'API connector error',
  capi_failure: 'Facebook CAPI event failure',
  lead_queued: 'Lead queued at gate or by LeadByte',
  missing_fields: 'Required fields missing on inbound lead',
};

export default function Notifications() {
  const qc = useQueryClient();
  const [ruleModal, setRuleModal] = useState(false);
  const [editRule, setEditRule] = useState(null);

  const { data: rules = [] } = useQuery({
    queryKey: ['notification-rules'],
    queryFn: () => base44.entities.NotificationRule.list(),
  });

  const { data: events = [] } = useQuery({
    queryKey: ['notification-events'],
    queryFn: () => base44.entities.NotificationEvent.list('-created_date', 200),
  });

  const openCreate = () => {
    setEditRule({ name: '', condition_type: 'errors_same_stage', threshold_count: 5, window_minutes: 15, channels: '["email"]', recipients: '["admin@legenex.com"]', enabled: true });
    setRuleModal(true);
  };

  const openEdit = (rule) => {
    setEditRule({ ...rule });
    setRuleModal(true);
  };

  const saveRule = async () => {
    const data = { ...editRule };
    if (editRule.id) {
      await base44.entities.NotificationRule.update(editRule.id, data);
      toast.success('Rule updated');
    } else {
      await base44.entities.NotificationRule.create(data);
      toast.success('Rule created');
    }
    qc.invalidateQueries({ queryKey: ['notification-rules'] });
    setRuleModal(false);
  };

  return (
    <div>
      <SectionHeader title="Notifications" subtitle="Alert rules and notification history" />

      <Tabs defaultValue="rules">
        <TabsList className="bg-muted mb-4">
          <TabsTrigger value="rules">Rules</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="rules">
          <div className="flex justify-end mb-4">
            <Button size="sm" onClick={openCreate} className="gap-1.5"><Plus className="w-4 h-4" /> Add Rule</Button>
          </div>
          <div className="space-y-3">
            {rules.map(rule => (
              <div key={rule.id} className="bg-card border border-border rounded-[10px] p-4 flex items-center justify-between hover:border-primary/30 transition-colors cursor-pointer" onClick={() => openEdit(rule)}>
                <div>
                  <div className="text-[14px] font-medium text-foreground">{rule.name}</div>
                  <div className="text-[12px] text-muted-foreground mt-1">{conditionLabels[rule.condition_type] || rule.condition_type}</div>
                  <div className="flex gap-2 mt-2">
                    {rule.threshold_count && <Badge variant="outline" className="text-[10px]">Threshold: {rule.threshold_count}</Badge>}
                    {rule.window_minutes && <Badge variant="outline" className="text-[10px]">Window: {rule.window_minutes}m</Badge>}
                  </div>
                </div>
                <div className={`text-[12px] font-medium ${rule.enabled ? 'status-sold' : 'text-muted-foreground'}`}>
                  {rule.enabled ? 'Active' : 'Disabled'}
                </div>
              </div>
            ))}
            {rules.length === 0 && <div className="text-center py-8 text-muted-foreground text-[13px]">No rules configured</div>}
          </div>
        </TabsContent>

        <TabsContent value="history">
          <div className="bg-card border border-border rounded-[10px] overflow-hidden">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  {['Time', 'Summary', 'Channel', 'Delivered'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {events.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">No notifications fired yet</td></tr>}
                {events.map(ev => (
                  <tr key={ev.id} className="hover:bg-accent/50 transition-colors">
                    <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground">{ev.created_date ? format(new Date(ev.created_date), 'MMM dd HH:mm') : ''}</td>
                    <td className="px-4 py-3 text-foreground">{ev.summary}</td>
                    <td className="px-4 py-3"><Badge variant="outline" className="text-[10px]">{ev.channel}</Badge></td>
                    <td className="px-4 py-3">{ev.delivered ? <CheckCircle className="w-4 h-4 text-[#22C55E]" /> : <XCircle className="w-4 h-4 text-[#EF4444]" />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>

      {/* Rule Modal */}
      <Dialog open={ruleModal} onOpenChange={setRuleModal}>
        <DialogContent className="bg-popover border-border max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{editRule?.id ? 'Edit Rule' : 'New Rule'}</DialogTitle>
          </DialogHeader>
          {editRule && (
            <div className="space-y-4">
              <div><Label className="text-[12px]">Name</Label><Input value={editRule.name} onChange={e => setEditRule(p => ({ ...p, name: e.target.value }))} className="mt-1 bg-background" /></div>
              <div>
                <Label className="text-[12px]">Condition Type</Label>
                <Select value={editRule.condition_type} onValueChange={v => setEditRule(p => ({ ...p, condition_type: v }))}>
                  <SelectTrigger className="mt-1 bg-background"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(conditionLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-[12px]">Threshold Count</Label><Input type="number" value={editRule.threshold_count || ''} onChange={e => setEditRule(p => ({ ...p, threshold_count: Number(e.target.value) }))} className="mt-1 bg-background" /></div>
                <div><Label className="text-[12px]">Window (minutes)</Label><Input type="number" value={editRule.window_minutes || ''} onChange={e => setEditRule(p => ({ ...p, window_minutes: Number(e.target.value) }))} className="mt-1 bg-background" /></div>
              </div>
              <div><Label className="text-[12px]">Recipients (JSON array)</Label><Input value={editRule.recipients || '[]'} onChange={e => setEditRule(p => ({ ...p, recipients: e.target.value }))} className="mt-1 bg-background font-mono text-[12px]" /></div>
              <div className="flex items-center gap-2">
                <Switch checked={editRule.enabled} onCheckedChange={v => setEditRule(p => ({ ...p, enabled: v }))} />
                <Label className="text-[12px]">Enabled</Label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRuleModal(false)}>Cancel</Button>
            <Button onClick={saveRule}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}