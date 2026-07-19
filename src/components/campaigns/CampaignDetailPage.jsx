import React, { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { ArrowLeft, Loader2, Save, Plug, FlaskConical } from 'lucide-react';
import BuyersRoutingTable from '@/components/campaigns/BuyersRoutingTable';
import BuyerConfigModal from '@/components/campaigns/BuyerConfigModal';
import CampaignStatsStrip from '@/components/campaigns/CampaignStatsStrip';
import CampaignSuppliers from '@/components/campaigns/CampaignSuppliers';
import CampaignBrands from '@/components/campaigns/CampaignBrands';
import CampaignOverviewTab from '@/components/campaigns/CampaignOverviewTab';
import CampaignSettingsTab from '@/components/campaigns/CampaignSettingsTab';

function parseIds(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string' && raw.trim()) { try { const v = JSON.parse(raw); return Array.isArray(v) ? v : []; } catch { return []; } }
  return [];
}

// Full-page campaign detail. Header (back, name + vertical, GREEN status pill,
// Save/API/Test), stats strip + charts, then OVERVIEW / BUYERS / SUPPLIERS /
// BRANDS / SETTINGS tabs. Buyers are AUTO-POPULATED from every buyer linked to
// this campaign's vertical: a RouteMember is auto-created for each linked buyer
// that has none yet. The operator only orders, prices, caps, filters, configures,
// pauses or removes the routing entry (never the buyer). All writes hit existing
// RouteMember/Campaign/RouteGroup fields — no schema/engine/billing changes.
export default function CampaignDetailPage({ campaign, onBack }) {
  const qc = useQueryClient();
  const [tab, setTab] = useState('overview');
  const [savingHeader, setSavingHeader] = useState(false);

  const { data: groups = [], isLoading: groupsLoading } = useQuery({ queryKey: ['routeGroups'], queryFn: () => base44.entities.RouteGroup.list('-created_date', 1000) });
  const { data: buyers = [] } = useQuery({ queryKey: ['buyers'], queryFn: () => base44.entities.Buyer.list('-created_date', 500) });
  const { data: verticals = [] } = useQuery({ queryKey: ['verticals'], queryFn: () => base44.entities.Vertical.list('sort_order', 200) });
  const { data: leads = [] } = useQuery({ queryKey: ['leads-metrics'], queryFn: () => base44.entities.Lead.list('-created_date', 1000) });

  const verticalLabel = useMemo(() => {
    const code = String(campaign.vertical || '').toLowerCase();
    const v = verticals.find((x) => String(x.code || '').toLowerCase() === code);
    return v?.name || campaign.vertical || '--';
  }, [verticals, campaign.vertical]);

  const campaignGroups = useMemo(
    () => groups.filter((g) => String(g.campaign_id) === String(campaign.id)).sort((a, b) => (a.order_index || 0) - (b.order_index || 0)),
    [groups, campaign.id],
  );
  const defaultGroup = campaignGroups[0] || null;

  // Active buyers linked to this campaign's vertical (Operations Buyer.vertical field).
  const linkedBuyers = useMemo(() => {
    const code = String(campaign.vertical || '').toLowerCase();
    if (!code) return [];
    return buyers.filter((b) => b.active === true && String(b.vertical || '').toLowerCase() === code);
  }, [buyers, campaign.vertical]);

  const { data: members = [], isLoading: membersQueryLoading, fetchStatus: membersFetchStatus } = useQuery({
    queryKey: ['routeMembers', defaultGroup?.id],
    queryFn: () => (defaultGroup ? base44.entities.RouteMember.filter({ route_group_id: defaultGroup.id }) : []),
    enabled: !!defaultGroup,
  });
  // A disabled query stays in the "pending" (isLoading) state forever in React
  // Query v5. Only treat it as loading when it is actually fetching.
  const membersLoading = membersQueryLoading && membersFetchStatus === 'fetching';

  const buyerName = useMemo(() => Object.fromEntries(buyers.map((b) => [b.id, b.company_name || b.name || b.id])), [buyers]);
  const supplierCount = useMemo(() => parseIds(campaign.supplier_ids).length, [campaign.supplier_ids]);

  const [order, setOrder] = useState([]);
  useEffect(() => { setOrder([...members].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))); }, [members]);

  const [configMember, setConfigMember] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [syncing, setSyncing] = useState(false);

  const active = campaign.active !== false;
  const method = campaign.send_mode || 'direct_post';

  // Auto-populate: ensure a default group exists and every vertical-linked buyer
  // has a RouteMember in it. Runs when linked buyers or members change.
  useEffect(() => {
    let cancelled = false;
    async function sync() {
      if (!linkedBuyers.length || syncing) return;
      let group = defaultGroup;
      if (!group) {
        setSyncing(true);
        try {
          // Create the default routing group directly via the entities SDK.
          // (The distributionConfig backend function is not always deployed,
          // and its failure previously left this page stuck on "Loading buyers".)
          await base44.entities.RouteGroup.create({
            campaign_id: campaign.id, name: 'Default', method: 'priority', order_index: 0,
            lifecycle: 'draft', active: false,
          });
          await qc.invalidateQueries({ queryKey: ['routeGroups'] });
        } catch (e) {
          toast.error('Could not set up routing: ' + (e?.message || 'error'));
        } finally { if (!cancelled) setSyncing(false); }
        return; // let the refetched group re-run this effect
      }
      const existing = new Set(members.map((m) => String(m.buyer_id)));
      const missing = linkedBuyers.filter((b) => !existing.has(String(b.id)));
      if (!missing.length) return;
      setSyncing(true);
      try {
        const base = members.length;
        await base44.entities.RouteMember.bulkCreate(missing.map((b, i) => ({
          route_group_id: group.id,
          buyer_id: b.id,
          destination_name: b.company_name || b.name || null,
          active: true,
          priority: base + i + 1,
        })));
        await qc.invalidateQueries({ queryKey: ['routeMembers', group.id] });
      } catch (e) { toast.error('Could not link buyers: ' + (e?.message || 'error')); } finally { if (!cancelled) setSyncing(false); }
    }
    sync();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedBuyers, members, defaultGroup?.id]);

  async function saveHeader() {
    setSavingHeader(true);
    try {
      await qc.invalidateQueries({ queryKey: ['campaigns'] });
      toast.success('Campaign saved');
    } finally { setSavingHeader(false); }
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
  const move = (i, dir) => { const to = i + dir; if (to < 0 || to >= order.length) return; reorder(i, to); };

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
      toast.success('Buyer removed from campaign');
    } catch (e) { toast.error('Delete failed: ' + (e?.message || 'error')); }
    setDeleteTarget(null);
  }

  const TABS = [
    { key: 'overview', label: 'Overview' },
    { key: 'buyers', label: 'Buyers', count: order.length },
    { key: 'suppliers', label: 'Suppliers' },
    { key: 'brands', label: 'Brands' },
    { key: 'settings', label: 'Settings' },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-border pb-4 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={onBack} aria-label="Back to campaigns"><ArrowLeft className="w-5 h-5" /></Button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-lg font-medium truncate">{campaign.name || campaign.id}</span>
              <span className={`inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-0.5 text-[11px] font-medium shrink-0 ${active ? 'status-sold' : 'text-muted-foreground'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-[hsl(var(--chart-5))]' : 'bg-muted-foreground'}`} />
                {active ? 'Active' : 'Disabled'}
              </span>
            </div>
            <div className="text-xs text-muted-foreground">{verticalLabel}</div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => toast.info('API details are managed per buyer')}><Plug className="w-4 h-4" />API</Button>
          <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => toast.info('Use the Payload Tester to test this campaign')}><FlaskConical className="w-4 h-4" />Test</Button>
          <Button size="sm" className="h-9 gap-1.5" onClick={saveHeader} disabled={savingHeader}>
            {savingHeader ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}Save
          </Button>
        </div>
      </div>

      {/* Stats strip + charts */}
      <CampaignStatsStrip campaign={campaign} leads={leads} />

      {/* Tabs */}
      <div>
        <div className="flex items-center gap-1 border-b border-border overflow-x-auto no-scrollbar">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3.5 py-2.5 text-[13px] font-medium border-b-2 -mb-px inline-flex items-center gap-1.5 whitespace-nowrap ${tab === t.key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
            >
              {t.label}
              {t.count != null && <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-mono tabular-nums ${tab === t.key ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'}`}>{t.count}</span>}
            </button>
          ))}
        </div>

        <div className="pt-4">
          {tab === 'overview' && (
            <CampaignOverviewTab campaign={campaign} leads={leads} members={order} buyerName={buyerName} supplierCount={supplierCount} />
          )}
          {tab === 'buyers' && (
            !campaign.vertical ? (
              <div className="px-4 py-10 text-center text-[13px] text-muted-foreground">
                Set a vertical for this campaign in Settings so linked buyers appear here.
              </div>
            ) : (groupsLoading || membersLoading || (syncing && order.length === 0)) ? (
              <div className="px-4 py-10 text-center text-[13px] text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />Loading buyers...</div>
            ) : (
              <BuyersRoutingTable
                members={order}
                buyerName={buyerName}
                onReorder={reorder}
                onMove={move}
                onEdit={(m) => setConfigMember(m)}
                onToggle={toggleMember}
                onRemove={(m) => setDeleteTarget(m)}
              />
            )
          )}
          {tab === 'suppliers' && <CampaignSuppliers />}
          {tab === 'brands' && <CampaignBrands />}
          {tab === 'settings' && <CampaignSettingsTab campaign={campaign} defaultGroup={defaultGroup} />}
        </div>
      </div>

      <BuyerConfigModal
        open={!!configMember}
        onOpenChange={(v) => { if (!v) setConfigMember(null); }}
        member={configMember}
        buyerName={configMember ? (configMember.destination_name || buyerName[configMember.buyer_id]) : ''}
        method={method}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this buyer from the campaign?</AlertDialogTitle>
            <AlertDialogDescription>This removes {deleteTarget ? (buyerName[deleteTarget.buyer_id] || 'the buyer') : 'the buyer'} from this campaign's routing. The buyer record itself is not deleted.</AlertDialogDescription>
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