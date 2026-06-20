import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import StatusPill from '@/components/shared/StatusPill';
import JsonViewer from '@/components/shared/JsonViewer';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Copy, RotateCcw, Trash2, Archive, Pencil } from 'lucide-react';
import { format } from 'date-fns';
import { processLead } from '@/functions/processLead';

export default function LeadDetailModal({ lead, open, onClose }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [editFields, setEditFields] = useState({});
  const [resending, setResending] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');

  if (!lead) return null;

  const handleCopyPayload = () => {
    navigator.clipboard.writeText(lead.raw_payload || '{}');
    toast.success('Payload copied');
  };

  const handleResend = async () => {
    setResending(true);
    try {
      const payload = JSON.parse(lead.raw_payload || '{}');
      // Find the API key for this lead
      const keys = await base44.entities.ApiKey.filter({ id: lead.supplier_key_id });
      const key = keys[0]?.key;
      if (!key) { toast.error('Supplier key not found'); return; }
      const resp = await processLead({ ...payload, _supplier_key: key });
      toast.success(`Resend result: ${resp.data?.Response || 'Unknown'}`);
      qc.invalidateQueries({ queryKey: ['leads'] });
    } catch (err) {
      toast.error('Resend failed');
    } finally {
      setResending(false);
    }
  };

  const handleArchive = async () => {
    await base44.entities.Lead.update(lead.id, { archived: true });
    toast.success('Lead archived');
    qc.invalidateQueries({ queryKey: ['leads'] });
    onClose();
  };

  const handleHardDelete = async () => {
    if (deleteConfirm !== 'DELETE') return;
    await base44.entities.Lead.delete(lead.id);
    toast.success('Lead permanently deleted');
    qc.invalidateQueries({ queryKey: ['leads'] });
    onClose();
  };

  const handleSaveEdit = async () => {
    await base44.entities.Lead.update(lead.id, editFields);
    toast.success('Lead updated');
    setEditing(false);
    qc.invalidateQueries({ queryKey: ['leads'] });
    onClose();
  };

  const startEdit = () => {
    setEditFields({
      first_name: lead.first_name || '',
      last_name: lead.last_name || '',
      mobile: lead.mobile || '',
      email: lead.email || '',
    });
    setEditing(true);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-[700px] bg-popover border-border max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <DialogTitle className="font-mono text-[14px] text-foreground">{lead.id}</DialogTitle>
            <StatusPill status={lead.final_status} size="lg" />
          </div>
          <div className="text-[12px] text-muted-foreground mt-1">
            {lead.supplier_name} — {lead.created_date ? format(new Date(lead.created_date), 'PPpp') : ''}
          </div>
        </DialogHeader>

        <Tabs defaultValue="summary" className="mt-4">
          <TabsList className="bg-muted">
            <TabsTrigger value="summary">Summary</TabsTrigger>
            <TabsTrigger value="raw">Raw Data</TabsTrigger>
            <TabsTrigger value="hlr">HLR Trace</TabsTrigger>
            <TabsTrigger value="leadbyte">LeadByte Trace</TabsTrigger>
          </TabsList>

          <TabsContent value="summary" className="space-y-4 mt-4">
            {editing ? (
              <div className="space-y-3">
                {['first_name', 'last_name', 'mobile', 'email'].map(f => (
                  <div key={f}>
                    <Label className="text-[12px] text-muted-foreground capitalize">{f.replace('_', ' ')}</Label>
                    <Input value={editFields[f] || ''} onChange={e => setEditFields(p => ({ ...p, [f]: e.target.value }))} className="mt-1 bg-background" />
                  </div>
                ))}
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleSaveEdit}>Save</Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {[
                  ['Name', `${lead.first_name || ''} ${lead.last_name || ''}`],
                  ['Mobile', lead.mobile],
                  ['Email', lead.email],
                  ['HLR Status', lead.hlr_status],
                  ['HLR Score', lead.hlr_summary_score],
                  ['LeadByte Status', lead.leadbyte_record_status],
                  ['LeadByte Lead ID', lead.leadbyte_lead_id],
                  ['Queue ID', lead.leadbyte_queue_id],
                  ['Process Time', lead.process_time_ms ? `${lead.process_time_ms}ms` : '—'],
                ].map(([label, val]) => (
                  <div key={label}>
                    <div className="text-[11px] text-muted-foreground uppercase tracking-wider">{label}</div>
                    <div className="text-[13px] text-foreground font-medium mt-0.5 font-mono">{val || '—'}</div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="raw" className="mt-4">
            <JsonViewer data={lead.raw_payload} title="Inbound Payload" />
          </TabsContent>

          <TabsContent value="hlr" className="mt-4 space-y-4">
            <JsonViewer data={lead.hlr_request} title="HLR Request" />
            <JsonViewer data={lead.hlr_response} title="HLR Response" />
            {lead.hlr_error && (
              <div className="bg-status-error rounded-lg p-3 text-[12px] status-error">{lead.hlr_error}</div>
            )}
          </TabsContent>

          <TabsContent value="leadbyte" className="mt-4 space-y-4">
            <JsonViewer data={lead.leadbyte_request} title="LeadByte Request" />
            <JsonViewer data={lead.leadbyte_response} title="LeadByte Response" />
          </TabsContent>
        </Tabs>

        {/* Actions */}
        <div className="flex items-center gap-2 mt-4 pt-4 border-t border-border flex-wrap">
          <Button variant="ghost" size="sm" onClick={startEdit} className="gap-1.5 text-primary">
            <Pencil className="w-3.5 h-3.5" /> Edit
          </Button>
          <Button variant="ghost" size="sm" onClick={handleResend} disabled={resending} className="gap-1.5 text-primary">
            <RotateCcw className="w-3.5 h-3.5" /> {resending ? 'Resending...' : 'Resend'}
          </Button>
          <Button variant="ghost" size="sm" onClick={handleCopyPayload} className="gap-1.5">
            <Copy className="w-3.5 h-3.5" /> Copy Payload
          </Button>
          <Button variant="ghost" size="sm" onClick={handleArchive} className="gap-1.5">
            <Archive className="w-3.5 h-3.5" /> Archive
          </Button>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1.5 text-destructive ml-auto">
                <Trash2 className="w-3.5 h-3.5" /> Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="bg-popover border-border">
              <AlertDialogHeader>
                <AlertDialogTitle>Permanently delete this lead?</AlertDialogTitle>
                <AlertDialogDescription>Type DELETE to confirm. This cannot be undone.</AlertDialogDescription>
              </AlertDialogHeader>
              <Input value={deleteConfirm} onChange={e => setDeleteConfirm(e.target.value)} placeholder="Type DELETE" className="bg-background" />
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleHardDelete} disabled={deleteConfirm !== 'DELETE'} className="bg-destructive text-destructive-foreground">
                  Delete Forever
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </DialogContent>
    </Dialog>
  );
}