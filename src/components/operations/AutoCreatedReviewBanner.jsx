import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchAll } from '@/lib/fetchAll';
import { leadField } from '@/lib/reportMetrics';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Sparkles, Check, Trash2, Plus } from 'lucide-react';
import { toast } from 'sonner';

// Review banner for buyers and suppliers that inbound leads reference but that
// this system has no record for.
//
// Two sources feed it:
//   1. Records the inbound webhook already created on its own (auto_created).
//   2. Codes and names referenced on existing leads with no matching record.
//      The webhook only creates on the NEXT post, so without this a buyer named
//      on a lead months ago never surfaces at all.
//
// Anything created here is INERT: draft or new, inactive, no pricing, no state
// coverage and no payout terms. Those are operator decisions, and a lead payload
// must never be able to make something routable or billable.
const CONFIG = {
  buyer: {
    entity: 'Buyer',
    queryKey: ['buyers'],
    label: 'buyer',
    labelPlural: 'buyers',
    nameOf: (r) => r.company_name || r.buyer_code || 'Unnamed',
    codeOf: (r) => r.buyer_code,
    // Accepting clears the flag and leaves the record inactive on purpose.
    accept: { status: 'draft', active: false, auto_created: false },
    finishHint: 'Set pricing and state coverage before making it active.',
    // How a lead names this kind of record.
    refsFromLead: (l) => [
      l.buyer_id || leadField(l, 'buyer_id'),
      l.buyer_name || leadField(l, 'buyer'),
    ],
    matches: (r, ref) => {
      const n = (v) => String(v ?? '').trim().toLowerCase();
      return (n(r.buyer_code) && n(r.buyer_code) === n(ref))
        || (n(r.company_name) && n(r.company_name) === n(ref));
    },
    build: (ref) => ({
      company_name: ref,
      buyer_code: ref.length <= 8 ? ref : undefined,
      auto_created: true,
      status: 'draft',
      active: false,
      notes: 'Detected on an existing lead with no matching buyer record. No pricing or state coverage set.',
    }),
  },
  supplier: {
    entity: 'Supplier',
    queryKey: ['suppliers'],
    label: 'supplier',
    labelPlural: 'suppliers',
    nameOf: (r) => r.name || r.sid || 'Unnamed',
    codeOf: (r) => r.sid,
    accept: { status: 'new', active: false, auto_created: false },
    finishHint: 'Set payout terms before making it active.',
    refsFromLead: (l) => [l.supplier_name],
    matches: (r, ref) => {
      const n = (v) => String(v ?? '').trim().toLowerCase();
      return (n(r.sid) && n(r.sid) === n(ref)) || (n(r.name) && n(r.name) === n(ref));
    },
    build: (ref) => ({
      name: ref,
      sid: ref,
      supplier_type: 'External',
      auto_created: true,
      status: 'new',
      active: false,
      notes: 'Detected on an existing lead with no matching supplier record. No payout terms set.',
    }),
  },
};

export default function AutoCreatedReviewBanner({ kind }) {
  const cfg = CONFIG[kind];
  const qc = useQueryClient();
  const [busyId, setBusyId] = useState(null);
  const [discardTarget, setDiscardTarget] = useState(null);
  const [dismissed, setDismissed] = useState(() => new Set());

  const { data: records = [] } = useQuery({
    queryKey: [`auto-created-${kind}`],
    queryFn: () => base44.entities[cfg.entity].list('-created_date', 500),
  });

  // Leads are only read to find names with no record behind them. Limited fields.
  const { data: leads = [] } = useQuery({
    queryKey: [`unregistered-refs-${kind}`],
    queryFn: () => fetchAll((opts) => base44.entities.Lead.list('-created_date', opts.limit, opts.skip), {
      fields: undefined,
    }),
    staleTime: 60_000,
  });

  const pending = useMemo(
    () => (records || []).filter((r) => r.auto_created === true),
    [records],
  );

  // Referenced on a lead, matching no record at all.
  const unregistered = useMemo(() => {
    const out = new Map();
    for (const l of leads || []) {
      for (const raw of cfg.refsFromLead(l)) {
        const ref = String(raw ?? '').trim();
        if (!ref || ref === '-' || dismissed.has(ref)) continue;
        if ((records || []).some((r) => cfg.matches(r, ref))) continue;
        if (!out.has(ref)) out.set(ref, 0);
        out.set(ref, out.get(ref) + 1);
      }
    }
    return Array.from(out.entries())
      .map(([ref, count]) => ({ ref, count }))
      .sort((a, b) => b.count - a.count);
  }, [leads, records, dismissed, cfg]);

  if (pending.length === 0 && unregistered.length === 0) return null;

  const refresh = () => {
    qc.invalidateQueries({ queryKey: [`auto-created-${kind}`] });
    qc.invalidateQueries({ queryKey: [`unregistered-refs-${kind}`] });
    qc.invalidateQueries({ queryKey: cfg.queryKey });
  };

  const accept = async (r) => {
    setBusyId(r.id);
    try {
      // status and active are always written together.
      await base44.entities[cfg.entity].update(r.id, cfg.accept);
      refresh();
      toast.success(`${cfg.nameOf(r)} kept. ${cfg.finishHint}`);
    } catch (e) {
      toast.error(e?.message || 'Could not accept');
    } finally { setBusyId(null); }
  };

  const create = async (ref) => {
    setBusyId(ref);
    try {
      await base44.entities[cfg.entity].create(cfg.build(ref));
      refresh();
      toast.success(`${ref} created as a draft. ${cfg.finishHint}`);
    } catch (e) {
      toast.error(e?.message || 'Could not create');
    } finally { setBusyId(null); }
  };

  const discard = async () => {
    if (!discardTarget) return;
    setBusyId(discardTarget.id);
    try {
      await base44.entities[cfg.entity].delete(discardTarget.id);
      refresh();
      toast.success(`${cfg.nameOf(discardTarget)} discarded`);
    } catch (e) {
      toast.error(e?.message || 'Could not discard');
    } finally { setBusyId(null); setDiscardTarget(null); }
  };

  const total = pending.length + unregistered.length;

  return (
    <div className="bg-card border border-primary/40 rounded-lg p-4 space-y-3">
      <div className="flex items-start gap-2">
        <Sparkles className="w-4 h-4 text-primary mt-0.5 shrink-0" />
        <div>
          <div className="text-[13px] font-semibold text-primary">
            {total} {total === 1 ? cfg.label : cfg.labelPlural} referenced by inbound leads need review
          </div>
          <p className="text-[12px] text-muted-foreground leading-relaxed mt-0.5">
            Leads name {total === 1 ? `a ${cfg.label}` : cfg.labelPlural} with no record behind {total === 1 ? 'it' : 'them'}, so reports point at something that does not exist. Anything created here stays inactive with no pricing until you finish the setup.
          </p>
        </div>
      </div>

      <div className="rounded-md border border-border overflow-hidden">
        {pending.map((r) => (
          <div key={r.id} className="flex items-center justify-between gap-3 border-b border-border last:border-b-0 px-3 py-2 hover:bg-accent">
            <div className="min-w-0">
              <div className="text-[13px] text-foreground truncate">{cfg.nameOf(r)}</div>
              <div className="text-[11px] text-muted-foreground">
                {cfg.codeOf(r) ? <span className="font-mono">{cfg.codeOf(r)}</span> : null}
                <span className="ml-1">auto-created by the webhook</span>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px] gap-1 text-primary"
                disabled={busyId === r.id} onClick={() => accept(r)}>
                <Check className="w-3 h-3" /> Keep
              </Button>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                disabled={busyId === r.id} onClick={() => setDiscardTarget(r)} title="Discard">
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          </div>
        ))}

        {unregistered.map(({ ref, count }) => (
          <div key={ref} className="flex items-center justify-between gap-3 border-b border-border last:border-b-0 px-3 py-2 hover:bg-accent">
            <div className="min-w-0">
              <div className="text-[13px] text-foreground truncate font-mono">{ref}</div>
              <div className="text-[11px] text-muted-foreground">
                on {count} {count === 1 ? 'lead' : 'leads'}, no {cfg.label} record
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px] gap-1 text-primary"
                disabled={busyId === ref} onClick={() => create(ref)}>
                <Plus className="w-3 h-3" /> Create
              </Button>
              <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px] text-muted-foreground"
                onClick={() => setDismissed((p) => new Set(p).add(ref))}>
                Ignore
              </Button>
            </div>
          </div>
        ))}
      </div>

      <AlertDialog open={!!discardTarget} onOpenChange={(v) => { if (!v) setDiscardTarget(null); }}>
        <AlertDialogContent className="bg-popover border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Discard this {cfg.label}?</AlertDialogTitle>
            <AlertDialogDescription>
              This deletes "{discardTarget ? cfg.nameOf(discardTarget) : ''}". Leads already attributed to it keep the name on the lead record, so it will be detected again here. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={discard} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Discard</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
