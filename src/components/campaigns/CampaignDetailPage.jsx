import React, { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { ArrowLeft, Loader2, Save, Plug, FlaskConical } from 'lucide-react';
import RouteMemberEditor from '@/components/distribution/RouteMemberEditor';
import BuyersRoutingTable from '@/components/campaigns/BuyersRoutingTable';
import BuyerConfigModal from '@/components/campaigns/BuyerConfigModal';
import CampaignStatsStrip from '@/components/campaigns/CampaignStatsStrip';
import CampaignSuppliers from '@/components/campaigns/CampaignSuppliers';
import CampaignBrands from '@/components/campaigns/CampaignBrands';

const METHOD_OPTS = [
  { value: 'direct_post', label: 'Direct Post' },
  { value: 'ping_post', label: 'Ping Post' },
  { value: 'both', label: 'Both' },
];
const DATE_RANGES = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Last 7 days' },
  { value: '14d', label: 'Last 14 days' },
  { value: '30d', label: 'Last 30 days' },
];

// Full-page campaign detail. Header (back, name + vertical, status, controls),
// stats strip + charts, then Campaign Routing with BUYERS / SUPPLIERS / BRANDS
// tabs. Buyer ordering, pause/enable, remove and per-buyer config write to real
// RouteMember fields. Suppliers/Brands reuse the existing components verbatim.
export default function CampaignDetailPage({ campaign, onBack }) {
  const qc = useQueryClient();
  const [tab, setTab] = useState('buyers');
  const [method, setMethod] = useState(campaign.send_mode || 'direct_post');
  const [dateRange, setDateRange] = useState('14d');
  const [savingMethod, setSavingMethod] = useState(false);

  useEffect(() => { setMethod(campaign.send_mode || 'direct_post'); }, [campaign.id, campaign.send_mode]);

  const { data: groups = [] } = useQuery({ queryKey: ['routeGroups'], queryFn: () => base44.entities.RouteGroup.list('-created_date', 1000) });
  const { data: buyers = [] } = useQuery({ queryKey: ['buyers'], queryFn: () => base44.entities.Buyer.list('-created_date', 500) });
  const { data: leads = [] } = useQuery({ queryKey: ['leads-metrics'], queryFn: () => base44.entities.Lead.list('-created_date', 1000) });

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

  const [order, setOrder] = useState([]);
  useEffect(() => { setOrder([...members].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))); }, [members]);

  const [memberOpen, setMemberOpen] = useState(false);
  const [configMember, setConfigMember] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [ensuring, setEnsuring] = useState(false);

  const active = campaign.active !== false;

  async function saveMethod() {
    setSavingMethod(true);
    try {
      await base44.entities.Campaign.update(campaign.id, { send_mode: method });
      await qc.invalidateQueries({ queryKey: ['campaigns'] });
      toast.success('Campaign saved');
    } catch (e) { toast.error(e?.message || 'Save failed'); } finally { setSavingMethod(false); }
  }

  async function ensureGroup() {
    setEnsuring(true);
    try {
      const res = await base44.functions.invoke('distributionConfig', {
        action: 'create_draft',
        group: { campaign_id: campaign.id, name: 'Default', method: 'priority', order_index: 0 },
      });
      const created = res?.data?.group || res?.data || {};
      await qc.invalidateQueries({ queryKey: ['routeGroups'] });
      if (created.id) setMemberOpen(true);
      toast.success('Default route group created');
    } catch (e) { toast.error('Could not create default group: ' + (e?.message || 'error')); } finally { setEnsuring(false); }
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
      toast.success('Buyer removed');
    } catch (e) { toast.error('Delete failed: ' + (e?.message || 'error')); }
    setDeleteTarget(null);
  }

  const TABS = [
    { key: 'buyers', label: 'BUYERS', count: order.length },
    { key: 'suppliers', label: 'SUPPLIERS' },
    { key: 'brands', label: 'BRANDS' },
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
              <span className={`inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-0.5 text-[11px] font-medium shrink-0 ${active ? 'text-primary' : 'text-muted-foreground'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-primary' : 'bg-muted-foreground'}`} />
                {active ? 'Active' : 'Disabled'}
              </span>
            </div>
            <div className="text-xs text-muted-foreground font-mono">{campaign.vertical || '--'}</div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="h-9 w-36 bg-background text-[13px]"><SelectValue /></SelectTrigger>
            <SelectContent>{DATE_RANGES.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={method} onValueChange={setMethod}>
            <SelectTrigger className="h-9 w-32 bg-background text-[13px]"><SelectValue /></SelectTrigger>
            <SelectContent>{METHOD_OPTS.map((mo) => <SelectItem key={mo.value} value={mo.value}>{mo.label}</SelectItem>)}</SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => toast.info('API details are managed per buyer')}><Plug className="w-4 h-4" />API</Button>
          <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => toast.info('Use the Payload Tester to test this campaign')}><FlaskConical className="w-4 h-4" />Test</Button>
          <Button size="sm" className="h-9 gap-1.5" onClick={saveMethod} disabled={savingMethod}>
            {savingMethod ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}Save
          </Button>
        </div>
      </div>

      {/* Stats strip + charts */}
      <CampaignStatsStrip campaign={campaign} leads={leads} />

      {/* Campaign Routing */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="flex items-center gap-1 border-b border-border px-4">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3.5 py-2.5 text-[13px] font-semibold tracking-wide border-b-2 -mb-px inline-flex items-center gap-1.5 ${tab === t.key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
            >
              {t.label}
              {t.count != null && <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-mono tabular-nums ${tab === t.key ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'}`}>{t.count}</span>}
            </button>
          ))}
        </div>

        <div className="p-4">
          {tab === 'buyers' && (
            !defaultGroup ? (
              <div className="px-4 py-10 text-center text-[13px] text-muted-foreground">
                <div className="mb-3">No routing group for this campaign yet.</div>
                <Button size="sm" onClick={ensureGroup} disabled={ensuring} className="gap-1.5">
                  {ensuring ? <Loader2 className="w-4 h-4 animate-spin" /> : null}Add first buyer
                </Button>
              </div>
            ) : membersLoading ? (
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
                onAdd={() => setMemberOpen(true)}
              />
            )
          )}
          {tab === 'suppliers' && <CampaignSuppliers />}
          {tab === 'brands' && <CampaignBrands />}
        </div>
      </div>

      {defaultGroup && (
        <RouteMemberEditor open={memberOpen} onOpenChange={setMemberOpen} group={defaultGroup} member={null} />
      )}
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
            <AlertDialogTitle>Remove this buyer?</AlertDialogTitle>
            <AlertDialogDescription>This removes {deleteTarget ? (buyerName[deleteTarget.buyer_id] || 'the buyer') : 'the buyer'} from this campaign. This cannot be undone.</AlertDialogDescription>
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