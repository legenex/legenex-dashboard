import React, { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { toast } from 'sonner';
import SectionHeader from '@/components/shared/SectionHeader';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import { Loader2, Plus, ExternalLink, GitBranch, Users } from 'lucide-react';
import RouteMemberEditor from '@/components/distribution/RouteMemberEditor';
import BuyerDeliveriesPanel from '@/components/distribution/BuyerDeliveriesPanel';

const buyerLabel = (b) => b?.company_name || b?.name || b?.id || 'Unknown buyer';
function statusBadge(b) {
  const active = b?.status ? String(b.status).toLowerCase() === 'active' && b.active === true : b?.active === true;
  return active
    ? <Badge className="bg-emerald-500/15 text-emerald-600 text-[10px]">active</Badge>
    : <Badge variant="outline" className="text-[10px]">{b?.status || 'inactive'}</Badge>;
}

export default function DistributionBuyers() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: buyers = [], isLoading } = useQuery({ queryKey: ['buyers'], queryFn: () => base44.entities.Buyer.list('-created_date', 1000) });

  const selected = buyers.find((b) => b.id === id) || null;

  return (
    <div className="h-full flex flex-col min-h-0">
      <SectionHeader title="Buyers" subtitle="Buyer-centric routing, deliveries, and commercial summary" />
      <div className="flex-1 min-h-0 grid grid-cols-[280px_1fr] gap-4 overflow-hidden">
        {/* Buyer list */}
        <div className="border-r border-border overflow-y-auto pr-2 space-y-0.5">
          {isLoading && <div className="text-sm text-muted-foreground p-3"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Loading</div>}
          {!isLoading && buyers.length === 0 && <div className="text-sm text-muted-foreground p-3">No buyers.</div>}
          {buyers.map((b) => (
            <button
              key={b.id}
              onClick={() => navigate(`/distribution/buyers/${b.id}`)}
              className={`w-full text-left px-3 py-2 rounded-md text-[13px] flex items-center justify-between gap-2 ${
                id === b.id ? 'bg-primary/10 text-primary' : 'hover:bg-accent/40'
              }`}
            >
              <span className="truncate">{buyerLabel(b)}</span>
              {statusBadge(b)}
            </button>
          ))}
        </div>

        {/* Detail */}
        <div className="overflow-y-auto pr-2">
          {!selected && (
            <div className="text-sm text-muted-foreground p-6 flex items-center gap-2">
              <Users className="w-4 h-4" /> Select a buyer to manage routing, deliveries, and view its commercial summary.
            </div>
          )}
          {selected && <BuyerDetail buyer={selected} />}
        </div>
      </div>
    </div>
  );
}

function BuyerDetail({ buyer }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = ['routing', 'deliveries', 'summary'].includes(searchParams.get('tab')) ? searchParams.get('tab') : 'routing';
  const setTab = (v) => setSearchParams((p) => { p.set('tab', v); return p; }, { replace: true });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <span className="text-base font-medium">{buyerLabel(buyer)}</span>
          {statusBadge(buyer)}
        </div>
        <Button asChild size="sm" variant="ghost">
          <Link to="/operations/buyers"><ExternalLink className="w-3.5 h-3.5 mr-1" />Manage in Operations</Link>
        </Button>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="routing">Routing</TabsTrigger>
          <TabsTrigger value="deliveries">Deliveries</TabsTrigger>
          <TabsTrigger value="summary">Summary</TabsTrigger>
        </TabsList>

        <TabsContent value="routing" className="pt-3">
          <RoutingTab buyer={buyer} />
        </TabsContent>
        <TabsContent value="deliveries" className="pt-3">
          <BuyerDeliveriesPanel buyerId={buyer.id} />
        </TabsContent>
        <TabsContent value="summary" className="pt-3">
          <SummaryTab buyer={buyer} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Routing tab: this buyer's RouteMembers with the existing typed editor. Creating
// a member auto-attaches it to the chosen campaign's default RouteGroup (created
// lazily, lifecycle draft, if the campaign has none yet).
function RoutingTab({ buyer }) {
  const qc = useQueryClient();
  const [campaignId, setCampaignId] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorGroup, setEditorGroup] = useState(null);
  const [editorMember, setEditorMember] = useState(null);
  const [busy, setBusy] = useState(false);

  const { data: campaigns = [] } = useQuery({ queryKey: ['campaigns'], queryFn: () => base44.entities.Campaign.list('-created_date', 500) });
  const { data: groups = [] } = useQuery({ queryKey: ['routegroups'], queryFn: () => base44.entities.RouteGroup.list('-created_date', 1000) });
  const { data: members = [] } = useQuery({ queryKey: ['routemembers'], queryFn: () => base44.entities.RouteMember.list('-created_date', 5000) });

  const groupById = useMemo(() => Object.fromEntries(groups.map((g) => [g.id, g])), [groups]);
  const campaignById = useMemo(() => Object.fromEntries(campaigns.map((c) => [c.id, c])), [campaigns]);
  const buyerMembers = members.filter((m) => m.buyer_id === buyer.id);

  // Find (or lazily create) the default RouteGroup for a campaign.
  async function ensureDefaultGroup(cid) {
    const existing = groups
      .filter((g) => String(g.campaign_id) === String(cid))
      .sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
    if (existing.length) return existing[0];
    const created = await base44.entities.RouteGroup.create({
      campaign_id: cid, name: 'Default', method: 'priority', order_index: 0, lifecycle: 'draft', active: false,
    });
    await qc.invalidateQueries({ queryKey: ['routegroups'] });
    return created;
  }

  async function startCreate() {
    if (!campaignId) { toast.error('Pick a campaign first'); return; }
    setBusy(true);
    try {
      const group = await ensureDefaultGroup(campaignId);
      setEditorGroup(group);
      setEditorMember({ buyer_id: buyer.id, active: true, priority: 1, weight: 1, price_mode: 'fixed' });
      setEditorOpen(true);
    } catch (e) { toast.error(e.message || 'Could not prepare the default group'); } finally { setBusy(false); }
  }

  function startEdit(m) {
    setEditorGroup(groupById[m.route_group_id] || null);
    setEditorMember(m);
    setEditorOpen(true);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-end gap-2">
        <div className="w-64">
          <div className="text-xs text-muted-foreground mb-1">Campaign for new routing</div>
          <Select value={campaignId} onValueChange={setCampaignId}>
            <SelectTrigger className="h-8"><SelectValue placeholder="Select campaign" /></SelectTrigger>
            <SelectContent>{campaigns.map((c) => <SelectItem key={c.id} value={c.id}>{c.name || c.id}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <Button size="sm" onClick={startCreate} disabled={busy || !campaignId}>
          {busy ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Plus className="w-3.5 h-3.5 mr-1" />}Add routing
        </Button>
      </div>

      <div className="rounded-md border border-border divide-y divide-border">
        {buyerMembers.length === 0 && <div className="text-sm text-muted-foreground p-4">This buyer has no routing members yet.</div>}
        {buyerMembers.map((m) => {
          const g = groupById[m.route_group_id];
          const c = g && campaignById[g.campaign_id];
          return (
            <button key={m.id} onClick={() => startEdit(m)} className="w-full text-left px-3 py-2 flex items-center justify-between gap-3 hover:bg-accent/30 text-[13px]">
              <span className="flex items-center gap-2 min-w-0">
                <GitBranch className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">{c ? (c.name || c.id) : 'Unknown campaign'} · {g ? (g.name || 'group') : 'no group'}</span>
              </span>
              <span className="shrink-0 flex items-center gap-2 text-xs text-muted-foreground">
                <span>pri {m.priority ?? 1}</span>
                {m.price_mode === 'fixed' && m.fixed_price != null && <span>${m.fixed_price}</span>}
                {m.active === false ? <Badge variant="outline" className="text-[10px]">off</Badge> : <Badge className="bg-emerald-500/15 text-emerald-600 text-[10px]">on</Badge>}
              </span>
            </button>
          );
        })}
      </div>

      <RouteMemberEditor open={editorOpen} onOpenChange={setEditorOpen} group={editorGroup} member={editorMember} />
    </div>
  );
}

// Read-only commercial summary. Editing lives in Operations (single source of truth).
function SummaryTab({ buyer }) {
  const { data: wallets = [] } = useQuery({ queryKey: ['buyerwallets'], queryFn: () => base44.entities.BuyerWallet.list('-created_date', 2000) });
  const { data: stateCpl = [] } = useQuery({ queryKey: ['buyerstatecpl'], queryFn: () => base44.entities.BuyerStateCpl.list('-created_date', 5000).catch(() => []) });

  const wallet = wallets.find((w) => w.buyer_id === buyer.id) || null;
  const coverageCount = stateCpl.filter((r) => r.buyer_id === buyer.id).length;

  const rows = [
    ['Lifecycle', buyer.status ? `${buyer.status}${buyer.active === true ? ' (active)' : ''}` : (buyer.active === true ? 'active' : 'inactive')],
    ['Billing type', buyer.billing_type || buyer.billing_mode || 'unknown'],
    ['Wallet balance', wallet ? String(wallet.balance ?? 0) : 'no wallet record'],
    ['State coverage rules', String(coverageCount)],
  ];

  return (
    <div className="space-y-3 max-w-xl">
      <div className="rounded-md border border-border divide-y divide-border">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between px-3 py-2 text-[13px]">
            <span className="text-muted-foreground">{k}</span>
            <span className="font-medium">{v}</span>
          </div>
        ))}
      </div>
      <div className="text-xs text-muted-foreground">
        Pricing, lifecycle, and state coverage are edited in Operations, not here.
      </div>
      <Button asChild size="sm" variant="outline">
        <Link to="/operations/buyers"><ExternalLink className="w-3.5 h-3.5 mr-1" />Manage in Operations</Link>
      </Button>
    </div>
  );
}
