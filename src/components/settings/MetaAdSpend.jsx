import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { metaAssets } from '@/functions/metaAssets';
import { syncMetaSpend } from '@/functions/syncMetaSpend';
import { validateMetaToken } from '@/functions/validateMetaToken';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Facebook, RefreshCw, Plus, Trash2, CheckCircle2, ShieldCheck, XCircle } from 'lucide-react';
import { toast } from 'sonner';

const SYNC_OPTIONS = [
  { value: '15m', label: 'Every 15 minutes' },
  { value: '1h', label: 'Hourly' },
  { value: '6h', label: 'Every 6 hours' },
  { value: 'daily', label: 'Daily' },
];

// Mask a token so only its last 4 characters are visible.
const maskToken = (tok) => {
  const s = String(tok || '');
  if (s.length <= 4) return '••••';
  return `••••••••${s.slice(-4)}`;
};

const genId = () => `tok_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

// Read the stored meta config, returning the IntegrationConfig record (or null) and parsed config object.
const loadMetaConfig = async () => {
  const list = await base44.entities.IntegrationConfig.filter({ name: 'meta' });
  const record = list[0] || null;
  let config = {};
  try { config = JSON.parse(record?.config || '{}'); } catch { config = {}; }
  return { record, config };
};

// Normalize whatever is stored into a tokens array, migrating a legacy single token.
const readTokens = (config) => {
  if (Array.isArray(config.tokens) && config.tokens.length) {
    return config.tokens.filter(t => t && t.token).map((t, i) => ({ id: t.id || `token_${i}`, label: t.label || `Token ${i + 1}`, token: t.token }));
  }
  const legacy = config.system_user_token || config.master_token || config.access_token || '';
  if (legacy) return [{ id: 'default', label: 'Default', token: legacy }];
  return [];
};

export default function MetaAdSpend() {
  const qc = useQueryClient();
  const [storedTokens, setStoredTokens] = useState([]);
  const [newLabel, setNewLabel] = useState('');
  const [newToken, setNewToken] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState('');
  const [removingId, setRemovingId] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [form, setForm] = useState(null);

  const { data: assets, refetch } = useQuery({
    queryKey: ['meta-assets'],
    queryFn: async () => (await metaAssets({})).data,
  });

  // Load the stored token list (labels + tokens for masking) alongside the live summary.
  useQuery({
    queryKey: ['meta-config-tokens'],
    queryFn: async () => {
      const { config } = await loadMetaConfig();
      const toks = readTokens(config);
      setStoredTokens(toks);
      return toks;
    },
  });

  const tokenSummaries = assets?.tokens || [];
  const validCount = tokenSummaries.filter(t => t.valid).length;
  const connected = validCount > 0;
  const adAccountCount = assets?.ad_accounts?.length || 0;

  const { data: mappings = [] } = useQuery({
    queryKey: ['adspend-mappings'],
    queryFn: () => base44.entities.AdSpendMapping.list('-created_date'),
  });
  const { data: verticals = [] } = useQuery({ queryKey: ['verticals'], queryFn: () => base44.entities.Vertical.list('sort_order') });
  const { data: brands = [] } = useQuery({ queryKey: ['brands'], queryFn: () => base44.entities.Brand.list() });
  const { data: suppliers = [] } = useQuery({ queryKey: ['suppliers'], queryFn: () => base44.entities.Supplier.list() });

  // Persist the given tokens array onto the meta config, then refresh both the
  // stored list and the live per-token summary from metaAssets.
  const persistTokens = async (tokens) => {
    const { record, config } = await loadMetaConfig();
    const payload = JSON.stringify({ ...config, tokens });
    if (record) await base44.entities.IntegrationConfig.update(record.id, { config: payload });
    else await base44.entities.IntegrationConfig.create({ name: 'meta', config: payload });
    setStoredTokens(tokens);
    await refetch();
    qc.invalidateQueries({ queryKey: ['meta-config-tokens'] });
  };

  const addToken = async () => {
    setAddError('');
    if (!newLabel.trim()) { toast.error('Enter a Business Manager label'); return; }
    if (!newToken.trim()) { toast.error('Enter a Meta system-user token'); return; }
    setAdding(true);
    try {
      // Validate the pasted token against the Graph API before saving it.
      const check = (await validateMetaToken({ token: newToken.trim() })).data || {};
      if (!check.valid) {
        setAddError(check.error || 'Meta rejected this token');
        setAdding(false);
        return;
      }
      const { config } = await loadMetaConfig();
      const current = readTokens(config);
      const next = [...current, { id: genId(), label: newLabel.trim(), token: newToken.trim() }];
      await persistTokens(next);
      setNewLabel(''); setNewToken('');
      const n = check.account_count || 0;
      toast.success(`Token added${check.account_name ? ` for ${check.account_name}` : ''}, reaching ${n} ad account${n === 1 ? '' : 's'}`);
    } catch (e) {
      setAddError(e?.response?.data?.error || 'Failed to validate token');
    }
    setAdding(false);
  };

  const removeToken = async (id) => {
    setRemovingId(id);
    try {
      const { config } = await loadMetaConfig();
      const next = readTokens(config).filter(t => t.id !== id);
      await persistTokens(next);
      toast.success('Token removed');
    } catch { toast.error('Failed to remove token'); }
    setRemovingId('');
  };

  // Refresh the live summary and show combined + per-token coverage.
  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const fresh = (await metaAssets({})).data;
      qc.setQueryData(['meta-assets'], fresh);
      const summaries = fresh?.tokens || [];
      setTestResult({
        total_accounts: fresh?.ad_accounts?.length || 0,
        valid: summaries.filter(t => t.valid).length,
        tokens: summaries,
      });
    } catch (e) {
      setTestResult({ error: e?.response?.data?.error || 'Connection test failed' });
    }
    setTesting(false);
  };

  const runSync = async () => {
    setSyncing(true);
    try {
      const res = await syncMetaSpend({});
      const d = res?.data || {};
      if (d.success) toast.success(`Synced ${d.rows_synced} spend rows from ${d.mappings} mappings`);
      else toast.error(d.error || 'Sync failed');
      qc.invalidateQueries({ queryKey: ['adspend'] });
    } catch (e) { toast.error(e?.response?.data?.error || 'Sync failed'); }
    setSyncing(false);
  };

  const openMap = () => {
    setForm({
      platform: 'meta', ad_account_id: '', ad_account_name: '', meta_campaign_id: '', meta_campaign_name: '',
      match_level: 'ad_account', vertical: '', brand: '', supplier_name: '', cost_source: 'Meta Ads', sync_interval: '1h', enabled: true,
    });
    setMapOpen(true);
  };

  const saveMapping = async () => {
    if (!form.ad_account_id) { toast.error('Select an ad account'); return; }
    const acct = (assets?.ad_accounts || []).find(a => a.id === form.ad_account_id);
    await base44.entities.AdSpendMapping.create({ ...form, ad_account_name: acct?.name || '' });
    qc.invalidateQueries({ queryKey: ['adspend-mappings'] });
    setMapOpen(false);
    toast.success('Mapping created');
  };

  const deleteMapping = async (id) => {
    await base44.entities.AdSpendMapping.delete(id);
    qc.invalidateQueries({ queryKey: ['adspend-mappings'] });
    toast.success('Mapping removed');
  };

  // Merge stored token metadata (label, masked value) with the live summary by id.
  const rows = storedTokens.map(st => {
    const summary = tokenSummaries.find(s => s.id === st.id) || {};
    return { ...st, valid: summary.valid, accounts: summary.accounts || 0, error: summary.error || '' };
  });

  return (
    <div className="space-y-5">
      {/* Connection card */}
      <div className="bg-card border border-border rounded-[12px] p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0"><Facebook className="w-5 h-5 text-primary" /></div>
            <div>
              <div className="text-[14px] font-semibold text-foreground">Meta (Facebook) Ads</div>
              <div className="text-[12px] text-muted-foreground mt-0.5">Add one system-user token per Business Manager to sync ad spend and calculate true CPL per supplier and source.</div>
              {connected && (
                <div className="text-[11px] status-sold inline-flex items-center gap-1 mt-1.5 font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Connected with {validCount} valid token{validCount === 1 ? '' : 's'}
                </div>
              )}
              {assets?.error && <div className="text-[11px] text-destructive mt-1.5">{assets.error}</div>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {connected && <Button size="sm" variant="outline" className="gap-1.5" onClick={testConnection} disabled={testing}><ShieldCheck className={`w-3.5 h-3.5 ${testing ? 'animate-pulse' : ''}`} /> Test connection and coverage</Button>}
            {connected && <Button size="sm" variant="outline" className="gap-1.5" onClick={runSync} disabled={syncing}><RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} /> Sync Now</Button>}
          </div>
        </div>

        {connected && (
          <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-border">
            {[
              { label: 'Business Managers', n: validCount },
              { label: 'Ad Accounts', n: adAccountCount },
              { label: 'Tokens', n: rows.length },
            ].map(s => (
              <div key={s.label} className="text-center">
                <div className="text-[18px] font-bold text-foreground font-mono">{s.n}</div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Token manager */}
        <div className="mt-4 pt-4 border-t border-border">
          <div className="text-[13px] font-semibold text-foreground mb-2">Business Manager Tokens</div>
          {rows.length === 0 ? (
            <p className="text-[12px] text-muted-foreground py-2">No tokens yet. Add a system-user token for each Business Manager below.</p>
          ) : (
            <div className="space-y-2">
              {rows.map(r => (
                <div key={r.id} className="flex items-center justify-between p-3 rounded-lg border border-border bg-background gap-3">
                  <div className="min-w-0">
                    <div className="text-[13px] text-foreground font-medium truncate">{r.label}</div>
                    <div className="text-[11px] text-muted-foreground font-mono mt-0.5">{maskToken(r.token)}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {r.valid === true ? (
                      <span className="text-[11px] status-sold inline-flex items-center gap-1 font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Valid · {r.accounts} account{r.accounts === 1 ? '' : 's'}
                      </span>
                    ) : r.valid === false ? (
                      <span className="text-[11px] status-error inline-flex items-center gap-1 font-medium max-w-[260px] truncate" title={r.error}>
                        <XCircle className="w-3.5 h-3.5 shrink-0" /> {r.error || 'Invalid token'}
                      </span>
                    ) : (
                      <span className="text-[11px] text-muted-foreground">Checking…</span>
                    )}
                    <button onClick={() => removeToken(r.id)} disabled={removingId === r.id} className="text-muted-foreground hover:text-destructive p-1 disabled:opacity-50"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add token */}
          <div className="grid grid-cols-1 md:grid-cols-[1fr_1.5fr_auto] gap-2 mt-3">
            <div>
              <Label className="text-[11px] text-muted-foreground">Business Manager label</Label>
              <Input value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder="e.g. Acme BM" className="mt-1 bg-background text-[13px]" />
            </div>
            <div>
              <Label className="text-[11px] text-muted-foreground">System-user token</Label>
              <Input value={newToken} onChange={e => { setNewToken(e.target.value); setAddError(''); }} type="password" placeholder="Long-lived system-user token" className="mt-1 bg-background font-mono text-[12px]" />
            </div>
            <div className="flex items-end">
              <Button size="sm" className="gap-1.5 w-full" onClick={addToken} disabled={adding}><Plus className="w-3.5 h-3.5" /> {adding ? 'Checking…' : 'Add'}</Button>
            </div>
          </div>
          {addError && (
            <div className="mt-2 text-[11px] status-error inline-flex items-start gap-1.5 font-medium">
              <XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {addError}
            </div>
          )}
          <p className="text-[11px] text-muted-foreground mt-1.5">Each token needs ads_read plus leads_retrieval plus pages_show_list. A system-user token reaches one Business Manager, so add one per Business Manager.</p>
        </div>

        {testResult && (
          <div className="mt-4 pt-4 border-t border-border">
            {testResult.error ? (
              <div className="p-3 rounded-lg bg-status-error border border-border">
                <div className="text-[12px] status-error inline-flex items-center gap-1.5 font-medium"><XCircle className="w-4 h-4" /> {testResult.error}</div>
              </div>
            ) : (
              <div className="p-3 rounded-lg bg-status-sold border border-border">
                <div className="text-[12px] status-sold inline-flex items-center gap-1.5 font-medium">
                  <CheckCircle2 className="w-4 h-4" /> {testResult.valid} valid token{testResult.valid === 1 ? '' : 's'} reaching {testResult.total_accounts} ad account{testResult.total_accounts === 1 ? '' : 's'} combined
                </div>
                <div className="mt-2 space-y-1 text-[11px]">
                  {testResult.tokens.map(t => (
                    <div key={t.id} className={t.valid ? 'text-foreground' : 'status-error'}>
                      <span className="font-medium">{t.label}:</span> {t.valid ? `valid, ${t.accounts} account${t.accounts === 1 ? '' : 's'}` : (t.error || 'invalid token')}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Mappings */}
      {connected && (
        <div className="bg-card border border-border rounded-[12px] p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-[13px] font-semibold text-foreground">Campaign Mappings</div>
              <div className="text-[12px] text-muted-foreground">Map ad accounts or campaigns to a vertical, brand and supplier.</div>
            </div>
            <Button size="sm" className="gap-1.5" onClick={openMap}><Plus className="w-3.5 h-3.5" /> Map to Campaign</Button>
          </div>
          {mappings.length === 0 ? (
            <p className="text-[13px] text-muted-foreground py-4 text-center">No mappings yet.</p>
          ) : (
            <div className="space-y-2">
              {mappings.map(m => (
                <div key={m.id} className="flex items-center justify-between p-3 rounded-lg border border-border bg-background">
                  <div className="min-w-0">
                    <div className="text-[13px] text-foreground truncate">{m.ad_account_name || m.ad_account_id} {m.meta_campaign_name && `· ${m.meta_campaign_name}`}</div>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                      <Badge variant="outline" className="text-[10px]">{m.match_level}</Badge>
                      {m.vertical && <Badge variant="outline" className="text-[10px]">{m.vertical}</Badge>}
                      {m.brand && <Badge variant="outline" className="text-[10px]">{m.brand}</Badge>}
                      {m.supplier_name && <Badge variant="outline" className="text-[10px]">{m.supplier_name}</Badge>}
                      <span className="text-[10px] text-muted-foreground">· sync {SYNC_OPTIONS.find(o => o.value === m.sync_interval)?.label}</span>
                    </div>
                  </div>
                  <button onClick={() => deleteMapping(m.id)} className="text-muted-foreground hover:text-destructive p-1"><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Mapping dialog */}
      <Dialog open={mapOpen} onOpenChange={setMapOpen}>
        <DialogContent className="bg-popover border-border max-w-[480px]">
          <DialogHeader><DialogTitle>Map to Campaign</DialogTitle></DialogHeader>
          {form && (
            <div className="space-y-3 max-h-[60vh] overflow-y-auto">
              <div>
                <Label className="text-[12px]">Ad Account *</Label>
                <Select value={form.ad_account_id} onValueChange={v => setForm(p => ({ ...p, ad_account_id: v }))}>
                  <SelectTrigger className="mt-1 bg-background text-[13px]"><SelectValue placeholder="Select ad account" /></SelectTrigger>
                  <SelectContent>{(assets?.ad_accounts || []).map(a => <SelectItem key={a.id} value={a.id}>{a.name} ({a.account_id})</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[12px]">Match Level</Label>
                <Select value={form.match_level} onValueChange={v => setForm(p => ({ ...p, match_level: v }))}>
                  <SelectTrigger className="mt-1 bg-background text-[13px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ad_account">Ad Account</SelectItem>
                    <SelectItem value="campaign">Campaign</SelectItem>
                    <SelectItem value="ad_set">Ad Set</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.match_level !== 'ad_account' && (
                <div>
                  <Label className="text-[12px]">Meta Campaign ID</Label>
                  <Input value={form.meta_campaign_id} onChange={e => setForm(p => ({ ...p, meta_campaign_id: e.target.value }))} placeholder="Campaign / ad set id" className="mt-1 bg-background font-mono text-[12px]" />
                </div>
              )}
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-[12px]">Vertical</Label>
                  <Select value={form.vertical} onValueChange={v => setForm(p => ({ ...p, vertical: v }))}>
                    <SelectTrigger className="mt-1 bg-background text-[13px]"><SelectValue placeholder="Any" /></SelectTrigger>
                    <SelectContent>{verticals.map(v => <SelectItem key={v.id} value={v.code}>{v.code}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[12px]">Brand</Label>
                  <Select value={form.brand} onValueChange={v => setForm(p => ({ ...p, brand: v }))}>
                    <SelectTrigger className="mt-1 bg-background text-[13px]"><SelectValue placeholder="Any" /></SelectTrigger>
                    <SelectContent>{brands.map(b => <SelectItem key={b.id} value={b.brand_code}>{b.brand_code}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[12px]">Supplier</Label>
                  <Select value={form.supplier_name} onValueChange={v => setForm(p => ({ ...p, supplier_name: v }))}>
                    <SelectTrigger className="mt-1 bg-background text-[13px]"><SelectValue placeholder="Any" /></SelectTrigger>
                    <SelectContent>{suppliers.map(s => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[12px]">Cost Source</Label>
                  <Input value={form.cost_source} onChange={e => setForm(p => ({ ...p, cost_source: e.target.value }))} className="mt-1 bg-background text-[13px]" />
                </div>
                <div>
                  <Label className="text-[12px]">Auto-Sync</Label>
                  <Select value={form.sync_interval} onValueChange={v => setForm(p => ({ ...p, sync_interval: v }))}>
                    <SelectTrigger className="mt-1 bg-background text-[13px]"><SelectValue /></SelectTrigger>
                    <SelectContent>{SYNC_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setMapOpen(false)}>Cancel</Button>
            <Button onClick={saveMapping}>Create Mapping</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}