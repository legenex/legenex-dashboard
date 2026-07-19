import React, { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import { MultiSelect } from '@/components/ui/multi-select';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { ArrowLeft, Loader2, Plus, Save, Zap } from 'lucide-react';
import RouteMemberEditor from '@/components/distribution/RouteMemberEditor';
import DestinationsTable from '@/components/campaigns/DestinationsTable';
import DestinationConfigModal from '@/components/campaigns/DestinationConfigModal';

// Full-page campaign detail. Header (name, back, status), Campaign Routing with
// Sources/Destinations tabs, and a Triggers & Automations section. Ordering,
// pause/enable, remove, and per-destination config all write to real
// RouteMember fields. No routing engine / processLead changes.
export default function CampaignDetailPage({ campaign, onBack }) {
  const qc = useQueryClient();
  const [tab, setTab] = useState('destinations');

  const { data: groups = [] } = useQuery({ queryKey: ['routeGroups'], queryFn: () => base44.entities.RouteGroup.list('-created_date', 1000) });
  const { data: suppliers = [] } = useQuery({ queryKey: ['suppliers'], queryFn: () => base44.entities.Supplier.list('-created_date', 1000) });
  const { data: verticals = [] } = useQuery({ queryKey: ['verticals'], queryFn: () => base44.entities.Vertical.list('-created_date', 500) });
  const { data: buyers = [] } = useQuery({ queryKey: ['buyers'], queryFn: () => base44.entities.Buyer.list('-created_date', 500) });

  const campaignGroups = useMemo(
    () => groups.filter((g) => String(g.campaign_id) === String(campaign.id)).sort((a, b) => (a.order_index || 0) - (b.order_index || 0)),
    [groups, campaign.id],
  );
  const defaultGroup = campaignGroups[0] || null;

  const { data: members = [], isLoading: membersLoading } = useQuery({
    queryKey: ['routeMembers', defaultGroup?.id],
    queryFn: () => (defaultGroup ? base44.entities.RouteMember.filter({ route_group_id: defaultGroup.id }) : []),
    enabled: !!defaultGroup,
  });

  const buyerName = useMemo(() => Object.fromEntries(buyers.map((b) => [b.id, b.company_name || b.name || b.id])), [buyers]);

  // Local ordering mirrors persisted priority.
  const [order, setOrder] = useState([]);
  useEffect(() => { setOrder([...members].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))); }, [members]);

  // Sources config edits the Campaign record directly.
  const [supplierIds, setSupplierIds] = useState(Array.isArray(campaign.supplier_ids) ? campaign.supplier_ids : []);
  const [savingSources, setSavingSources] = useState(false);
  useEffect(() => { setSupplierIds(Array.isArray(campaign.supplier_ids) ? campaign.supplier_ids : []); }, [campaign.id, campaign.supplier_ids]);

  const [memberOpen, setMemberOpen] = useState(false);
  const [configMember, setConfigMember] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const active = campaign.active !== false;
  const supplierOptions = suppliers.map((s) => ({ value: s.id, label: s.name || s.company_name || s.id }));
  const sourceCount = supplierIds.length;

  async function saveSources() {
    setSavingSources(true);
    try {
      await base44.entities.Campaign.update(campaign.id, { supplier_ids: supplierIds });
      await qc.invalidateQueries({ queryKey: ['campaigns'] });
      toast.success('Sources updated');
    } catch (e) { toast.error(e.message || 'Save failed'); } finally { setSavingSources(false); }
  }

  async function persistOrder(next) {
    const updates = [];
    next.forEach((m, i) => { const pri = i + 1; if ((m.priority ?? null) !== pri) updates.push({ id: m.id, pri }); });
    setOrder(next.map((m, i) => ({ ...m, priority: i + 1 })));
    try {
      for (const u of updates) await base44.entities.RouteMember.update(u.id, { priority: u.pri });
      await qc.invalidateQueries({ queryKey: ['routeMembers', defaultGroup.id] });
      if (updates.length) toast.success('Order updated');
    } catch (e) { toast.error('Reorder failed: ' + (e?.message || 'error')); }
  }

  const reorder = (from, to) => {
    const next = [...order];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    persistOrder(next);
  };
  const move = (i, dir) => {
    const to = i + dir;
    if (to < 0 || to >= order.length) return;
    reorder(i, to);
  };

  async function toggleMember(m) {
    try {
      await base44.entities.RouteMember.update(m.id, { active: m.active === false });
      await qc.invalidateQueries({ queryKey: ['routeMembers', defaultGroup.id] });
    } catch (e) { toast.error('Update failed: ' + (e?.message || 'error')); }
  }

  async function removeMember(m) {
    try {
      await base44.entities.RouteMember.delete(m.id);
      await qc.invalidateQueries({ queryKey: ['routeMembers', defaultGroup.id] });
      toast.success('Destination removed');
    } catch (e) { toast.error('Delete failed: ' + (e?.message || 'error')); }
    setDeleteTarget(null);
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-border pb-4">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={onBack} aria-label="Back to campaigns"><ArrowLeft className="w-5 h-5" /></Button>
          <div className="min-w-0">
            <div className="text-lg font-medium truncate">{campaign.name || campaign.id}</div>
            <div className="text-xs text-muted-foreground">Campaign routing configuration</div>
          </div>
        </div>
        <span className={`inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-medium shrink-0 ${active ? 'text-primary' : 'text-muted-foreground'}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-primary' : 'bg-muted-foreground'}`} />
          {active ? 'Active' : 'Off'}
        </span>
      </div>

      {/* Campaign Routing */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="flex items-center gap-1 border-b border-border px-4">
          <button onClick={() => setTab('sources')} className={`px-3.5 py-2.5 text-[13px] font-medium border-b-2 -mb-px inline-flex items-center gap-1.5 ${tab === 'sources' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            Sources
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-mono tabular-nums ${tab === 'sources' ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'}`}>{sourceCount}</span>
          </button>
          <button onClick={() => setTab('destinations')} className={`px-3.5 py-2.5 text-[13px] font-medium border-b-2 -mb-px inline-flex items-center gap-1.5 ${tab === 'destinations' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            Destinations
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-mono tabular-nums ${tab === 'destinations' ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'}`}>{order.length}</span>
          </button>
        </div>

        <div className="p-4">
          {tab === 'sources' ? (
            <div className="space-y-4 max-w-xl">
              <div>
                <Label className="text-[12px] font-medium">Suppliers feeding this campaign</Label>
                <div className="mt-1"><MultiSelect options={supplierOptions} value={supplierIds} onValueChange={setSupplierIds} placeholder="Assign suppliers" /></div>
              </div>
              <div className="flex justify-end">
                <Button size="sm" onClick={saveSources} disabled={savingSources} className="gap-1.5">
                  {savingSources ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}Save sources
                </Button>
              </div>
            </div>
          ) : !defaultGroup ? (
            <div className="px-4 py-10 text-center text-[13px] text-muted-foreground">No routing group for this campaign yet. Add a destination to create it.</div>
          ) : membersLoading ? (
            <div className="px-4 py-10 text-center text-[13px] text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />Loading destinations...</div>
          ) : (
            <DestinationsTable
              members={order}
              buyerName={buyerName}
              onReorder={reorder}
              onMove={move}
              onEdit={(m) => setConfigMember(m)}
              onToggle={toggleMember}
              onRemove={(m) => setDeleteTarget(m)}
              onAdd={() => setMemberOpen(true)}
            />
          )}
        </div>
      </div>

      {/* Triggers & Automations */}
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-muted-foreground" />
            <div className="text-[13px] font-medium">Triggers &amp; Automations</div>
          </div>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => toast.info('Trigger builder is not wired in this layout')}><Plus className="w-4 h-4" />Add Trigger</Button>
        </div>
        <p className="text-[12px] text-muted-foreground mt-2">No triggers configured for this campaign.</p>
      </div>

      {defaultGroup && (
        <RouteMemberEditor open={memberOpen} onOpenChange={setMemberOpen} group={defaultGroup} member={null} />
      )}
      <DestinationConfigModal
        open={!!configMember}
        onOpenChange={(v) => { if (!v) setConfigMember(null); }}
        member={configMember}
        buyerName={configMember ? (configMember.destination_name || buyerName[configMember.buyer_id]) : ''}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this destination?</AlertDialogTitle>
            <AlertDialogDescription>This removes {deleteTarget ? (buyerName[deleteTarget.buyer_id] || 'the destination') : 'the destination'} from this campaign. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); if (deleteTarget) removeMember(deleteTarget); }}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}