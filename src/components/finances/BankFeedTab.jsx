import React, { useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { categorizeTransactions } from '@/functions/categorizeTransactions';
import { syncMercury } from '@/functions/syncMercury';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Upload, Sparkles, Link2, ArrowDownUp, RefreshCw, CheckCircle2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { money } from '@/lib/reportMetrics';
import { unmatched } from '@/lib/financeMetrics';

const CAT_STYLE = {
  tech: 'bg-status-qualified status-qualified', media: 'bg-status-queued status-queued',
  personal: 'bg-muted text-muted-foreground', payouts: 'bg-status-unsold status-unsold',
  revenue: 'bg-status-sold status-sold', other: 'bg-muted text-muted-foreground',
};

export default function BankFeedTab() {
  const qc = useQueryClient();
  const fileRef = useRef();
  const [busy, setBusy] = useState(false);
  const [mercuryOpen, setMercuryOpen] = useState(false);
  const [mForm, setMForm] = useState({ api_token: '', account_id: '' });
  const [mSaving, setMSaving] = useState(false);
  const [mSyncing, setMSyncing] = useState(false);

  const { data: txns = [] } = useQuery({
    queryKey: ['bank-txns'],
    queryFn: () => base44.entities.BankTransaction.list('-date', 500),
  });

  const { data: mercuryCfg } = useQuery({
    queryKey: ['mercury-config'],
    queryFn: async () => (await base44.entities.IntegrationConfig.filter({ name: 'mercury' }))[0] || null,
  });
  const mercuryConnected = !!mercuryCfg;
  const mercuryMeta = (() => { try { return JSON.parse(mercuryCfg?.config || '{}'); } catch { return {}; } })();

  const openMercury = () => {
    setMForm({ api_token: '', account_id: mercuryMeta.account_id || '' });
    setMercuryOpen(true);
  };

  const saveMercury = async () => {
    if (!mForm.api_token.trim()) { toast.error('Enter your Mercury API token'); return; }
    setMSaving(true);
    try {
      const payload = JSON.stringify({ api_token: mForm.api_token.trim(), account_id: mForm.account_id.trim() || undefined });
      if (mercuryCfg?.id) await base44.entities.IntegrationConfig.update(mercuryCfg.id, { config: payload });
      else await base44.entities.IntegrationConfig.create({ name: 'mercury', config: payload });
      toast.success('Mercury connected — pulling transactions…');
      qc.invalidateQueries({ queryKey: ['mercury-config'] });
      setMercuryOpen(false);
      await runMercurySync();
    } catch { toast.error('Failed to save Mercury token'); }
    setMSaving(false);
  };

  const runMercurySync = async () => {
    setMSyncing(true);
    try {
      const res = await syncMercury({});
      const d = res?.data || {};
      if (d.success) toast.success(`Synced ${d.ingested} new transaction${d.ingested !== 1 ? 's' : ''} from Mercury`);
      else toast.error(d.error || 'Mercury sync failed');
      qc.invalidateQueries({ queryKey: ['bank-txns'] });
    } catch (e) { toast.error(e?.response?.data?.error || 'Mercury sync failed'); }
    setMSyncing(false);
  };

  const moneyIn = txns.filter(t => t.amount > 0).reduce((a, t) => a + Number(t.amount), 0);
  const moneyOut = txns.filter(t => t.amount < 0).reduce((a, t) => a + Number(t.amount), 0);
  const unmatchedTxns = unmatched(txns);

  const importCsv = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      const res = await base44.integrations.Core.ExtractDataFromUploadedFile({
        file_url,
        json_schema: {
          type: 'object',
          properties: {
            rows: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  date: { type: 'string' }, description: { type: 'string' }, amount: { type: 'number' },
                },
              },
            },
          },
        },
      });
      const rows = res?.output?.rows || res?.output || [];
      const clean = (Array.isArray(rows) ? rows : []).filter(r => r.date && r.amount != null).map(r => ({
        source: 'csv', date: String(r.date).slice(0, 10), description: r.description || '', amount: Number(r.amount) || 0,
      }));
      if (clean.length) await base44.entities.BankTransaction.bulkCreate(clean);
      toast.success(`Imported ${clean.length} transactions`);
      qc.invalidateQueries({ queryKey: ['bank-txns'] });
    } catch (err) {
      toast.error('Import failed - check the CSV format');
    }
    setBusy(false);
    e.target.value = '';
  };

  const runCategorize = async () => {
    setBusy(true);
    try {
      const res = await categorizeTransactions({});
      const d = res?.data || {};
      if (d.success) toast.success(`AI categorized ${d.updated} transactions`);
      else toast.error(d.error || 'Failed');
      qc.invalidateQueries({ queryKey: ['bank-txns'] });
    } catch { toast.error('Categorization failed'); }
    setBusy(false);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex gap-3">
          <div className="bg-card border border-border rounded-[10px] px-4 py-3">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Money In</div>
            <div className="text-[18px] font-bold status-sold font-mono">{money(moneyIn)}</div>
          </div>
          <div className="bg-card border border-border rounded-[10px] px-4 py-3">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Money Out</div>
            <div className="text-[18px] font-bold text-destructive font-mono">{money(moneyOut)}</div>
          </div>
          <div className="bg-card border border-border rounded-[10px] px-4 py-3">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Net</div>
            <div className="text-[18px] font-bold text-foreground font-mono">{money(moneyIn + moneyOut)}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={importCsv} />
          {mercuryConnected ? (
            <>
              <span className="text-[11px] status-sold inline-flex items-center gap-1 font-medium mr-1"><CheckCircle2 className="w-3.5 h-3.5" /> Mercury connected</span>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={runMercurySync} disabled={mSyncing}>
                <RefreshCw className={`w-3.5 h-3.5 ${mSyncing ? 'animate-spin' : ''}`} /> Sync Now
              </Button>
              <Button size="sm" variant="ghost" className="gap-1.5" onClick={openMercury}>
                <Link2 className="w-3.5 h-3.5" /> Reconnect
              </Button>
            </>
          ) : (
            <Button size="sm" variant="outline" className="gap-1.5" onClick={openMercury}>
              <Link2 className="w-3.5 h-3.5" /> Connect Mercury
            </Button>
          )}
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => fileRef.current?.click()} disabled={busy}>
            <Upload className="w-3.5 h-3.5" /> Import CSV
          </Button>
          <Button size="sm" className="gap-1.5" onClick={runCategorize} disabled={busy}>
            <Sparkles className="w-3.5 h-3.5" /> AI Categorize
          </Button>
        </div>
      </div>

      {unmatchedTxns.length > 0 && (
        <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
          <ArrowDownUp className="w-3.5 h-3.5" /> {unmatchedTxns.length} unmatched transaction{unmatchedTxns.length !== 1 ? 's' : ''} in the queue
        </div>
      )}

      <div className="bg-card border border-border rounded-[10px] overflow-hidden">
        <table className="w-full text-[12px]">
          <thead><tr className="border-b border-border bg-muted/40 text-[10px] text-muted-foreground uppercase tracking-wider">
            <th className="text-left px-4 py-2.5">Date</th><th className="text-left px-4 py-2.5">Description</th>
            <th className="text-left px-4 py-2.5">Category</th><th className="text-left px-4 py-2.5">Matched</th>
            <th className="text-right px-4 py-2.5">Amount</th>
          </tr></thead>
          <tbody className="divide-y divide-border">
            {txns.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">No transactions yet. Connect Mercury or import a CSV.</td></tr>}
            {txns.map(t => (
              <tr key={t.id} className="hover:bg-accent/30">
                <td className="px-4 py-2.5 font-mono text-muted-foreground">{t.date}</td>
                <td className="px-4 py-2.5 text-foreground truncate max-w-[280px]">{t.description || '-'}</td>
                <td className="px-4 py-2.5">{t.category ? <Badge variant="outline" className={`text-[10px] ${CAT_STYLE[t.category] || ''}`}>{t.category}{t.ai_categorized ? ' ✦' : ''}</Badge> : <span className="text-muted-foreground">—</span>}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{t.matched_entity_name || '—'}</td>
                <td className={`px-4 py-2.5 text-right font-mono ${t.amount >= 0 ? 'status-sold' : 'text-destructive'}`}>{money(t.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={mercuryOpen} onOpenChange={setMercuryOpen}>
        <DialogContent className="bg-popover border-border max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Connect Mercury</DialogTitle>
            <DialogDescription>Paste your Mercury API token to pull transactions live. CSV import stays available as a fallback.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-[12px]">Mercury API Token</Label>
              <Input value={mForm.api_token} onChange={e => setMForm(p => ({ ...p, api_token: e.target.value }))} type="password" placeholder="secret-token-…" className="mt-1 bg-background font-mono text-[12px]" />
              <p className="text-[11px] text-muted-foreground mt-1.5">Create a read token in Mercury → Settings → API tokens. Requires read access to transactions.</p>
            </div>
            <div>
              <Label className="text-[12px]">Account ID (optional)</Label>
              <Input value={mForm.account_id} onChange={e => setMForm(p => ({ ...p, account_id: e.target.value }))} placeholder="Leave blank to sync all accounts" className="mt-1 bg-background font-mono text-[12px]" />
            </div>
            {mercuryMeta.last_synced_at && <div className="text-[11px] text-muted-foreground">Last synced {new Date(mercuryMeta.last_synced_at).toLocaleString()}. Syncs automatically every hour.</div>}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setMercuryOpen(false)}>Cancel</Button>
            <Button onClick={saveMercury} disabled={mSaving} className="gap-1.5"><Save className="w-3.5 h-3.5" /> {mSaving ? 'Saving…' : 'Save & Sync'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}